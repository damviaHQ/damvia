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
import { z } from "zod"
import { Organisation } from "../../entity/organisation"
import { User, UserRole } from "../../entity/user"
import { dataSource } from "../../env"
import { authMiddleware, publicProcedure, router, userAdmin, userManagerOrAdmin } from "../index"

const NAME_TAKEN = 'An organisation with this name already exists.'

async function assertNameFree(name: string, id?: string) {
	const [taken] = await dataSource.query(
		`SELECT 1 FROM organisations WHERE lower(name) = lower($1) AND id IS DISTINCT FROM $2`,
		[name, id ?? null],
	)
	if (taken) {
		throw new TRPCError({ code: 'CONFLICT', message: NAME_TAKEN })
	}
}

// The unique index decides between two writes of the same name at once.
function nameTaken(error: any): never {
	if (error?.code === '23505') throw new TRPCError({ code: 'CONFLICT', message: NAME_TAKEN })
	throw error
}

export default router({
	// Managers read it to set the organisation of the users they manage, and
	// only count the users of their region, the only ones they see.
	list: publicProcedure
		.use(authMiddleware(userManagerOrAdmin))
		.query(async ({ ctx }) => {
			return dataSource.query(`
				SELECT organisations.id, organisations.name, count(users.id)::int AS "userCount"
				FROM organisations
				LEFT JOIN users ON users.organisation_id = organisations.id AND ($1::uuid IS NULL OR users.region_id = $1)
				GROUP BY organisations.id
				ORDER BY lower(organisations.name)
			`, [ctx.user.role === UserRole.ADMIN ? null : ctx.user.regionId]) as Promise<{ id: string, name: string, userCount: number }[]>
		}),
	create: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(z.object({ name: z.string().trim().min(1).max(80) }))
		.mutation(async ({ input }) => {
			await assertNameFree(input.name)
			const organisation = await dataSource.getRepository(Organisation).save({ name: input.name }).catch(nameTaken)
			return { id: organisation.id, name: organisation.name, userCount: 0 }
		}),
	update: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(z.object({ id: z.uuid(), name: z.string().trim().min(1).max(80) }))
		.mutation(async ({ input }) => {
			const organisation = await dataSource.getRepository(Organisation).findOneBy({ id: input.id })
			if (!organisation) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Organisation not found.' })
			}
			await assertNameFree(input.name, organisation.id)
			await dataSource.getRepository(Organisation).update(organisation.id, { name: input.name }).catch(nameTaken)
		}),
	// Its members stay, without an organisation.
	remove: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(z.uuid())
		.mutation(async ({ input }) => {
			const organisation = await dataSource.getRepository(Organisation).findOneBy({ id: input })
			if (!organisation) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Organisation not found.' })
			}
			const userCount = await dataSource.getRepository(User).countBy({ organisationId: organisation.id })
			await dataSource.getRepository(Organisation).delete(organisation.id)
			return { unassignedUsers: userCount }
		}),
})
