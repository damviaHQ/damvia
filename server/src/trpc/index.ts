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
import { ZodError } from "zod"
import { User, UserRole } from "../entity/user"
import { getUserFromRequest } from "../services/user"

export const t = initTRPC.context<typeof createContext>().create({
	errorFormatter({ shape, error }) {
		if (error.code === 'BAD_REQUEST' && error.cause instanceof ZodError) {
			return {
				...shape,
				message: 'Invalid request.',
				data: {
					...shape.data,
					fieldErrors: error.cause.flatten().fieldErrors,
				},
			}
		}
		return shape
	}
})

export async function createContext({ req, res }: CreateFastifyContextOptions) {
	return { req, res, user: await getUserFromRequest(req) }
}

export const middleware = t.middleware
export const router = t.router
export const publicProcedure = t.procedure
export const authMiddleware =
	(...chain: ((u: User) => boolean)[]) =>
		middleware((opts) => {
			if (!opts.ctx.user || !chain.every((h) => h(opts.ctx.user))) {
				throw new TRPCError({ code: 'UNAUTHORIZED' })
			}
			return opts.next()
		})
export const userApproved = (u: User) => u?.approved && u?.emailVerified
export const userAdmin = (u: User) => u?.role === UserRole.ADMIN
export const userMember = (u: User) => [UserRole.ADMIN, UserRole.MANAGER, UserRole.MEMBER].includes(u?.role)
export const userManagerOrAdmin = (u: User) => [UserRole.ADMIN, UserRole.MANAGER].includes(u?.role)

export { default as appRouter, AppRouter } from './router'
