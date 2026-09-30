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
import { randomBytes } from 'node:crypto'
import QRCode from 'qrcode'
import { IsNull } from 'typeorm'
import { z } from 'zod'
import { CollectionInvitation } from '../../entity/collection-invitation'
import { User } from '../../entity/user'
import { SessionMethod, UserSession } from '../../entity/user-session'
import { dataSource, mfaRequiredRoles, oidcSettings, passwordLessAuth } from '../../env'
import { hashPassword, hashToken, verifyPassword } from '../../services/credentials'
import { consumeLoginToken } from '../../services/login-token'
import {
	decryptMfaSecret, encryptMfaSecret, generateMfaSecret, generateRecoveryCodes, hashRecoveryCode, mfaUri, verifyTotp,
} from '../../services/mfa'
import { recordAudit } from '../../services/audit'
import { enforce, hit, LOCKOUT_THRESHOLD } from '../../services/rate-limit'
import { createSession, destroySession, revokeUserSessions } from '../../services/session'
import {
	assertLocalSignInAllowed, assertNotSuspended, clearFailedSignIns, completeSignIn, isLocked, readMfaChallenge, recordFailedSignIn, SignInResult,
} from '../../services/sign-in'
import { userFromLegacyToken } from '../../services/user'
import { mailerLogInQueue } from '../../worker'
import { authMiddleware, publicProcedure, router } from '../index'

const MINUTE = 60 * 1000

// Compared against when the email is unknown, so a missing account takes as
// long to reject as a wrong password.
let dummyHash: Promise<string> | null = null
function unknownUserHash() {
	dummyHash ??= hashPassword(randomBytes(16).toString('hex'))
	return dummyHash
}

const invalidCredentials = () => new TRPCError({ code: 'NOT_FOUND', message: 'Invalid email or password.' })
const tooManyAttempts = () => new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Too many attempts. Please wait a few minutes and try again.' })

async function userWithMfa(userId: string) {
	return dataSource.getRepository(User).createQueryBuilder('user')
		.addSelect(['user.mfaSecret', 'user.mfaRecoveryCodes', 'user.mfaLastStep'])
		.where('user.id = :userId', { userId })
		.getOne()
}

// Checks a TOTP code, or failing that a recovery code, and records its use.
async function consumeSecondFactor(user: User, code: string): Promise<boolean> {
	if (!user.mfaSecret) return false
	const trimmed = code.replace(/\s/g, '')
	const step = verifyTotp(decryptMfaSecret(user.mfaSecret), trimmed, user.mfaLastStep === null ? null : Number(user.mfaLastStep))
	if (step !== null) {
		const updated = await dataSource.getRepository(User).createQueryBuilder().update(User)
			.set({ mfaLastStep: String(step) })
			.where('id = :id AND (mfa_last_step IS NULL OR mfa_last_step < :step)', { id: user.id, step })
			.execute()
		return !!updated.affected
	}
	const hash = hashRecoveryCode(trimmed)
	if (!user.mfaRecoveryCodes.includes(hash)) return false
	const [, removed] = await dataSource.query(
		`UPDATE users SET mfa_recovery_codes = array_remove(mfa_recovery_codes, $2) WHERE id = $1 AND $2 = ANY(mfa_recovery_codes)`,
		[user.id, hash],
	)
	return removed > 0
}

