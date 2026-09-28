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
import { TRPCError } from "@trpc/server"
import { hashPassword, hashResetToken } from '../../services/credentials'
import { randomBytes } from "node:crypto"
import { z } from 'zod'
import { ActivityEvent, ActivityEventType } from "../../entity/activity-event"
import { AuthorizedDomain } from "../../entity/authorized-domain"
import { LoginToken } from "../../entity/login-token"
import { User, UserRole } from "../../entity/user"
import { SessionMethod } from "../../entity/user-session"
import { dataSource, mfaRequiredRoles, oidcSettings, passwordLessAuth } from "../../env"
import { assertAcceptablePassword, newPasswordSchema } from "../../services/password-policy"
import { recordAudit } from "../../services/audit"
import { enforce } from "../../services/rate-limit"
import { createSession, revokeUserSessions } from "../../services/session"
import { assertLocalSignInAllowed, completeSignIn, SignInResult } from "../../services/sign-in"
import { exportUserData } from "../../services/privacy"
import { createUser, removeUser } from "../../services/user"
import {
	mailerEmailVerificationQueue,
	mailerRequestApprovalQueue,
	mailerResetPasswordQueue,
	mailerUserApprovedEmailQueue
} from "../../worker"
import { authMiddleware, mfaEnrolmentRequired, publicProcedure, router, userAdmin, userManagerOrAdmin } from "../index"
import {UserGroup} from "../../entity/user-group";

const MINUTE = 60 * 1000

// The user an admin, or a manager within their region, may act on. Managers
// never act on admin or manager accounts.
async function managedUser(viewer: User, id: string) {
	const user = await dataSource.getRepository(User).findOneBy(
		viewer.role === UserRole.ADMIN ? { id } : { regionId: viewer.regionId, id },
	)
	if (!user) {
		throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found.' })
	}
	if (viewer.role !== UserRole.ADMIN && [UserRole.ADMIN, UserRole.MANAGER].includes(user.role)) {
		throw new TRPCError({ code: 'FORBIDDEN', message: 'Only admins can manage admin or manager accounts.' })
	}
	return user
}

// The account fields an audit entry compares before and after a change.
function accountSnapshot(user: User, groupIds?: string[]) {
	return {
		email: user.email, name: user.name, company: user.company, role: user.role, regionId: user.regionId,
		approved: user.approved, maintenanceContact: user.maintenanceContact,
		...(groupIds ? { groupIds: [...groupIds].sort() } : {}),
	}
}

