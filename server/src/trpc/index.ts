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
import { initTRPC, TRPCError } from '@trpc/server'
import { CreateFastifyContextOptions } from "@trpc/server/adapters/fastify"
import { z } from "zod"
import { User, UserRole } from "../entity/user"
import { SessionMethod } from "../entity/user-session"
import { mfaRequiredRoles } from "../env"
import { recordAudit } from "../services/audit"
import { sessionFromRequest } from "../services/session"

export const t = initTRPC.context<typeof createContext>().create({
	errorFormatter({ shape, error, ctx }) {
		if (error.code === 'BAD_REQUEST' && error.cause instanceof z.ZodError) {
			return {
				...shape,
				message: 'Invalid request.',
				data: {
					...shape.data,
					fieldErrors: z.flattenError(error.cause).fieldErrors,
				},
			}
		}
		// An unexpected error keeps its details in the server log; the client
		// gets a reference to quote instead.
		if (error.code === 'INTERNAL_SERVER_ERROR') {
			const reference = ctx?.req?.id
			return { ...shape, message: `Something went wrong. Please try again${reference ? ` (reference ${reference})` : ''}.`, data: { ...shape.data, stack: undefined } }
		}
		return shape
	}
})

export async function createContext({ req, res }: CreateFastifyContextOptions) {
	const found = await sessionFromRequest(req)
	return { req, res, user: found?.user ?? null, session: found?.session ?? null }
}

// Every mutation by an admin or a manager is recorded with its input. These
// procedures write a detailed entry of their own instead.
export const EXPLICITLY_AUDITED = new Set([
	'user.update', 'user.approve', 'user.remove', 'user.suspend', 'user.resume', 'user.revokeSessions', 'user.resetMfa',
	'user.sendPasswordResetFor', 'user.resendVerificationEmailFor', 'user.markEmailVerifiedFor', 'user.changeUnverifiedEmail', 'user.updateProfile', 'user.removeAccount',
	'auth.logout', 'auth.revokeSession', 'auth.revokeOtherSessions', 'auth.mfaSetup', 'auth.mfaEnable', 'auth.mfaDisable',
	'auth.mfaRegenerateRecoveryCodes', 'audit.export', 'user.exportMyData', 'user.exportData',
	// Record their own entry, or change nothing: previews and counts run on every keystroke.
	'emailTemplate.update', 'emailTemplate.reset', 'emailTemplate.preview', 'emailTemplate.updateSettings', 'settings.updateBrandTheme',
	'newsletter.create', 'newsletter.update', 'newsletter.duplicate', 'newsletter.remove', 'newsletter.preview', 'newsletter.schedule',
	'newsletter.cancel', 'newsletter.resume', 'newsletter.audienceSize', 'newsletter.saveAudience', 'newsletter.removeAudience',
	'newsletter.setMySubscription',
])

// What a user whose role requires MFA may still call before enrolling.
export const MFA_ENROLMENT_PATHS = ['user.me', 'auth.logout', 'auth.mfaSetup', 'auth.mfaEnable', 'auth.sessions']

export function mfaEnrolmentRequired(user: User, method: SessionMethod | undefined) {
	return mfaRequiredRoles().includes(user.role) && !user.mfaEnabledAt && method !== SessionMethod.SSO
}

export const middleware = t.middleware
export const router = t.router
export const publicProcedure = t.procedure
export const authMiddleware =
	(...chain: ((u: User) => boolean)[]) =>
		middleware(async (opts) => {
			const { user, session, req } = opts.ctx
			if (!user || !session || !chain.every((h) => h(user))) {
				if (user && session) {
					await recordAudit(null, { actorId: user.id, action: 'access.denied', targetType: 'procedure', targetId: opts.path, req })
				}
				throw new TRPCError({ code: 'UNAUTHORIZED' })
			}
			if (mfaEnrolmentRequired(user, session.method) && !MFA_ENROLMENT_PATHS.includes(opts.path)) {
				throw new TRPCError({ code: 'FORBIDDEN', message: 'Set up two-step verification to continue.' })
			}
			const result = await opts.next({ ctx: { user, session } })
			if (!result.ok && result.error.code === 'FORBIDDEN') {
				await recordAudit(null, { actorId: user.id, action: 'access.denied', targetType: 'procedure', targetId: opts.path, req })
			} else if (result.ok && opts.type === 'mutation' && [UserRole.ADMIN, UserRole.MANAGER].includes(user.role) && !EXPLICITLY_AUDITED.has(opts.path)) {
				await recordAudit(null, { actorId: user.id, action: 'admin.change', targetType: 'procedure', targetId: opts.path, after: await opts.getRawInput(), req })
			}
			return result
		})
export const userApproved = (u: User) => u?.approved && u?.emailVerified
export const userAdmin = (u: User) => userApproved(u) && u?.role === UserRole.ADMIN
export const userMember = (u: User) => [UserRole.ADMIN, UserRole.MANAGER, UserRole.MEMBER].includes(u?.role)
export const userManagerOrAdmin = (u: User) => userApproved(u) && [UserRole.ADMIN, UserRole.MANAGER].includes(u?.role)

export { default as appRouter, AppRouter } from './router'
