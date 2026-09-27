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
import {TRPCError} from "@trpc/server"
import {z} from "zod"
import {Group} from "../../entity/group"
import {Region} from "../../entity/region"
import {dataSource} from "../../env"
import {authMiddleware, publicProcedure, router, userAdmin, userManagerOrAdmin} from "../index"
import {UserGroup} from "../../entity/user-group";

export function formatGroup(group: Group) {
	return {
		id: group.id,
		name: group.name,
		isDefault: group.default,
	}
}

export default router({
	list: publicProcedure
		.use(authMiddleware(userManagerOrAdmin))
		.query(async () => {
			const groups = await dataSource.getRepository(Group).find()
			return groups.map(formatGroup)
		}),
	create: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(
			z.object({
				name: z.string().min(1).max(80),
			}),
		)
		.mutation(async ({ input }) => {
			const group = new Group()
			group.name = input.name
			await dataSource.getRepository(Group).save(group)
			return formatGroup(group)
		}),
	setDefault: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(z.uuid())
		.mutation(async ({ input }) => {
			const group = await dataSource.getRepository(Group).findOneBy({ id: input })
			if (!group) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Group not found.' })
			}

			const defaultGroup = await dataSource.getRepository(Group).findOneBy({ default: true })
			if (defaultGroup?.id === group.id) {
				return
			}

			group.default = true
			if (defaultGroup) {
				defaultGroup.default = false
				await dataSource.getRepository(Group).save([defaultGroup, group])
			} else {
				await dataSource.getRepository(Group).save(group)
			}
		}),
	update: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(
			z.object({
				id: z.uuid(),
				name: z.string().min(1).max(80),
			})
		)
		.mutation(async ({ input }) => {
			const group = await dataSource.getRepository(Group).findOneBy({ id: input.id })
			if (!group) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Group not found.' })
			}

			group.name = input.name
			await dataSource.getRepository(Group).save(group)
		}),
	remove: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(z.uuid())
		.mutation(async ({ input }) => {
			const group = await dataSource.getRepository(Group).findOneBy({ id: input })
			if (!group) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Group not found.' })
			} else if (group.default) {
				throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot remove default group.' })
			}

			const usersCount = await dataSource.getRepository(UserGroup).countBy({ groupId: group.id })
			const regionsCount = await dataSource.getRepository(Region).countBy({ defaultGroupId: group.id })

			if (usersCount > 0 || regionsCount > 0) {
				throw new TRPCError({ code: 'BAD_REQUEST', message: 'Group has users or is default for regions. Please move them first.' })
			}
			// Dropping the id from a collection could leave it with no group and so
			// open it to every member: the admin merges the group instead.
			const [{ count: collectionsCount }] = await dataSource.query(
				`SELECT count(*)::int AS count FROM collections WHERE $1 = ANY(limited_to_group_ids) OR action_bar::text LIKE '%' || $1 || '%'`,
				[group.id],
			)
			if (collectionsCount > 0) {
				throw new TRPCError({ code: 'BAD_REQUEST', message: 'Group still limits access to collections or their tools. Move it into another group first.' })
			}

			await dataSource.getRepository(Group).remove(group)
		}),
	moveUsersAndRegions: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(z.object({
			fromGroupId: z.uuid(),
			toGroupId: z.uuid(),
		}))
		.mutation(async ({ input }) => {
			const fromGroup = await dataSource.getRepository(Group).findOneBy({ id: input.fromGroupId })
			const toGroup = await dataSource.getRepository(Group).findOneBy({ id: input.toGroupId })

			if (!fromGroup || !toGroup) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'One or both groups not found.' })
			}

			if (fromGroup.id === toGroup.id) return

			await dataSource.transaction(async (em) => {
				// A person already in both groups keeps a single membership.
				await em.query('DELETE FROM user_groups f USING user_groups t WHERE f.group_id = $1 AND t.group_id = $2 AND t.user_id = f.user_id', [fromGroup.id, toGroup.id])
				await em.getRepository(UserGroup).update({ groupId: fromGroup.id }, { groupId: toGroup.id })
				await em.getRepository(Region).update({ defaultGroupId: fromGroup.id }, { defaultGroupId: toGroup.id })
				// Collections and their tool rules follow the merge, so nobody gains or
				// loses access through a stale id. Group triggers re-apply inheritance.
				await em.query(`
					UPDATE collections SET limited_to_group_ids = ARRAY(SELECT DISTINCT unnest(array_replace(limited_to_group_ids, $1, $2)))
					WHERE $1 = ANY(limited_to_group_ids)
				`, [fromGroup.id, toGroup.id])
				await em.query(`
					UPDATE collections SET action_bar = replace(action_bar::text, $1, $2)::jsonb
					WHERE action_bar::text LIKE '%' || $1 || '%'
				`, [fromGroup.id, toGroup.id])
			})
		}),
})
