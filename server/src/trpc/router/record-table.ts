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
import { dataSource } from "../../env"
import { createTable, listTables, tableExists, uniqueName } from "../../services/record-tables"
import { moveRecords } from "../../services/records"
import { authMiddleware, publicProcedure, router, userAdmin } from "../index"

const name = z.string().trim().min(1).max(100)

export default router({
	list: publicProcedure
		.use(authMiddleware(userAdmin))
		.query(() => listTables(dataSource.manager)),
	// A taken name gets a number: "Shoes (1)".
	create: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(z.object({ name, fieldIds: z.array(z.uuid()).max(1000).optional() }))
		.mutation(async ({ input }) => {
			const id = await dataSource.transaction((em) => createTable(em, input.name, input.fieldIds ?? []))
			return (await listTables(dataSource.manager)).find((table) => table.id === id)!
		}),
	rename: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(z.object({ id: z.uuid(), name }))
		.mutation(async ({ input }) => {
			await tableExists(dataSource.manager, input.id)
			const taken: { name: string }[] = await dataSource.query('SELECT name FROM record_tables WHERE id <> $1', [input.id])
			if (uniqueName(input.name, taken.map((row) => row.name)) !== input.name) {
				throw new TRPCError({ code: 'CONFLICT', message: `A table named ${input.name} already exists.` })
			}
			await dataSource.query('UPDATE record_tables SET name = $2, updated_at = now() WHERE id = $1', [input.id, input.name])
			return listTables(dataSource.manager)
		}),
	reorder: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(z.object({ ids: z.array(z.uuid()).min(1).max(1000) }))
		.mutation(async ({ input }) => {
			await dataSource.query(`
				UPDATE record_tables t SET position = o.position - 1, updated_at = now()
				FROM unnest($1::uuid[]) WITH ORDINALITY AS o(id, position) WHERE t.id = o.id
			`, [input.ids])
			return listTables(dataSource.manager)
		}),
	// The fields a table shows, in order. Values of the others stay on the records.
	setFields: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(z.object({ id: z.uuid(), fieldIds: z.array(z.uuid()).max(1000) }))
		.mutation(async ({ input }) => {
			await dataSource.transaction(async (em) => {
				await tableExists(em, input.id)
				await em.query('DELETE FROM record_table_attributes WHERE table_id = $1', [input.id])
				await em.query(`
					INSERT INTO record_table_attributes (table_id, attribute_id, position)
					SELECT $1, a.id, (o.ord - 1)::int FROM unnest($2::uuid[]) WITH ORDINALITY AS o(id, ord) JOIN record_attributes a ON a.id = o.id
					ON CONFLICT DO NOTHING
				`, [input.id, input.fieldIds])
			})
			return listTables(dataSource.manager)
		}),
	// Shows or hides one field in several tables at once.
	setFieldTables: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(z.object({ fieldId: z.uuid(), tableIds: z.array(z.uuid()).max(1000) }))
		.mutation(async ({ input }) => {
			await dataSource.transaction(async (em) => {
				await em.query('DELETE FROM record_table_attributes WHERE attribute_id = $1 AND NOT (table_id = ANY($2::uuid[]))', [input.fieldId, input.tableIds])
				await em.query(`
					INSERT INTO record_table_attributes (table_id, attribute_id, position)
					SELECT t.id, a.id, (SELECT coalesce(max(position) + 1, 0) FROM record_table_attributes WHERE table_id = t.id)
					FROM record_tables t JOIN record_attributes a ON a.id = $1
					WHERE t.id = ANY($2::uuid[])
					ON CONFLICT DO NOTHING
				`, [input.fieldId, input.tableIds])
			})
			return listTables(dataSource.manager)
		}),
	// A table with records needs somewhere to move them; the last table stays.
	remove: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(z.object({ id: z.uuid(), moveTo: z.uuid().optional() }))
		.mutation(async ({ input, ctx }) => {
			await dataSource.transaction(async (em) => {
				await em.query('LOCK TABLE record_tables IN SHARE ROW EXCLUSIVE MODE')
				await tableExists(em, input.id)
				const [{ tables }] = await em.query('SELECT count(*)::int AS tables FROM record_tables')
				if (tables <= 1) {
					throw new TRPCError({ code: 'BAD_REQUEST', message: 'The last table cannot be removed.' })
				}
				const [{ records }] = await em.query('SELECT count(*)::int AS records FROM records WHERE table_id = $1', [input.id])
				if (records) {
					if (!input.moveTo || input.moveTo === input.id) {
						throw new TRPCError({ code: 'BAD_REQUEST', message: 'This table holds records. Choose a table to move them to.' })
					}
					await tableExists(em, input.moveTo)
					const ids: { id: string }[] = await em.query('SELECT id FROM records WHERE table_id = $1', [input.id])
					await moveRecords(em, ids.map((row) => row.id), input.moveTo, { userId: ctx.user.id, source: 'bulk' })
				}
				await em.query('DELETE FROM record_tables WHERE id = $1', [input.id])
			})
			return listTables(dataSource.manager)
		}),
})
