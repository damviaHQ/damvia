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
import { TRPCError } from '@trpc/server'
import { FastifyReply, FastifyRequest } from 'fastify'
import { sign, verify } from 'jsonwebtoken'
import { User } from '../entity/user'
import { SessionMethod } from '../entity/user-session'
import { dataSource, oidcSettings, secret } from '../env'
import { recordAudit } from './audit'
import { lockoutMinutes } from './rate-limit'
import { createSession } from './session'

export type SignInResult =
	| { status: 'signed_in' }
	| { status: 'email_sent' }
	| { status: 'mfa_required', challenge: string }

type ChallengePayload = { purpose: 'mfa', userId: string, method: SessionMethod, invitationId: string | null }

// Proof that the first factor succeeded, exchanged within five minutes for a
// session once the second factor is checked. It never grants access itself.
export function createMfaChallenge(user: User, method: SessionMethod, invitationId: string | null): string {
	const payload: ChallengePayload = { purpose: 'mfa', userId: user.id, method, invitationId }
	return sign(payload, secret(), { expiresIn: '5m', algorithm: 'HS256' })
}

export function readMfaChallenge(challenge: string): ChallengePayload {
	try {
		const payload = verify(challenge, secret(), { algorithms: ['HS256'] })
		if (typeof payload === 'object' && payload.purpose === 'mfa' && typeof payload.userId === 'string') {
			return payload as ChallengePayload
		}
	} catch {
		// Falls through to the same error as a forged challenge.
	}
	throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Your sign-in expired. Please start again.' })
}

// With OIDC_ONLY, everyone but guests (who have no account at the identity
// provider) signs in through single sign-on.
export function assertLocalSignInAllowed(user: Pick<User, 'role'> | null) {
	if (oidcSettings()?.only && user?.role !== 'guest') {
		throw new TRPCError({ code: 'FORBIDDEN', message: 'Sign in with single sign-on.' })
	}
}

export function assertNotSuspended(user: User) {
	if (user.suspendedAt) {
		throw new TRPCError({ code: 'FORBIDDEN', message: 'This account is suspended. Contact an administrator.' })
	}
}

// Every successful first factor goes through here: a user with MFA gets a
// challenge, everyone else a session. SSO sign-ins skip the challenge because
// the identity provider applies its own policy.
export async function completeSignIn(
	req: FastifyRequest, res: FastifyReply, user: User, method: SessionMethod, invitationId: string | null = null,
): Promise<SignInResult> {
	assertNotSuspended(user)
	if (user.mfaEnabledAt && method !== SessionMethod.SSO) {
		await recordAudit(null, { actorId: user.id, action: 'auth.mfa_challenged', targetType: 'user', targetId: user.id, after: { method }, req })
		return { status: 'mfa_required', challenge: createMfaChallenge(user, method, invitationId) }
	}
	await createSession(req, res, user, method, { invitationId })
	return { status: 'signed_in' }
}

export async function recordFailedSignIn(user: User, req: FastifyRequest) {
	const failedLoginCount = user.failedLoginCount + 1
	const minutes = lockoutMinutes(failedLoginCount)
	await dataSource.getRepository(User).update(user.id, {
		failedLoginCount,
		lockedUntil: minutes ? new Date(Date.now() + minutes * 60 * 1000) : null,
	})
	await recordAudit(null, { actorId: null, action: 'auth.sign_in_failed', targetType: 'user', targetId: user.id, after: { failedLoginCount }, req })
	if (minutes) {
		await recordAudit(null, { actorId: null, action: 'auth.locked', targetType: 'user', targetId: user.id, after: { minutes }, req })
	}
}

export async function clearFailedSignIns(user: User) {
	if (user.failedLoginCount || user.lockedUntil) {
		await dataSource.getRepository(User).update(user.id, { failedLoginCount: 0, lockedUntil: null })
	}
}

export function isLocked(user: User) {
	return !!user.lockedUntil && user.lockedUntil.getTime() > Date.now()
}