function csvCell(value: unknown) {
	const text = value === null || value === undefined ? '' : value instanceof Date ? value.toISOString() : String(value)
	// A leading = + - @ would be run as a formula by spreadsheet software.
	const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
	return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export function formatPublicUser(user: User) {
	return {
		id: user.id,
		name: user.name,
		email: user.email,
		company: user.company,
		region: user.region ? user.region.name : null,
		regionId: user.regionId,
		role: user.role,
		emailVerified: user.emailVerified,
		approved: user.approved,
	}
}

export function formatPublicUserForAdmin(user: User, viewer: User) {
	return {
		id: user.id,
		name: user.name,
		email: user.email,
		company: user.company,
		region: user.region ? user.region.name : null,
		regionId: user.regionId,
		role: user.role,
		emailVerified: user.emailVerified,
		approved: user.approved,
		maintenanceContact: viewer.role === UserRole.ADMIN ? user.maintenanceContact : undefined,
		createdAt: user.createdAt,
		updatedAt: user.updatedAt,
		lastLoginAt: user.lastLoginAt,
		suspendedAt: user.suspendedAt,
		mfaEnabled: !!user.mfaEnabledAt,
		groups: user.userGroups.map((userGroup) => ({
			id: userGroup.group.id,
			name: userGroup.group.name,
		}))
	}
}

export default router({
	create: publicProcedure
		.input(
			z.object({
				name: z.string().min(1).max(80),
				company: z.string().min(1).max(80),
				regionId: z.uuid('Invalid region'),
				email: z.email(),
				password: passwordLessAuth() ? z.string().max(0).optional() : newPasswordSchema,
			}),
		)
		.mutation(async ({ ctx, input }): Promise<SignInResult> => {
			enforce(`sign-up:ip:${ctx.req.ip}`, 5, 15 * MINUTE)
			if (oidcSettings()?.only) throw new TRPCError({ code: 'FORBIDDEN', message: 'Sign in with single sign-on.' })
			if (!passwordLessAuth()) await assertAcceptablePassword(input.password ?? '', input.email)
			try {
				const user = await createUser({
					name: input.name,
					company: input.company,
					regionId: input.regionId,
					email: input.email,
					password: input.password ?? null,
				})
				await recordAudit(null, { actorId: user.id, action: 'user.created', targetType: 'user', targetId: user.id, after: accountSnapshot(user), req: ctx.req })
				await createSession(ctx.req, ctx.res, user, SessionMethod.SIGN_UP)
				return { status: 'signed_in' }
			} catch (error) {
				if (/^Key \(email\)=\(.+\) already exists.$/.test(error.detail)) {
					throw new TRPCError({
						code: 'BAD_REQUEST',
						message: 'Email address already taken.'
					})
				}
				throw error
			}
		}),
	// The reset token is created by the mail job so it is never stored in the
	// job queue.
	sendResetPasswordEmail: publicProcedure
		.input(z.email())
		.mutation(async ({ ctx, input }) => {
			enforce(`reset:ip:${ctx.req.ip}`, 5, 15 * MINUTE)
			enforce(`reset:email:${input.toLowerCase()}`, 3, 15 * MINUTE)
			const user = await dataSource.getRepository(User).findOneBy({ email: input })
			if (!user || user.suspendedAt || (oidcSettings()?.only && user.role !== UserRole.GUEST)) return
			await mailerResetPasswordQueue.push({ userId: user.id })
		}),
	resetPassword: publicProcedure
		.input(
			z.object({
				email: z.email(),
				token: z.string().regex(/^[a-f0-9]{64}$/),
				newPassword: newPasswordSchema,
			})
		)
		.mutation(async ({ ctx, input }): Promise<SignInResult> => {
			enforce(`reset:ip:${ctx.req.ip}`, 10, 15 * MINUTE)
			await assertAcceptablePassword(input.newPassword, input.email)
			const tokenHash = hashResetToken(input.token)
			const repository = dataSource.getRepository(User)
			const user = await repository.createQueryBuilder('user')
				.where('user.email = :email AND user.reset_password_token = :token AND user.reset_password_expires_at > now()',
					{ email: input.email, token: tokenHash }).getOne()
			if (!user) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid or expired reset link.' })
			assertLocalSignInAllowed(user)
			const result = await repository.createQueryBuilder().update(User).set({
				password: await hashPassword(input.newPassword),
				resetPasswordToken: null,
				resetPasswordExpiresAt: null,
				failedLoginCount: 0,
				lockedUntil: null,
				authVersion: () => 'auth_version + 1',
			}).where('id = :id AND reset_password_token = :token AND reset_password_expires_at > now()',
				{ id: user.id, token: tokenHash }).returning('auth_version').execute()
			if (!result.affected) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid or expired reset link.' })
			await revokeUserSessions(user.id)
			await recordAudit(null, { actorId: user.id, action: 'password.reset', targetType: 'user', targetId: user.id, req: ctx.req })
			return completeSignIn(ctx.req, ctx.res, user, SessionMethod.PASSWORD_RESET)
		}),
	me: publicProcedure
		.use(authMiddleware())
		.query(async ({ ctx }) => {
			const [, loggedIn] = await dataSource.query(`
				UPDATE users SET last_login_at = now()
				WHERE id = $1 AND (last_login_at IS NULL OR last_login_at < now() - interval '30 minutes')
			`, [ctx.user.id])
			if (loggedIn) {
				await dataSource.getRepository(ActivityEvent).insert({ userId: ctx.user.id, type: ActivityEventType.LOGIN })
			}
			return {
				id: ctx.user.id,
				name: ctx.user.name,
				company: ctx.user.company,
				email: ctx.user.email,
				emailVerified: ctx.user.emailVerified,
				approved: ctx.user.approved,
				role: ctx.user.role,
				regionId: ctx.user.regionId,
				mfaEnabled: !!ctx.user.mfaEnabledAt,
				mfaSetupRequired: mfaEnrolmentRequired(ctx.user, ctx.session.method),
				hasPassword: !!ctx.user.password,
			}
		}),
	updateProfile: publicProcedure
		.use(authMiddleware())
		.input(z.object({
			name: z.string().min(1).max(80),
			company: z.string().min(1).max(80),
			email: z.email(),
		}))
		.mutation(async ({ ctx, input }) => {
			const user = await dataSource.getRepository(User).findOneBy({ id: ctx.user.id })
			if (!user) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found.' })
			}

			const before = accountSnapshot(user)
			user.name = input.name
			user.company = input.company

			if (user.email !== input.email && ctx.user.role === UserRole.ADMIN) {
				user.email = input.email
				user.emailVerified = false
				user.emailVerificationCode = randomBytes(8).toString('hex')
			}

			await dataSource.transaction(async (em) => {
				await em.getRepository(User).update(user.id, {
					name: user.name, company: user.company, email: user.email,
					emailVerified: user.emailVerified, emailVerificationCode: user.emailVerificationCode,
				})
				if (!user.emailVerified) {
					await mailerEmailVerificationQueue.push({ userId: user.id })
				}
				await recordAudit(em, { actorId: ctx.user.id, action: 'user.updated', targetType: 'user', targetId: user.id, before, after: accountSnapshot(user), req: ctx.req })
			})

			return formatPublicUser(user)
		}),
	findById: publicProcedure
		.use(authMiddleware(userManagerOrAdmin))
		.input(z.string())
		.query(async ({ ctx, input }) => {
			const user = await dataSource.getRepository(User).findOneBy(
				ctx.user.role === UserRole.ADMIN ? { id: input } : { regionId: ctx.user.regionId, id: input },
			)
			if (!user) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found.' })
			}

			return formatPublicUser(user)
		}),
	update: publicProcedure
		.use(authMiddleware(userManagerOrAdmin))
		.input(z.object({
			id: z.uuid(),
			name: z.string().min(1).max(80),
			company: z.string().min(1).max(80),
			regionId: z.uuid('Invalid region'),
			email: z.email(),
			role: z.enum(UserRole),
			groupIds: z.uuid('Invalid group').array(),
			maintenanceContact: z.boolean().optional(),
		}))
		.mutation(async ({ ctx, input }) => {
			const user = await dataSource.getRepository(User).findOneBy(
				ctx.user.role === UserRole.ADMIN ? { id: input.id } : { regionId: ctx.user.regionId, id: input.id },
			)
			if (!user) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found.' })
			}

			if (ctx.user.role !== UserRole.ADMIN && user.id !== ctx.user.id &&
				[UserRole.ADMIN, UserRole.MANAGER].includes(user.role)) {
				throw new TRPCError({ code: 'FORBIDDEN', message: 'Only admins can change admin or manager accounts.' })
			}
			const groupsBefore = (await dataSource.getRepository(UserGroup).findBy({ userId: user.id })).map((row) => row.groupId)
			const before = accountSnapshot(user, groupsBefore)
			const isCurrentUserManager = ctx.user.role === UserRole.MANAGER && ctx.user.id === user.id
			/* When managers edit their own profile, only name, email, and company are updated
			 Allow updating name, email, and company for all users */
			user.name = input.name
			user.company = input.company

			// Moving an account to an address the editor controls would let them
			// reset its password, so only admins change someone else's email,
			// and the change signs the account out everywhere.
			const emailChanged = user.email !== input.email
			if (emailChanged && ctx.user.role !== UserRole.ADMIN && user.id !== ctx.user.id) {
				throw new TRPCError({ code: 'FORBIDDEN', message: 'Only admins can change another user\'s email address.' })
			}
			if (emailChanged) {
				user.email = input.email
				user.emailVerified = false
				user.emailVerificationCode = randomBytes(8).toString('hex')
			}

			let shouldUpdateUserGroups = false
			if (ctx.user.role === UserRole.ADMIN) {
				user.regionId = input.regionId
				user.role = input.role
				user.maintenanceContact = input.role === UserRole.ADMIN && (input.maintenanceContact ?? false)
				shouldUpdateUserGroups = true
			} else if (ctx.user.role === UserRole.MANAGER) {
				if (!isCurrentUserManager) {
					if (input.role === UserRole.ADMIN || input.role === UserRole.MANAGER) {
						throw new TRPCError({ code: 'FORBIDDEN', message: 'Managers cannot set admin or manager roles.' })
					}
					// A manager's scope is their region: they cannot move an
					// account out of it.
					if (input.regionId !== user.regionId) {
						throw new TRPCError({ code: 'FORBIDDEN', message: 'Only admins can change a user\'s region.' })
					}
					shouldUpdateUserGroups = true
					if (input.role === UserRole.MEMBER || input.role === UserRole.GUEST) {
						user.role = input.role
					}
				}
			}

			await dataSource.transaction(async (em) => {
				await em.getRepository(User).update(user.id, {
					name: user.name, company: user.company, email: user.email,
					emailVerified: user.emailVerified, emailVerificationCode: user.emailVerificationCode,
					...(emailChanged ? { resetPasswordToken: null, resetPasswordExpiresAt: null } : {}),
					...(shouldUpdateUserGroups ? { regionId: user.regionId, role: user.role } : {}),
					...(ctx.user.role === UserRole.ADMIN ? { maintenanceContact: user.maintenanceContact } : {}),
				})
				if (shouldUpdateUserGroups) {
					await em.getRepository(UserGroup).delete({userId: user.id})
					user.userGroups = input.groupIds.map((groupId) => {
						const userGroup = new UserGroup()
						userGroup.groupId = groupId
						userGroup.userId = user.id
						return userGroup
					})
					await em.getRepository(UserGroup).save(user.userGroups)
				}
				if (emailChanged && user.id !== ctx.user.id) {
					await em.getRepository(LoginToken).delete({ userId: user.id })
					await revokeUserSessions(user.id, { em })
				}
				if (!user.emailVerified) {
					await mailerEmailVerificationQueue.push({ userId: user.id })
				}
				await recordAudit(em, {
					actorId: ctx.user.id, action: 'user.updated', targetType: 'user', targetId: user.id, before,
					after: accountSnapshot(user, shouldUpdateUserGroups ? input.groupIds : groupsBefore), req: ctx.req,
				})
			})

			return formatPublicUser(user)
		}),
	// The code alone proves the mailbox, so the link also works in a browser
	// that is not signed in, such as the phone the email was opened on.
	verifyEmail: publicProcedure
		.input(z.string().min(1).max(100))
		.mutation(async ({ ctx, input }) => {
			enforce(`verify-email:ip:${ctx.req.ip}`, 10, 15 * MINUTE)
			const user = await dataSource.getRepository(User).findOneBy({ emailVerificationCode: input })
			if (!user) throw new TRPCError({ code: 'BAD_REQUEST', message: 'This confirmation link is invalid or has already been used.' })

			const verified = await dataSource.getRepository(User).update(
				{ id: user.id, emailVerificationCode: input },
				{ emailVerified: true, emailVerificationCode: null },
			)
			if (!verified.affected) throw new TRPCError({ code: 'BAD_REQUEST', message: 'This confirmation link is invalid or has already been used.' })
			if (!user.approved) {
				await mailerRequestApprovalQueue.push({ requesterId: user.id })
			}
		}),
	// Lets someone who mistyped their address at sign-up fix it. The new
	// address is confirmed like the first one, and approval is decided again
	// by its domain, as at sign-up.
	changeUnverifiedEmail: publicProcedure
		.use(authMiddleware())
		.input(z.email())
		.mutation(async ({ ctx, input }) => {
			enforce(`change-unverified-email:user:${ctx.user.id}`, 5, 60 * MINUTE)
			if (ctx.user.emailVerified) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Email already verified.' })
			if (input === ctx.user.email) throw new TRPCError({ code: 'BAD_REQUEST', message: 'This is already your email address.' })
			const user = await dataSource.getRepository(User).findOneByOrFail({ id: ctx.user.id })
			const before = accountSnapshot(user)
			user.email = input
			user.emailVerificationCode = randomBytes(12).toString('hex')
			user.approved = await dataSource.getRepository(AuthorizedDomain).exists({ where: { domain: input.split('@').pop() } })
			try {
				await dataSource.transaction(async (em) => {
					await em.getRepository(User).update(user.id, {
						email: user.email, emailVerificationCode: user.emailVerificationCode, approved: user.approved,
						resetPasswordToken: null, resetPasswordExpiresAt: null,
					})
					await em.getRepository(LoginToken).delete({ userId: user.id })
					await mailerEmailVerificationQueue.push({ userId: user.id })
					await recordAudit(em, { actorId: user.id, action: 'user.updated', targetType: 'user', targetId: user.id, before, after: accountSnapshot(user), req: ctx.req })
				})
			} catch (error) {
				if (/^Key \(email\)=\(.+\) already exists.$/.test(error.detail)) {
					throw new TRPCError({ code: 'BAD_REQUEST', message: 'Email address already taken.' })
				}
				throw error
			}
		}),
	list:
		publicProcedure
			.use(authMiddleware(userManagerOrAdmin))
			.query(async ({ ctx }) => {
				const users = await dataSource.getRepository(User).find({
					where: ctx.user.role === UserRole.ADMIN ? {} : { regionId: ctx.user.regionId },
					relations: {
						region: true,
						userGroups: {
							group: true,
						},
					},
				})
				return users.map((user) => formatPublicUserForAdmin(user, ctx.user))
			}),
	approve:
		publicProcedure
			.use(authMiddleware(userManagerOrAdmin))
			.input(z.uuid())
			.mutation(async ({ ctx, input }) => {
				const user = await dataSource.getRepository(User).findOneBy(
					ctx.user.role === UserRole.ADMIN ? { id: input } : { regionId: ctx.user.regionId, id: input },
				)
				if (!user) {
					throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found.' })
				} else if (ctx.user.role !== UserRole.ADMIN && [UserRole.ADMIN, UserRole.MANAGER].includes(user.role)) {
					throw new TRPCError({ code: 'FORBIDDEN', message: 'Only admins can approve admin or manager accounts.' })
				} else if (user.approved) {
					throw new TRPCError({ code: 'BAD_REQUEST', message: 'User already approved.' })
				} else if (!user.emailVerified) {
					throw new TRPCError({ code: 'BAD_REQUEST', message: 'This user has not confirmed their email address yet.' })
				}

				user.approved = true
				await dataSource.transaction(async (em) => {
					await mailerUserApprovedEmailQueue.push({ userId: user.id })
					await em.getRepository(User).update(user.id, { approved: true })
					await recordAudit(em, { actorId: ctx.user.id, action: 'user.approved', targetType: 'user', targetId: user.id, req: ctx.req })
				})
			}),
	remove:
		publicProcedure
			.use(authMiddleware(userManagerOrAdmin))
			.input(z.uuid())
			.mutation(async ({ ctx, input }) => {
				const user = await dataSource.getRepository(User).findOneBy(
					ctx.user.role === UserRole.ADMIN ? { id: input } : { regionId: ctx.user.regionId, id: input },
				)
				if (!user) {
					throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found.' })
				} else if ([UserRole.ADMIN, UserRole.MANAGER].includes(user.role) && ctx.user.role !== UserRole.ADMIN) {
					throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have permission to delete an admin or manager user.' })
				}
				await recordAudit(null, { actorId: ctx.user.id, action: 'user.deleted', targetType: 'user', targetId: user.id, before: { role: user.role, regionId: user.regionId }, req: ctx.req })
				await removeUser(user)
			}),
	removeAccount:
		publicProcedure
			.use(authMiddleware())
			.input(z.uuid())
			.mutation(async ({ ctx, input }) => {
				if (ctx.user.id !== input) {
					throw new TRPCError({
						code: 'FORBIDDEN',
						message: 'You can only remove your own account.',
					})
				}
				await recordAudit(null, { actorId: ctx.user.id, action: 'user.deleted', targetType: 'user', targetId: ctx.user.id, before: { role: ctx.user.role, regionId: ctx.user.regionId }, req: ctx.req })
				await removeUser(ctx.user)
			}),
	resendVerificationEmail: publicProcedure
		.use(authMiddleware())
		.input(z.uuid())
		.mutation(async ({ ctx, input }) => {
			if (input !== ctx.user.id) throw new TRPCError({ code: 'FORBIDDEN' })
			const user = await dataSource.getRepository(User).findOneBy({ id: input })
			if (!user) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found.' })
			}
			if (user.emailVerified) {
				throw new TRPCError({ code: 'BAD_REQUEST', message: 'Email already verified.' })
			}

			try {
				await mailerEmailVerificationQueue.push({ userId: user.id })
			} catch (error) {
				throw new TRPCError({ code: 'BAD_REQUEST', message: 'Could not verify email.' })
			}
		}),
	resendVerificationEmailFor: publicProcedure
		.use(authMiddleware(userManagerOrAdmin))
		.input(z.uuid())
		.mutation(async ({ ctx, input }) => {
			const user = await managedUser(ctx.user, input)
			if (user.emailVerified) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Email already verified.' })
			await mailerEmailVerificationQueue.push({ userId: user.id })
			await recordAudit(null, { actorId: ctx.user.id, action: 'user.verification_resent', targetType: 'user', targetId: user.id, req: ctx.req })
		}),
	// For a user whose verification mail never arrives: the approver vouches
	// for the address instead of the link.
	markEmailVerifiedFor: publicProcedure
		.use(authMiddleware(userManagerOrAdmin))
		.input(z.uuid())
		.mutation(async ({ ctx, input }) => {
			const user = await managedUser(ctx.user, input)
			if (user.emailVerified) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Email already verified.' })
			await dataSource.transaction(async (em) => {
				await em.getRepository(User).update(user.id, { emailVerified: true, emailVerificationCode: null })
				await recordAudit(em, { actorId: ctx.user.id, action: 'user.email_verified', targetType: 'user', targetId: user.id, req: ctx.req })
			})
		}),
	sendPasswordResetFor: publicProcedure
		.use(authMiddleware(userManagerOrAdmin))
		.input(z.uuid())
		.mutation(async ({ ctx, input }) => {
			const user = await managedUser(ctx.user, input)
			if (user.suspendedAt) throw new TRPCError({ code: 'BAD_REQUEST', message: 'This account is suspended.' })
			await mailerResetPasswordQueue.push({ userId: user.id })
			await recordAudit(null, { actorId: ctx.user.id, action: 'password.reset_sent', targetType: 'user', targetId: user.id, req: ctx.req })
		}),
	// Blocks sign-in and ends every session, keeping the account and its data.
	suspend: publicProcedure
		.use(authMiddleware(userManagerOrAdmin))
		.input(z.uuid())
		.mutation(async ({ ctx, input }) => {
			if (input === ctx.user.id) throw new TRPCError({ code: 'BAD_REQUEST', message: 'You cannot suspend your own account.' })
			const user = await managedUser(ctx.user, input)
			await dataSource.transaction(async (em) => {
				await em.getRepository(User).update(user.id, { suspendedAt: new Date() })
				await em.getRepository(LoginToken).delete({ userId: user.id })
				await revokeUserSessions(user.id, { em })
				await recordAudit(em, { actorId: ctx.user.id, action: 'user.suspended', targetType: 'user', targetId: user.id, req: ctx.req })
			})
		}),
	resume: publicProcedure
		.use(authMiddleware(userManagerOrAdmin))
		.input(z.uuid())
		.mutation(async ({ ctx, input }) => {
			const user = await managedUser(ctx.user, input)
			await dataSource.getRepository(User).update(user.id, { suspendedAt: null, failedLoginCount: 0, lockedUntil: null })
			await recordAudit(null, { actorId: ctx.user.id, action: 'user.resumed', targetType: 'user', targetId: user.id, req: ctx.req })
		}),
	revokeSessions: publicProcedure
		.use(authMiddleware(userManagerOrAdmin))
		.input(z.uuid())
		.mutation(async ({ ctx, input }) => {
			const user = await managedUser(ctx.user, input)
			await revokeUserSessions(user.id, { exceptSessionId: ctx.session.id })
			await recordAudit(null, { actorId: ctx.user.id, action: 'session.revoked', targetType: 'user', targetId: user.id, after: { all: true }, req: ctx.req })
		}),
	// For a user who lost their authenticator and recovery codes. They sign in
	// with their password and, if their role requires it, enrol again.
	resetMfa: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(z.uuid())
		.mutation(async ({ ctx, input }) => {
			const user = await dataSource.getRepository(User).findOneBy({ id: input })
			if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found.' })
			await dataSource.transaction(async (em) => {
				await em.getRepository(User).update(user.id, { mfaEnabledAt: null, mfaSecret: null, mfaRecoveryCodes: [], mfaLastStep: null })
				await revokeUserSessions(user.id, { em })
				await recordAudit(em, { actorId: ctx.user.id, action: 'mfa.reset', targetType: 'user', targetId: user.id, req: ctx.req })
			})
		}),
	// Periodic access review: who has which access, as a CSV.
	accessReview: publicProcedure
		.use(authMiddleware(userManagerOrAdmin))
		.query(async ({ ctx }) => {
			const users = await dataSource.getRepository(User).find({
				where: ctx.user.role === UserRole.ADMIN ? {} : { regionId: ctx.user.regionId },
				relations: { region: true, userGroups: { group: true } },
				order: { email: 'ASC' },
			})
			const header = ['email', 'name', 'company', 'role', 'region', 'groups', 'approved', 'email_verified', 'mfa', 'mfa_required', 'suspended_at', 'last_login_at', 'created_at']
			const rows = users.map((user) => [
				user.email, user.name, user.company, user.role, user.region?.name ?? '',
				user.userGroups.map((userGroup) => userGroup.group.name).sort().join('; '),
				user.approved, user.emailVerified, !!user.mfaEnabledAt, mfaRequiredRoles().includes(user.role),
				user.suspendedAt, user.lastLoginAt, user.createdAt,
			])
			await recordAudit(null, { actorId: ctx.user.id, action: 'access_review.exported', targetType: 'user', after: { rows: rows.length }, req: ctx.req })
			return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n'
		}),
	// A copy of everything Damvia holds about the signed-in person.
	exportMyData: publicProcedure
		.use(authMiddleware())
		.mutation(async ({ ctx }) => {
			enforce(`export-data:user:${ctx.user.id}`, 3, 60 * MINUTE)
			const data = await exportUserData(ctx.user.id)
			await recordAudit(null, { actorId: ctx.user.id, action: 'user.data_exported', targetType: 'user', targetId: ctx.user.id, req: ctx.req })
			return data
		}),
	// For a request received by other means, such as email to the organisation.
	exportData: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(z.uuid())
		.mutation(async ({ ctx, input }) => {
			const data = await exportUserData(input)
			if (!data) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found.' })
			await recordAudit(null, { actorId: ctx.user.id, action: 'user.data_exported', targetType: 'user', targetId: input, req: ctx.req })
			return data
		})
})
