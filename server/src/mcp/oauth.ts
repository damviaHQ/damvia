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
import { FastifyRequest } from "fastify"
import { createHash, randomBytes, timingSafeEqual } from "node:crypto"
import { EntityManager, IsNull } from "typeorm"
import { OAuthAuthorizationCode, OAuthClient, OAuthGrant } from "../entity/oauth"
import { User, UserRole } from "../entity/user"
import { SessionMethod, UserSession } from "../entity/user-session"
import { apiURL, dataSource, sessionMaxHours } from "../env"
import { recordAudit } from "../services/audit"
import { hashToken } from "../services/credentials"

// Damvia is its own OAuth 2.1 authorization server for the MCP endpoint: an
// assistant registers itself, the person agrees on the consent page, and the
// assistant receives tokens tied to a session of method `mcp`. Everything
// the assistant does then runs with that person's rights.

export const ACCESS_TOKEN_SECONDS = 60 * 60
const CODE_SECONDS = 60

// What an assistant may do. Only reading exists so far; the others are
// granted now so connections keep working when the tools that need them
// arrive.
export const SCOPES = ['damvia.read', 'damvia.download', 'damvia.collections', 'damvia.share', 'damvia.admin'] as const
export type Scope = typeof SCOPES[number]

export function issuer() {
	return apiURL().replace(/\/+$/, '')
}

export function mcpResource() {
	return `${issuer()}/v1/mcp`
}

export function oauthMetadata() {
	return {
		issuer: issuer(),
		authorization_endpoint: `${issuer()}/v1/oauth/authorize`,
		token_endpoint: `${issuer()}/v1/oauth/token`,
		registration_endpoint: `${issuer()}/v1/oauth/register`,
		revocation_endpoint: `${issuer()}/v1/oauth/revoke`,
		response_types_supported: ['code'],
		grant_types_supported: ['authorization_code', 'refresh_token'],
		code_challenge_methods_supported: ['S256'],
		token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
		revocation_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
		scopes_supported: [...SCOPES],
		client_id_metadata_document_supported: false,
	}
}

export function protectedResourceMetadata() {
	return {
		resource: mcpResource(),
		authorization_servers: [issuer()],
		scopes_supported: [...SCOPES],
		bearer_methods_supported: ['header'],
		resource_name: 'Damvia',
	}
}

// The scopes a role may hold. Guests never connect an assistant.
export function scopesForRole(role: UserRole): Scope[] {
	if (role === UserRole.ADMIN || role === UserRole.MANAGER) return [...SCOPES]
	if (role === UserRole.MEMBER) return SCOPES.filter((scope) => scope !== 'damvia.admin')
	return []
}

export function grantedScopes(requested: string | undefined | null, role: UserRole): Scope[] {
	const allowed = scopesForRole(role)
	const asked = (requested ?? '').split(/\s+/).filter(Boolean)
	if (!asked.length) return allowed
	return allowed.filter((scope) => asked.includes(scope))
}

export class OAuthError extends Error {
	constructor(public error: string, public description: string, public status = 400) {
		super(description)
	}
}

const token = () => randomBytes(32).toString('base64url')
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Redirect URIs must be HTTPS, or HTTP on the loopback for local tools.
export function validRedirectUri(value: unknown): value is string {
	if (typeof value !== 'string' || value.length > 2000) return false
	let url: URL
	try { url = new URL(value) } catch { return false }
	if (url.hash) return false
	if (url.protocol === 'https:') return true
	return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
}

function optionalUrl(value: unknown): string | null {
	if (typeof value !== 'string' || value.length > 500) return null
	try { return new URL(value).protocol === 'https:' ? value : null } catch { return null }
}

