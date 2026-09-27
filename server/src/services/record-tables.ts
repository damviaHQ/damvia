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
import { EntityManager } from "typeorm"

export type RecordTableRow = { id: string, name: string, position: number, recordCount: number, fieldIds: string[] }

export async function listTables(em: EntityManager): Promise<RecordTableRow[]> {
	const rows: { id: string, name: string, position: number, record_count: number, field_ids: string[] }[] = await em.query(`
		SELECT t.id, t.name, t.position,
			(SELECT count(*) FROM records r WHERE r.table_id = t.id)::int AS record_count,
			coalesce((SELECT array_agg(ta.attribute_id ORDER BY ta.position, a.position, a.name)
				FROM record_table_attributes ta JOIN record_attributes a ON a.id = ta.attribute_id WHERE ta.table_id = t.id), '{}') AS field_ids
		FROM record_tables t
		ORDER BY t.position, t.created_at, t.id
	`)
	return rows.map((row) => ({ id: row.id, name: row.name, position: row.position, recordCount: row.record_count, fieldIds: row.field_ids }))
}

export async function tableExists(em: EntityManager, id: string): Promise<void> {
	const [row] = await em.query('SELECT 1 FROM record_tables WHERE id = $1', [id])
	if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'This table no longer exists. Reload the page.' })
}

// "Shoes", then "Shoes (1)", "Shoes (2)"… when the name is taken.
export function uniqueName(name: string, taken: string[]): string {
	const names = new Set(taken.map((item) => item.toLowerCase()))
	if (!names.has(name.toLowerCase())) return name
	for (let n = 1; ; n++) {
		const candidate = `${name} (${n})`
		if (!names.has(candidate.toLowerCase())) return candidate
	}
}

export async function createTable(em: EntityManager, name: string, attributeIds: string[] = []): Promise<string> {
	await em.query('LOCK TABLE record_tables IN SHARE ROW EXCLUSIVE MODE')
	const taken: { name: string }[] = await em.query('SELECT name FROM record_tables')
	const [row] = await em.query(`
		INSERT INTO record_tables (name, position)
		VALUES ($1, (SELECT coalesce(max(position) + 1, 0) FROM record_tables))
		RETURNING id
	`, [uniqueName(name.trim(), taken.map((item) => item.name))])
	await attachFields(em, row.id, attributeIds)
	return row.id
}

// Adds fields to a table after the ones it already shows.
export async function attachFields(em: EntityManager, tableId: string, attributeIds: string[]): Promise<void> {
	if (!attributeIds.length) return
	await em.query(`
		INSERT INTO record_table_attributes (table_id, attribute_id, position)
		SELECT $1, a.id, (SELECT coalesce(max(position) + 1, 0) FROM record_table_attributes WHERE table_id = $1) + o.ord - 1
		FROM unnest($2::uuid[]) WITH ORDINALITY AS o(id, ord) JOIN record_attributes a ON a.id = o.id
		ON CONFLICT DO NOTHING
	`, [tableId, attributeIds])
}

export async function attachFieldsByName(em: EntityManager, tableId: string, names: string[]): Promise<void> {
	if (!names.length) return
	const rows: { id: string }[] = await em.query(`
		SELECT a.id FROM unnest($1::text[]) WITH ORDINALITY AS n(name, ord) JOIN record_attributes a ON a.name = n.name ORDER BY n.ord
	`, [names])
	await attachFields(em, tableId, rows.map((row) => row.id))
}

// A new field shows in the table it was made from, or in every table.
export async function attachNewField(em: EntityManager, attributeId: string, tableId: string | null): Promise<void> {
	if (tableId) return attachFields(em, tableId, [attributeId])
	const tables: { id: string }[] = await em.query('SELECT id FROM record_tables')
	for (const table of tables) await attachFields(em, table.id, [attributeId])
}

export async function tableFieldNames(em: EntityManager, tableId: string): Promise<string[]> {
	const rows: { name: string }[] = await em.query(`
		SELECT a.name FROM record_table_attributes ta JOIN record_attributes a ON a.id = ta.attribute_id
		WHERE ta.table_id = $1 ORDER BY ta.position, a.position, a.name
	`, [tableId])
	return rows.map((row) => row.name)
}