export default router({
	login: publicProcedure
		.input(z.object({
			email: z.email(),
			password: z.string().max(200),
			magicLink: z.boolean().nullable().optional(),
		}))
		.mutation(async ({ ctx, input }): Promise<SignInResult> => {
			enforce(`login:ip:${ctx.req.ip}`, 20, MINUTE)
			const user = await dataSource.getRepository(User).findOneBy({ email: input.email })

			// The answer is the same whether or not the account exists.
			if (passwordLessAuth() || input.magicLink) {
				enforce(`login-link:ip:${ctx.req.ip}`, 5, 15 * MINUTE)
				enforce(`login-link:email:${input.email.toLowerCase()}`, 3, 15 * MINUTE)
				if (user && !user.suspendedAt && !(oidcSettings()?.only && user.role !== 'guest')) await mailerLogInQueue.push({ userId: user.id })
				return { status: 'email_sent' }
			}

			if (!user) {
				// Unknown addresses lock like real accounts, so a lockout does not
				// reveal that an account exists.
				if (!hit(`login-unknown:email:${input.email.toLowerCase()}`, LOCKOUT_THRESHOLD, 15 * MINUTE)) throw tooManyAttempts()
				await verifyPassword(input.password, await unknownUserHash())
				await recordAudit(null, { actorId: null, action: 'auth.sign_in_failed', targetType: 'email', targetId: input.email.slice(0, 255), req: ctx.req })
				throw invalidCredentials()
			}
			assertLocalSignInAllowed(user)
			if (isLocked(user)) throw tooManyAttempts()
			if (!await verifyPassword(input.password, user.password)) {
				await recordFailedSignIn(user, ctx.req)
				throw invalidCredentials()
			}
			// With MFA, the count is cleared once the code is right, so a known
			// password does not reset the lockout on wrong codes.
			if (!user.mfaEnabledAt) await clearFailedSignIns(user)
			return completeSignIn(ctx.req, ctx.res, user, SessionMethod.PASSWORD)
		}),
	verifyMfa: publicProcedure
		.input(z.object({ challenge: z.string().max(2000), code: z.string().max(40) }))
		.mutation(async ({ ctx, input }): Promise<SignInResult> => {
			const challenge = readMfaChallenge(input.challenge)
			enforce(`mfa:user:${challenge.userId}`, 5, 5 * MINUTE)
			const user = await userWithMfa(challenge.userId)
			if (!user || !user.mfaEnabledAt) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Your sign-in expired. Please start again.' })
			assertNotSuspended(user)
			if (isLocked(user)) throw tooManyAttempts()
			if (!await consumeSecondFactor(user, input.code)) {
				await recordAudit(null, { actorId: null, action: 'auth.mfa_failed', targetType: 'user', targetId: user.id, req: ctx.req })
				await recordFailedSignIn(user, ctx.req)
				throw new TRPCError({ code: 'BAD_REQUEST', message: 'This code is not valid.' })
			}
			await clearFailedSignIns(user)
			await createSession(ctx.req, ctx.res, user, challenge.method, { invitationId: challenge.invitationId })
			return { status: 'signed_in' }
		}),
	// Magic login and approval emails carry a single-use token.
	exchangeLink: publicProcedure
		.input(z.object({ token: z.string().min(20).max(200) }))
		.mutation(async ({ ctx, input }): Promise<SignInResult> => {
			enforce(`link:ip:${ctx.req.ip}`, 20, MINUTE)
			const userId = await consumeLoginToken(input.token)
			const user = userId ? await dataSource.getRepository(User).findOneBy({ id: userId }) : null
			if (!user) throw new TRPCError({ code: 'BAD_REQUEST', message: 'This link is invalid or has expired.' })
			assertLocalSignInAllowed(user)
			return completeSignIn(ctx.req, ctx.res, user, SessionMethod.EMAIL_LINK)
		}),
	// An invitation link works for as long as the invitation exists and has
	// not expired; the sessions it opens end with it.
	exchangeInvitation: publicProcedure
		.input(z.object({ token: z.string().regex(/^[0-9a-f-]{36}\.[A-Za-z0-9_-]{20,100}$/) }))
		.mutation(async ({ ctx, input }) => {
			enforce(`link:ip:${ctx.req.ip}`, 20, MINUTE)
			const [invitationId, secret] = input.token.split('.')
			const invitation = await dataSource.getRepository(CollectionInvitation).createQueryBuilder('invitation')
				.innerJoinAndSelect('invitation.user', 'user')
				.where('invitation.id = :invitationId AND invitation.tokenHash = :hash AND invitation.expiresAt > now()',
					{ invitationId, hash: hashToken(secret) })
				.getOne()
			if (!invitation?.user) throw new TRPCError({ code: 'BAD_REQUEST', message: 'This link is invalid or has expired.' })
			const result = await completeSignIn(ctx.req, ctx.res, invitation.user, SessionMethod.INVITATION, invitation.id)
			return { ...result, collectionId: invitation.collectionId }
		}),
	upgradeLegacyToken: publicProcedure
		.mutation(async ({ ctx }): Promise<SignInResult> => {
			enforce(`legacy:ip:${ctx.req.ip}`, 20, MINUTE)
			const user = await userFromLegacyToken(ctx.req.headers.authorization)
			if (!user) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Please sign in again.' })
			return completeSignIn(ctx.req, ctx.res, user, SessionMethod.LEGACY)
		}),
	logout: publicProcedure
		.mutation(async ({ ctx }) => {
			if (!ctx.session) return
			await destroySession(ctx.res, ctx.session)
			await recordAudit(null, { actorId: ctx.session.userId, action: 'session.ended', targetType: 'user', targetId: ctx.session.userId, req: ctx.req })
		}),
	sessions: publicProcedure
		.use(authMiddleware())
		.query(async ({ ctx }) => {
			const sessions = await dataSource.getRepository(UserSession).find({
				where: { userId: ctx.user.id },
				order: { lastSeenAt: 'DESC' },
			})
			return sessions.map((session) => ({
				id: session.id,
				method: session.method,
				userAgent: session.userAgent,
				createdAt: session.createdAt,
				lastSeenAt: session.lastSeenAt,
				current: session.id === ctx.session.id,
			}))
		}),
	revokeSession: publicProcedure
		.use(authMiddleware())
		.input(z.object({ id: z.uuid() }))
		.mutation(async ({ ctx, input }) => {
			const removed = await dataSource.getRepository(UserSession).delete({ id: input.id, userId: ctx.user.id })
			if (removed.affected) {
				await recordAudit(null, { actorId: ctx.user.id, action: 'session.revoked', targetType: 'user', targetId: ctx.user.id, after: { sessionId: input.id }, req: ctx.req })
			}
		}),
	revokeOtherSessions: publicProcedure
		.use(authMiddleware())
		.mutation(async ({ ctx }) => {
			await revokeUserSessions(ctx.user.id, { exceptSessionId: ctx.session.id })
			await recordAudit(null, { actorId: ctx.user.id, action: 'session.revoked', targetType: 'user', targetId: ctx.user.id, after: { others: true }, req: ctx.req })
		}),
	// Stores a pending secret; it only protects the account once mfaEnable has
	// seen a valid code from it.
	mfaSetup: publicProcedure
		.use(authMiddleware())
		.mutation(async ({ ctx }) => {
			if (ctx.user.mfaEnabledAt) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Two-step verification is already on.' })
			const base32 = generateMfaSecret()
			const updated = await dataSource.getRepository(User).update({ id: ctx.user.id, mfaEnabledAt: IsNull() }, { mfaSecret: encryptMfaSecret(base32), mfaLastStep: null })
			if (!updated.affected) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Two-step verification is already on.' })
			const uri = mfaUri(base32, ctx.user.email, process.env.APP_NAME ?? 'Damvia')
			return { secret: base32, uri, qrSvg: await QRCode.toString(uri, { type: 'svg', margin: 1 }) }
		}),
	mfaEnable: publicProcedure
		.use(authMiddleware())
		.input(z.object({ code: z.string().max(40) }))
		.mutation(async ({ ctx, input }) => {
			enforce(`mfa:user:${ctx.user.id}`, 5, 5 * MINUTE)
			const user = await userWithMfa(ctx.user.id)
			if (!user?.mfaSecret || user.mfaEnabledAt) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Start the setup again.' })
			const step = verifyTotp(decryptMfaSecret(user.mfaSecret), input.code.replace(/\s/g, ''), null)
			if (step === null) throw new TRPCError({ code: 'BAD_REQUEST', message: 'This code is not valid.' })
			const { codes, hashes } = generateRecoveryCodes()
			const enabled = await dataSource.getRepository(User).update({ id: user.id, mfaEnabledAt: IsNull(), mfaSecret: user.mfaSecret }, {
				mfaEnabledAt: new Date(), mfaLastStep: String(step), mfaRecoveryCodes: hashes,
			})
			if (!enabled.affected) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Start the setup again.' })
			await revokeUserSessions(user.id, { exceptSessionId: ctx.session.id })
			await recordAudit(null, { actorId: user.id, action: 'mfa.enabled', targetType: 'user', targetId: user.id, req: ctx.req })
			return { recoveryCodes: codes }
		}),
	mfaDisable: publicProcedure
		.use(authMiddleware())
		.input(z.object({ code: z.string().max(40) }))
		.mutation(async ({ ctx, input }) => {
			if (mfaRequiredRoles().includes(ctx.user.role)) {
				throw new TRPCError({ code: 'FORBIDDEN', message: 'Your role requires two-step verification.' })
			}
			enforce(`mfa:user:${ctx.user.id}`, 5, 5 * MINUTE)
			const user = await userWithMfa(ctx.user.id)
			if (!user?.mfaEnabledAt || !await consumeSecondFactor(user, input.code)) {
				throw new TRPCError({ code: 'BAD_REQUEST', message: 'This code is not valid.' })
			}
			await dataSource.getRepository(User).update(user.id, {
				mfaEnabledAt: null, mfaSecret: null, mfaRecoveryCodes: [], mfaLastStep: null,
			})
			await recordAudit(null, { actorId: user.id, action: 'mfa.disabled', targetType: 'user', targetId: user.id, req: ctx.req })
		}),
	mfaRegenerateRecoveryCodes: publicProcedure
		.use(authMiddleware())
		.input(z.object({ code: z.string().max(40) }))
		.mutation(async ({ ctx, input }) => {
			enforce(`mfa:user:${ctx.user.id}`, 5, 5 * MINUTE)
			const user = await userWithMfa(ctx.user.id)
			if (!user?.mfaEnabledAt || !await consumeSecondFactor(user, input.code)) {
				throw new TRPCError({ code: 'BAD_REQUEST', message: 'This code is not valid.' })
			}
			const { codes, hashes } = generateRecoveryCodes()
			await dataSource.getRepository(User).update(user.id, { mfaRecoveryCodes: hashes })
			await recordAudit(null, { actorId: user.id, action: 'mfa.recovery_codes_renewed', targetType: 'user', targetId: user.id, req: ctx.req })
			return { recoveryCodes: codes }
		}),
})