// Dynamic client registration (RFC 7591). Anyone may register; the consent
// page shows the person which site the assistant will send them back to.
export async function registerClient(body: Record<string, unknown>) {
	const redirectUris = body.redirect_uris
	if (!Array.isArray(redirectUris) || !redirectUris.length || redirectUris.length > 10 || !redirectUris.every(validRedirectUri)) {
		throw new OAuthError('invalid_redirect_uri', 'redirect_uris must list 1 to 10 HTTPS addresses.')
	}
	const method = typeof body.token_endpoint_auth_method === 'string' ? body.token_endpoint_auth_method : 'none'
	if (!['none', 'client_secret_post', 'client_secret_basic'].includes(method)) {
		throw new OAuthError('invalid_client_metadata', 'Unsupported token_endpoint_auth_method.')
	}
	const grantTypes = Array.isArray(body.grant_types) ? body.grant_types : ['authorization_code', 'refresh_token']
	if (!grantTypes.every((type) => type === 'authorization_code' || type === 'refresh_token')) {
		throw new OAuthError('invalid_client_metadata', 'Only authorization_code and refresh_token are supported.')
	}
	const responseTypes = Array.isArray(body.response_types) ? body.response_types : ['code']
	if (!responseTypes.every((type) => type === 'code')) {
		throw new OAuthError('invalid_client_metadata', 'Only the code response type is supported.')
	}
	const name = typeof body.client_name === 'string' && body.client_name.trim() ? body.client_name.trim().slice(0, 200) : 'Assistant'
	const secret = method === 'none' ? null : token()
	const client = await dataSource.getRepository(OAuthClient).save({
		name,
		redirectUris: redirectUris as string[],
		clientUri: optionalUrl(body.client_uri),
		logoUri: optionalUrl(body.logo_uri),
		tokenEndpointAuthMethod: method,
		secretHash: secret ? hashToken(secret) : null,
	})
	return {
		client_id: client.id,
		client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
		...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {}),
		client_name: client.name,
		redirect_uris: client.redirectUris,
		...(client.clientUri ? { client_uri: client.clientUri } : {}),
		...(client.logoUri ? { logo_uri: client.logoUri } : {}),
		token_endpoint_auth_method: method,
		grant_types: grantTypes,
		response_types: ['code'],
	}
}

export async function findClient(clientId: unknown) {
	if (typeof clientId !== 'string' || !UUID.test(clientId)) return null
	return dataSource.getRepository(OAuthClient).findOne({ where: { id: clientId, disabledAt: IsNull() }, select: { id: true, name: true, redirectUris: true, clientUri: true, logoUri: true, tokenEndpointAuthMethod: true, secretHash: true, createdAt: true, lastUsedAt: true, disabledAt: true } })
}

export type AuthorizationRequest = {
	response_type?: string
	client_id?: string
	redirect_uri?: string
	code_challenge?: string
	code_challenge_method?: string
	state?: string
	scope?: string
	resource?: string
}

function sameResource(value: string) {
	return value.replace(/\/+$/, '') === mcpResource()
}

// Checks an authorization request. Errors before the client and its
// redirect address are known are shown to the person, never redirected.
export async function checkAuthorizationRequest(request: AuthorizationRequest) {
	const client = await findClient(request.client_id)
	if (!client) throw new OAuthError('invalid_client', 'This assistant is not registered with Damvia.')
	if (!request.redirect_uri || !client.redirectUris.includes(request.redirect_uri)) {
		throw new OAuthError('invalid_request', 'The return address does not belong to this assistant.')
	}
	const redirect = (error: string, description: string) => {
		const url = new URL(request.redirect_uri!)
		url.searchParams.set('error', error)
		url.searchParams.set('error_description', description)
		if (request.state) url.searchParams.set('state', request.state)
		url.searchParams.set('iss', issuer())
		return url.toString()
	}
	if (request.response_type !== 'code') return { client, error: redirect('unsupported_response_type', 'Only the code response type is supported.') }
	if (request.code_challenge_method !== 'S256' || !request.code_challenge || !/^[A-Za-z0-9_-]{43,128}$/.test(request.code_challenge)) {
		return { client, error: redirect('invalid_request', 'PKCE with S256 is required.') }
	}
	if (request.resource && !sameResource(request.resource)) return { client, error: redirect('invalid_target', 'Unknown resource.') }
	return { client, error: null }
}

export function refusal(user: User): 'guest' | 'unapproved' | null {
	if (!user.approved || !user.emailVerified || user.suspendedAt) return 'unapproved'
	if (!scopesForRole(user.role).length) return 'guest'
	return null
}

