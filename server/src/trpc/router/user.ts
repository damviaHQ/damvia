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
import { randomBytes } from "node:crypto"
import { z } from 'zod'
import { User, UserRole } from "../../entity/user"
import { dataSource, passwordLessAuth } from "../../env"
import { createUser, generateAuthToken, hashPassword, removeUser } from "../../services/user"
import {
	mailerEmailVerificationQueue,
	mailerLogInQueue,
	mailerRequestApprovalQueue,
	mailerResetPasswordQueue,
	mailerUserApprovedEmailQueue
} from "../../worker"
import { authMiddleware, publicProcedure, router, userManagerOrAdmin } from "../index"

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

export function formatPublicUserForAdmin(user: User) {
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
		createdAt: user.createdAt,
		updatedAt: user.updatedAt,
		group: user.group ? { id: user.group.id, name: user.group.name } : null,
	}
}

export default router({
	create: publicProcedure
		.input(
			z.object({
				name: z.string().min(1).max(80),
				company: z.string().min(1).max(80),
				regionId: z.string().uuid('Invalid region'),
				email: z.string().email(),
				password: passwordLessAuth() ? z.string() : z.string().min(6).max(100),
			}),
		)
		.mutation(async ({ input }) => {
			try {
				const user = await createUser({
					name: input.name,
					company: input.company,
					regionId: input.regionId,
					email: input.email,
					password: input.password ?? null,
				})
				return generateAuthToken(user)
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
	login: publicProcedure
		.input(
			z.object({
				email: z.string().email(),
				password: z.string(),
				magicLink: z.boolean().nullable().optional(),
			}),
		)
		.mutation(async ({ input }) => {
			const user = await dataSource.getRepository(User).findOneBy({ email: input.email })
			const usePasswordAuthentication = !passwordLessAuth() && !input.magicLink
			if (!user || (usePasswordAuthentication && user.password !== hashPassword(input.password))) {
				throw new TRPCError({
					code: 'NOT_FOUND',
					message: passwordLessAuth() ? 'User not found.' : 'Invalid email or password.',
				})
			} else if (usePasswordAuthentication) {
				return generateAuthToken(user)
			}

			await mailerLogInQueue.push({ userId: user.id })
			return null
		}),
	sendResetPasswordEmail: publicProcedure
		.input(z.string().email())
		.mutation(async ({ input }) => {
			const user = await dataSource.getRepository(User).findOneBy({ email: input })
			if (!user) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found.' })
			}

			user.resetPasswordToken = randomBytes(8).toString('hex')
			await dataSource.getRepository(User).save(user)
			await mailerResetPasswordQueue.push({ userId: user.id })
		}),
	resetPassword: publicProcedure
		.input(
			z.object({
				email: z.string().email(),
				token: z.string(),
				newPassword: z.string().min(6).max(100),
			})
		)
		.mutation(async ({ input }) => {
			const user = await dataSource.getRepository(User).findOneBy({ email: input.email })
			if (!user) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found.' })
			} else if (user.resetPasswordToken !== input.token) {
				throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid token.' })
			}

			user.resetPasswordToken = null
			user.password = hashPassword(input.newPassword)
			await dataSource.getRepository(User).save(user)
			return generateAuthToken(user)
		}),
	me: publicProcedure
		.use(authMiddleware())
		.query(async ({ ctx }) => {
			return {
				id: ctx.user.id,
				name: ctx.user.name,
				company: ctx.user.company,
				email: ctx.user.email,
				emailVerified: ctx.user.emailVerified,
				approved: ctx.user.approved,
				role: ctx.user.role,
				regionId: ctx.user.regionId,
			}
		}),
	updateProfile: publicProcedure
		.use(authMiddleware())
		.input(z.object({
			name: z.string().min(1).max(80),
			company: z.string().min(1).max(80),
			email: z.string().email(),
		}))
		.mutation(async ({ ctx, input }) => {
			const user = await dataSource.getRepository(User).findOneBy({ id: ctx.user.id })
			if (!user) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found.' })
			}

			user.name = input.name
			user.company = input.company

			if (user.email !== input.email && ctx.user.role === UserRole.ADMIN) {
				user.email = input.email
				user.emailVerified = false
				user.emailVerificationCode = randomBytes(8).toString('hex')
			}

			await dataSource.transaction(async (em) => {
				await em.getRepository(User).save(user)
				await mailerEmailVerificationQueue.push({ userId: user.id })
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
			id: z.string().uuid(),
			name: z.string().min(1).max(80),
			company: z.string().min(1).max(80),
			regionId: z.string().uuid('Invalid region'),
			email: z.string().email(),
			role: z.nativeEnum(UserRole),
			groupId: z.string().uuid('Invalid group'),
		}))
		.mutation(async ({ ctx, input }) => {
			const user = await dataSource.getRepository(User).findOneBy(
				ctx.user.role === UserRole.ADMIN ? { id: input.id } : { regionId: ctx.user.regionId, id: input.id },
			)
			if (!user) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found.' })
			}

			const isCurrentUserManager = ctx.user.role === UserRole.MANAGER && ctx.user.id === user.id
			/* When managers edit their own profile, only name, email, and company are updated
			 Allow updating name, email, and company for all users */
			user.name = input.name
			user.company = input.company

			if (user.email !== input.email) {
				user.email = input.email
				user.emailVerified = false
				user.emailVerificationCode = randomBytes(8).toString('hex')
			}

			if (ctx.user.role === UserRole.ADMIN) {
				user.regionId = input.regionId
				user.role = input.role
				user.groupId = input.groupId
			} else if (ctx.user.role === UserRole.MANAGER) {
				if (!isCurrentUserManager) {
					if (input.role === UserRole.ADMIN || input.role === UserRole.MANAGER) {
						throw new TRPCError({ code: 'FORBIDDEN', message: 'Managers cannot set admin or manager roles.' })
					}
					user.regionId = input.regionId
					user.groupId = input.groupId
					if (input.role === UserRole.MEMBER || input.role === UserRole.GUEST) {
						user.role = input.role
					}
				}
			}

			await dataSource.transaction(async (em) => {
				await em.getRepository(User).save(user)
				await mailerEmailVerificationQueue.push({ userId: user.id })
			})

			return user
		}),
	verifyEmail: publicProcedure
		.use(authMiddleware())
		.input(z.string())
		.mutation(async ({ ctx, input }) => {
			if (ctx.user.emailVerificationCode !== input) {
				throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid verification code.' })
			}

			ctx.user.emailVerified = true
			ctx.user.emailVerificationCode = null
			await dataSource.getRepository(User).save(ctx.user)
			if (!ctx.user.approved) {
				await mailerRequestApprovalQueue.push({ requesterId: ctx.user.id })
			}
		}),
	list:
		publicProcedure
			.use(authMiddleware(userManagerOrAdmin))
			.query(async ({ ctx }) => {
				const users = await dataSource.getRepository(User).find({
					where: ctx.user.role === UserRole.ADMIN ? {} : { regionId: ctx.user.regionId },
					relations: ['region', 'group'],
				})
				return users.map(formatPublicUserForAdmin)
			}),
	approve:
		publicProcedure
			.use(authMiddleware(userManagerOrAdmin))
			.input(z.string().uuid())
			.mutation(async ({ ctx, input }) => {
				const user = await dataSource.getRepository(User).findOneBy(
					ctx.user.role === UserRole.ADMIN ? { id: input } : { regionId: ctx.user.regionId, id: input },
				)
				if (!user) {
					throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found.' })
				} else if (user.approved) {
					throw new TRPCError({ code: 'BAD_REQUEST', message: 'User already approved.' })
				}

				user.approved = true
				await dataSource.transaction(async (em) => {
					await mailerUserApprovedEmailQueue.push({ userId: user.id })
					await em.getRepository(User).save(user)
				})
			}),
	remove:
		publicProcedure
			.use(authMiddleware(userManagerOrAdmin))
			.input(z.string().uuid())
			.mutation(async ({ ctx, input }) => {
				const user = await dataSource.getRepository(User).findOneBy(
					ctx.user.role === UserRole.ADMIN ? { id: input } : { regionId: ctx.user.regionId, id: input },
				)
				if (!user) {
					throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found.' })
				} else if (user.role === UserRole.ADMIN && ctx.user.role !== UserRole.ADMIN) {
					throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have permission to delete an admin user.' })
				}
				await removeUser(user)
			}),
	removeAccount:
		publicProcedure
			.use(authMiddleware())
			.input(z.string().uuid())
			.mutation(async ({ ctx, input }) => {
				if (ctx.user.id !== input) {
					throw new TRPCError({
						code: 'FORBIDDEN',
						message: 'You can only remove your own account.',
					})
				}
				await removeUser(ctx.user)
			}),
	resendVerificationEmail: publicProcedure
		.input(z.string())
		.mutation(async ({ input }) => {
			const user = await dataSource.getRepository(User).findOneBy({ id: input })
			if (!user) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found.' })
			}
			if (user.emailVerified) {
				throw new TRPCError({ code: 'BAD_REQUEST', message: 'Email already verified.' })
			}

			try {
				await mailerEmailVerificationQueue.push({ userId: user.id })
				return generateAuthToken(user)
			} catch (error) {
				throw new TRPCError({ code: 'BAD_REQUEST', message: 'Could not verify email.' })
			}
		})
})
