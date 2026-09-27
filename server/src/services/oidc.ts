/* Damvia - Open Source Digital Asset Manager
Copyright (C) 2024  Arnaud DE SAINT JEAN
This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <https://www.gnu.org/licenses/>. */
import { sign, verify } from 'jsonwebtoken'
import { loadEsm } from 'load-esm'
import { In } from 'typeorm'
import { Group } from '../entity/group'
import { Region } from '../entity/region'
import { User, UserRole } from '../entity/user'
import { UserGroup } from '../entity/user-group'
import { apiURL, dataSource, OidcSettings, oidcSettings, secret } from '../env'

type OpenIdClient = typeof import('openid-client')
const openIdClient = () => loadEsm<OpenIdClient>('openid-client')

export const OIDC_COOKIE = 'damvia_oidc'

export class OidcSignInError extends Error {
	constructor(readonly reason: 'failed' | 'no_account' | 'suspended' | 'email_unverified' | 'conflict') {
		super(reason)
	}
}

export function oidcCallbackURL() {
	return `${apiURL()}/v1/auth/oidc/callback`
}

// Only a path on the client may follow sign-in, never another site.
export function safeRedirect(path: unknown): string {
	return typeof path === 'string' && /^\/(?![/\\])/.test(path) ? path : '/'
}

let configuration: Promise<import('openid-client').Configuration> | null = null
function discover(settings: OidcSettings) {
	configuration ??= openIdClient()
		.then((client) => client.discovery(new URL(settings.issuer), settings.clientId, settings.clientSecret))
		.catch((error) => {
			configuration = null
			throw error
		})
	return configuration
}

type Pending = { state: string, nonce: string, verifier: string, redirect: string }

// PKCE, state and nonce are kept in a signed cookie for the ten minutes the
// round trip to the identity provider may take.
export async function startOidcSignIn(redirect: string): Promise<{ url: string, cookie: string }> {
	const settings = oidcSettings()
	if (!settings) throw new OidcSignInError('failed')
	const client = await openIdClient()
	const config = await discover(settings)
	const verifier = client.randomPKCECodeVerifier()
	const pending: Pending = { state: client.randomState(), nonce: client.randomNonce(), verifier, redirect: safeRedirect(redirect) }
	const url = client.buildAuthorizationUrl(config, {
		redirect_uri: oidcCallbackURL(),
		scope: settings.scopes,
		code_challenge: await client.calculatePKCECodeChallenge(verifier),
		code_challenge_method: 'S256',
		state: pending.state,
		nonce: pending.nonce,
	})
	return { url: url.toString(), cookie: sign(pending, secret(), { expiresIn: '10m', algorithm: 'HS256' }) }
}

export async function finishOidcSignIn(currentURL: URL, cookie: string | undefined): Promise<{ claims: Record<string, unknown>, redirect: string }> {
	const settings = oidcSettings()
	if (!settings || !cookie) throw new OidcSignInError('failed')
	let pending: Pending
	try {
		pending = verify(cookie, secret(), { algorithms: ['HS256'] }) as Pending
	} catch {
		throw new OidcSignInError('failed')
	}
	const client = await openIdClient()
	const tokens = await client.authorizationCodeGrant(await discover(settings), currentURL, {
		pkceCodeVerifier: pending.verifier,
		expectedState: pending.state,
		expectedNonce: pending.nonce,
		idTokenExpected: true,
	})
	const claims = tokens.claims()
	if (!claims) throw new OidcSignInError('failed')
	return { claims: claims as Record<string, unknown>, redirect: pending.redirect }
}

// Finds or creates the Damvia account for verified ID token claims. An
// existing account is linked by email only when the provider vouches for the
// address, since some providers let users set any email on their profile.
export async function userFromClaims(claims: Record<string, unknown>, settings: OidcSettings): Promise<User> {
	if (typeof claims.sub !== 'string' || !claims.sub) throw new OidcSignInError('failed')
	const subject = `${settings.issuer}|${claims.sub}`
	const email = typeof claims.email === 'string' ? claims.email.trim() : null
	const emailTrusted = !!email && (claims.email_verified === true || settings.trustEmail)
	const users = dataSource.getRepository(User)

	let user = await users.findOneBy({ oidcSubject: subject })
	if (!user && email) {
		const byEmail = await users.createQueryBuilder('user').where('lower(user.email) = lower(:email)', { email }).getOne()
		if (byEmail) {
			if (!emailTrusted) throw new OidcSignInError('email_unverified')
			if (byEmail.oidcSubject) throw new OidcSignInError('conflict')
			await users.update(byEmail.id, { oidcSubject: subject, emailVerified: true })
			user = await users.findOneByOrFail({ id: byEmail.id })
		}
	}
	if (!user) {
		if (!settings.autoCreate || !email) throw new OidcSignInError('no_account')
		if (!emailTrusted) throw new OidcSignInError('email_unverified')
		const region = settings.defaultRegion
			? await dataSource.getRepository(Region).findOneBy({ name: settings.defaultRegion })
			: await dataSource.getRepository(Region).findOne({ where: {}, order: { name: 'ASC' } })
		if (!region) throw new OidcSignInError('failed')
		user = await users.save(users.create({
			name: typeof claims.name === 'string' && claims.name.trim() ? claims.name.trim().slice(0, 80) : email,
			company: '',
			email,
			emailVerified: true,
			approved: true,
			role: UserRole.MEMBER,
			regionId: region.id,
			oidcSubject: subject,
		}))
		if (region.defaultGroupId && !settings.groupsClaim) {
			await dataSource.getRepository(UserGroup).insert({ userId: user.id, groupId: region.defaultGroupId })
		}
	}
	if (user.suspendedAt) throw new OidcSignInError('suspended')
	if (settings.groupsClaim && Object.keys(settings.groupMap).length) {
		await syncGroups(user, claims[settings.groupsClaim], settings.groupMap)
	}
	return user
}

// Groups named in OIDC_GROUP_MAP follow the provider at every sign-in; any
// other group membership is left as the admins set it.
async function syncGroups(user: User, claimed: unknown, groupMap: Record<string, string>) {
	const values = Array.isArray(claimed) ? claimed.filter((value): value is string => typeof value === 'string') : []
	const managed = await dataSource.getRepository(Group).findBy({ name: In([...new Set(Object.values(groupMap))]) })
	const wanted = new Set(values.map((value) => groupMap[value]).filter(Boolean))
	await dataSource.transaction(async (em) => {
		if (managed.length) {
			await em.getRepository(UserGroup).delete({ userId: user.id, groupId: In(managed.map((group) => group.id)) })
		}
		const rows = managed.filter((group) => wanted.has(group.name)).map((group) => ({ userId: user.id, groupId: group.id }))
		if (rows.length) await em.getRepository(UserGroup).insert(rows)
	})
}