// The person agreed: a one-minute code goes back to the assistant.
export async function issueCode(user: User, request: AuthorizationRequest) {
	const { client, error } = await checkAuthorizationRequest(request)
	if (error) return error
	if (refusal(user)) throw new OAuthError('access_denied', 'This account cannot connect an assistant.', 403)
	const code = token()
	await dataSource.getRepository(OAuthAuthorizationCode).save({
		codeHash: hashToken(code),
		clientId: client.id,
		userId: user.id,
		redirectUri: request.redirect_uri!,
		codeChallenge: request.code_challenge!,
		scopes: grantedScopes(request.scope, user.role),
		resource: request.resource ?? null,
		expiresAt: new Date(Date.now() + CODE_SECONDS * 1000),
	})
	const url = new URL(request.redirect_uri!)
	url.searchParams.set('code', code)
	if (request.state) url.searchParams.set('state', request.state)
	url.searchParams.set('iss', issuer())
	return url.toString()
}

export async function denyRequest(request: AuthorizationRequest) {
	const { error } = await checkAuthorizationRequest(request)
	if (error) return error
	const url = new URL(request.redirect_uri!)
	url.searchParams.set('error', 'access_denied')
	if (request.state) url.searchParams.set('state', request.state)
	url.searchParams.set('iss', issuer())
	return url.toString()
}

function secretMatches(secret: string, hash: string | null) {
	if (!hash) return false
	const a = Buffer.from(hashToken(secret))
	const b = Buffer.from(hash)
	return a.length === b.length && timingSafeEqual(a, b)
}

// The client of a token or revocation request: public clients name
// themselves, confidential ones also prove it with their secret.
export async function authenticateClient(body: Record<string, string | undefined>, authorization: string | undefined) {
	let clientId = body.client_id
	let secret = body.client_secret
	if (authorization?.startsWith('Basic ')) {
		const [id, pass] = Buffer.from(authorization.slice(6), 'base64').toString().split(':')
		const decode = (value: string | undefined) => { try { return decodeURIComponent(value ?? '') } catch { return value ?? '' } }
		clientId = decode(id)
		secret = decode(pass)
	}
	const client = await findClient(clientId)
	if (!client) throw new OAuthError('invalid_client', 'Unknown client.', 401)
	if (client.tokenEndpointAuthMethod !== 'none' && (!secret || !secretMatches(secret, client.secretHash))) {
		throw new OAuthError('invalid_client', 'Client authentication failed.', 401)
	}
	return client
}

const pkce = (verifier: string) => createHash('sha256').update(verifier).digest('base64url')

async function issueTokens(em: EntityManager, grant: OAuthGrant) {
	const accessToken = token()
	const refreshToken = token()
	await em.getRepository(OAuthGrant).update(grant.id, {
		accessTokenHash: hashToken(accessToken),
		accessExpiresAt: new Date(Date.now() + ACCESS_TOKEN_SECONDS * 1000),
		previousRefreshTokenHash: grant.refreshTokenHash ?? null,
		refreshTokenHash: hashToken(refreshToken),
		lastUsedAt: new Date(),
	})
	return {
		access_token: accessToken,
		token_type: 'Bearer',
		expires_in: ACCESS_TOKEN_SECONDS,
		refresh_token: refreshToken,
		scope: grant.scopes.join(' '),
	}
}

export async function exchangeCode(client: OAuthClient, body: Record<string, string | undefined>, req: FastifyRequest) {
	if (!body.code || !body.code_verifier || !body.redirect_uri) throw new OAuthError('invalid_request', 'code, code_verifier and redirect_uri are required.')
	if (body.resource && !sameResource(body.resource)) throw new OAuthError('invalid_target', 'Unknown resource.')
	// The code is spent by the first attempt, whether or not it succeeds.
	const [code] = await dataSource.query(
		`UPDATE oauth_authorization_codes SET used_at = now() WHERE code_hash = $1 AND used_at IS NULL AND expires_at > now() RETURNING id`,
		[hashToken(body.code)],
	)
	const row = code?.[0] ? await dataSource.getRepository(OAuthAuthorizationCode).findOneBy({ id: code[0].id }) : null
	if (!row || row.clientId !== client.id || row.redirectUri !== body.redirect_uri || pkce(body.code_verifier) !== row.codeChallenge) {
		throw new OAuthError('invalid_grant', 'The authorization code is invalid or expired.')
	}
	return dataSource.transaction(async (em) => {
		const user = await em.getRepository(User).findOneBy({ id: row.userId })
		if (!user || refusal(user)) throw new OAuthError('invalid_grant', 'This account cannot connect an assistant.')
		const now = new Date()
		const session = await em.getRepository(UserSession).save({
			userId: user.id,
			// No cookie carries this session: its own token is never handed out.
			tokenHash: hashToken(token()),
			method: SessionMethod.MCP,
			clientLabel: client.name,
			invitationId: null,
			userAgent: req.headers['user-agent']?.slice(0, 255) ?? null,
			lastSeenAt: now,
			expiresAt: new Date(now.getTime() + sessionMaxHours() * 3600 * 1000),
		})
		const grant = await em.getRepository(OAuthGrant).save({
			clientId: client.id,
			userId: user.id,
			sessionId: session.id,
			scopes: row.scopes,
			accessTokenHash: hashToken(token()),
			accessExpiresAt: now,
			refreshTokenHash: hashToken(token()),
			lastUsedAt: now,
		})
		await em.getRepository(OAuthClient).update(client.id, { lastUsedAt: now })
		await recordAudit(em, {
			actorId: user.id, action: 'session.created', targetType: 'user', targetId: user.id,
			after: { method: SessionMethod.MCP, client: client.name, scopes: row.scopes },
			req,
		})
		return issueTokens(em, { ...grant, refreshTokenHash: null as unknown as string })
	})
}

