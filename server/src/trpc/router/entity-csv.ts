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
import { randomUUID } from "node:crypto"
import { z } from "zod"
import { dataSource } from "../../env"
import { rerunEntityStage } from "../../services/enrichment"
import { authMiddleware, publicProcedure, router, userAdmin } from "../index"

const MAX_ROWS = 50000

// One row of the mapping CSV, parsed in the browser like the record import:
// a file name and either a record key or an attribute and its value.
const rows = z.object({
	fileName: z.string().trim().min(1).max(500),
	recordKey: z.string().trim().max(200).optional(),
	attribute: z.string().trim().max(200).optional(),
	value: z.string().trim().max(500).optional(),
}).refine((row) => !!row.recordKey !== !!(row.attribute && row.value), 'Each row needs a record key, or an attribute and a value.').array().min(1).max(MAX_ROWS)

type Row = z.infer<typeof rows>[number]

// A row names a file with or without its extension, so rows compare on the
// name without it.
const fileKey = (fileName: string) => fileName.toLowerCase().replace(/\.[^.]+$/, '')

const identity = (row: { fileName: string, recordKey?: string | null, attribute?: string | null, value?: string | null }) =>
	JSON.stringify([fileKey(row.fileName), row.recordKey || null, row.attribute || null, row.value || null])

async function currentMappings() {
	const current: { file_name: string, record_key: string | null, attribute_name: string | null, attribute_value: string | null }[] = await dataSource.query(`
		SELECT file_name, record_key, attribute_name, attribute_value FROM asset_entity_csv_mappings
	`)
	return current.map((row) => ({ fileName: row.file_name, recordKey: row.record_key, attribute: row.attribute_name, value: row.attribute_value }))
}

export default router({
	summary: publicProcedure
		.use(authMiddleware(userAdmin))
		.query(async () => {
			const [row] = await dataSource.query(`
				SELECT count(*)::int AS rows, max(m.created_at) AS imported_at, (array_agg(u.name))[1] AS imported_by
				FROM asset_entity_csv_mappings m LEFT JOIN users u ON u.id = m.created_by_id
			`)
			return { rows: row.rows as number, importedAt: row.imported_at as Date | null, importedBy: row.imported_by as string | null }
		}),
	// What an import would change, before any write: rows added and removed
	// (a new import replaces the previous one), and keys no record has.
	compare: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(z.object({ rows }))
		.mutation(async ({ input }) => {
			const current = await currentMappings()
			const next = new Set(input.rows.map(identity))
			const previous = new Set(current.map(identity))
			const previousFiles = new Set(current.map((row) => fileKey(row.fileName)))
			const nextFiles = new Set(input.rows.map((row) => fileKey(row.fileName)))
			const added = input.rows.filter((row) => !previous.has(identity(row)))
			const changed = added.filter((row) => previousFiles.has(fileKey(row.fileName)))
			const removed = current.filter((row) => !nextFiles.has(fileKey(row.fileName)) && !next.has(identity(row)))
			const keys = [...new Set(input.rows.map((row) => row.recordKey).filter((key): key is string => !!key))]
			const known: { record_key: string }[] = keys.length ? await dataSource.query('SELECT record_key FROM records WHERE record_key = ANY($1)', [keys]) : []
			const knownKeys = new Set(known.map((row) => row.record_key))
			const names = [...new Set(input.rows.map((row) => row.fileName.toLowerCase()))]
			const [{ files }] = await dataSource.query(`
				SELECT count(DISTINCT lower(name))::int AS files FROM asset_files
				WHERE lower(name) = ANY($1) OR lower(regexp_replace(name, '\\.[^.]+$', '')) = ANY($1)
			`, [names])
			return {
				rows: input.rows.length,
				added: added.length - changed.length,
				changed: changed.length,
				removed: removed.length,
				unknownKeys: keys.filter((key) => !knownKeys.has(key)).slice(0, 50),
				unknownKeyCount: keys.filter((key) => !knownKeys.has(key)).length,
				filesFound: files as number,
				examples: { added: added.slice(0, 5), removed: removed.slice(0, 5) },
			}
		}),
	replace: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(z.object({ rows }))
		.mutation(async ({ input, ctx }) => {
			const batch = randomUUID()
			await dataSource.transaction(async (em) => {
				await em.query('DELETE FROM asset_entity_csv_mappings')
				for (let index = 0; index < input.rows.length; index += 5000) {
					const slice: Row[] = input.rows.slice(index, index + 5000)
					await em.query(`
						INSERT INTO asset_entity_csv_mappings (import_batch_id, file_name, target_kind, record_key, attribute_name, attribute_value, created_by_id)
						SELECT $1, * , $7 FROM unnest($2::text[], $3::varchar[], $4::text[], $5::text[], $6::text[])
					`, [batch, slice.map((row) => row.fileName), slice.map((row) => row.recordKey ? 'record' : 'attribute'), slice.map((row) => row.recordKey || null), slice.map((row) => row.recordKey ? null : row.attribute), slice.map((row) => row.recordKey ? null : row.value), ctx.user.id])
				}
			})
			return rerunEntityStage()
		}),
	clear: publicProcedure
		.use(authMiddleware(userAdmin))
		.mutation(async () => {
			await dataSource.query('DELETE FROM asset_entity_csv_mappings')
			return rerunEntityStage()
		}),
})