export async function refreshTokens(client: OAuthClient, body: Record<string, string | undefined>) {
	if (!body.refresh_token) throw new OAuthError('invalid_request', 'refresh_token is required.')
	const hash = hashToken(body.refresh_token)
	const tokens = await dataSource.transaction(async (em) => {
		const grant = await em.getRepository(OAuthGrant).createQueryBuilder('g')
			.innerJoin('g.session', 'session')
			.innerJoin('g.user', 'user')
			.where('g.refreshTokenHash = :hash', { hash })
			.andWhere('g.clientId = :clientId', { clientId: client.id })
			.andWhere('session.expiresAt > now()')
			.andWhere('user.suspendedAt IS NULL')
			.setLock('pessimistic_write', undefined, ['g'])
			.getOne()
		return grant ? issueTokens(em, grant) : null
	})
	if (tokens) return tokens
	// A refresh token used twice was stolen or replayed: the connection ends.
	const reused = await dataSource.getRepository(OAuthGrant).findOneBy({ previousRefreshTokenHash: hash, clientId: client.id })
	if (reused) await dataSource.getRepository(UserSession).delete(reused.sessionId)
	throw new OAuthError('invalid_grant', 'The refresh token is invalid or expired.')
}

// RFC 7009: ends the connection whose access or refresh token is given.
export async function revokeToken(client: OAuthClient, value: string | undefined) {
	if (!value) return
	const hash = hashToken(value)
	const grant = await dataSource.getRepository(OAuthGrant).createQueryBuilder('g')
		.where('g.clientId = :clientId', { clientId: client.id })
		.andWhere('(g.accessTokenHash = :hash OR g.refreshTokenHash = :hash)', { hash })
		.getOne()
	if (grant) await dataSource.getRepository(UserSession).delete(grant.sessionId)
}

export type McpAuth = { user: User, session: UserSession, grant: OAuthGrant, scopes: Scope[] }

// The person behind a bearer token, while the connection, the session and
// the account are all still valid.
export async function authenticateBearer(authorization: string | undefined): Promise<McpAuth | null> {
	if (!authorization?.startsWith('Bearer ')) return null
	const grant = await dataSource.getRepository(OAuthGrant).createQueryBuilder('g')
		.innerJoinAndSelect('g.session', 'session')
		.innerJoinAndSelect('g.user', 'user')
		.leftJoinAndSelect('user.userGroups', 'userGroup')
		.leftJoinAndSelect('userGroup.group', 'group')
		.where('g.accessTokenHash = :hash', { hash: hashToken(authorization.slice(7).trim()) })
		.andWhere('g.accessExpiresAt > now()')
		.andWhere('session.expiresAt > now()')
		.andWhere('user.suspendedAt IS NULL')
		.getOne()
	if (!grant || refusal(grant.user)) return null
	const scopes = grant.scopes.filter((scope): scope is Scope => (scopesForRole(grant.user.role) as string[]).includes(scope))
	if (Date.now() - grant.session.lastSeenAt.getTime() > 5 * 60 * 1000) {
		await dataSource.getRepository(UserSession).update(grant.session.id, { lastSeenAt: new Date() })
		await dataSource.getRepository(OAuthGrant).update(grant.id, { lastUsedAt: new Date() })
	}
	return { user: grant.user, session: grant.session, grant, scopes }
}
