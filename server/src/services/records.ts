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
import { randomUUID } from "node:crypto"
import { EntityManager } from "typeorm"
import { RecordAttribute } from "../entity/record-attribute"
import { RecordChangeSource } from "../entity/record-change"
import { diffValues, RecordChangeRow, writeRecordChanges } from "./record-history"
import { attachFieldsByName, tableFieldNames } from "./record-tables"
import { newOptions, normaliseValue, RecordValueError, validateValue } from "./record-values"

export const LIST_MAX = 500
export const EXPORT_MAX = 10000
const WRITE_BATCH = 2000

export type FilterOp = 'contains' | 'is' | 'is_not' | 'is_empty' | 'is_not_empty' | 'has_any'
export type RecordFilter = { column: string, op: FilterOp, value?: string, values?: string[] }
export type RecordSort = { column: string, direction: 'asc' | 'desc' }
export type RecordQuery = { tableId?: string, search?: string, filters?: RecordFilter[], sort?: RecordSort, ids?: string[] }
export type Actor = { userId: string | null, source: RecordChangeSource }

export type RecordRow = {
	id: string
	recordKey: string
	keyColumnName: string
	tableId: string
	metaData: Record<string, string>
	createdAt: Date
	updatedAt: Date
	thumbnailStorageKey: string | null
	fileCount: number
	filledCount: number
}

type RawRecordRow = { id: string, record_key: string, key_column_name: string, table_id: string, meta_data: Record<string, string> | null, created_at: Date, updated_at: Date, thumbnail_file_id: string | null, file_count: number, filled_count: number }

// The key column is fixed by the first record ever created; every later
// import, creation or attach reuses it.
export async function catalogueKeyColumnName(em: EntityManager): Promise<string | null> {
	const [row] = await em.query('SELECT key_column_name FROM records ORDER BY created_at ASC, id ASC LIMIT 1')
	return row?.key_column_name ?? null
}

export async function loadFields(em: EntityManager): Promise<RecordAttribute[]> {
	return em.getRepository(RecordAttribute).find({ order: { position: 'ASC', name: 'ASC' } })
}

// Declares text fields for names the catalogue does not know yet, after the others.
export async function ensureFields(em: EntityManager, names: string[]): Promise<void> {
	if (!names.length) return
	await em.query(`
		INSERT INTO record_attributes (name, value_type, position)
		SELECT name, 'text', (SELECT coalesce(max(position) + 1, 0) FROM record_attributes) + ord - 1
		FROM unnest($1::text[]) WITH ORDINALITY AS n(name, ord)
		ON CONFLICT (name) DO NOTHING
	`, [names])
}

export async function fieldIsLinked(em: EntityManager, names: string[]): Promise<boolean> {
	if (!names.length) return false
	const [row] = await em.query(`
		SELECT EXISTS (SELECT 1 FROM asset_entity_links WHERE target_kind = 'attribute' AND attribute_name = ANY($1))
			OR EXISTS (SELECT 1 FROM asset_folder_entity_attachments WHERE attribute_name = ANY($1))
			OR EXISTS (SELECT 1 FROM asset_entity_csv_mappings WHERE attribute_name = ANY($1)) AS linked
	`, [names])
	return row.linked
}

// Checks every value against its field and returns the canonical forms.
export function normaliseValues(fields: RecordAttribute[], keyColumnName: string | null, values: Record<string, string>): Record<string, string> {
	const byName = new Map(fields.map((field) => [field.name, field]))
	const result: Record<string, string> = {}
	for (const [name, raw] of Object.entries(values)) {
		if (name === keyColumnName) {
			throw new TRPCError({ code: 'BAD_REQUEST', message: `${name} is the key and cannot be changed here.` })
		}
		const field = byName.get(name)
		if (!field) {
			throw new TRPCError({ code: 'NOT_FOUND', message: `There is no field ${name}. Add the field first.` })
		}
		try {
			result[name] = normaliseValue(field, raw ?? '')
		} catch (error) {
			if (error instanceof RecordValueError) throw new TRPCError({ code: 'BAD_REQUEST', message: error.message })
			throw error
		}
	}
	return result
}

// Without a table the record goes to the first one.
export async function createRecord(em: EntityManager, input: { recordKey: string, values?: Record<string, string>, tableId?: string }, actor: Actor): Promise<string> {
	const recordKey = input.recordKey.trim()
	const [exists] = await em.query('SELECT 1 FROM records WHERE record_key = $1', [recordKey])
	if (exists) {
		throw new TRPCError({ code: 'CONFLICT', message: `A record with key ${recordKey} already exists.` })
	}
	const keyColumnName = (await catalogueKeyColumnName(em)) ?? 'Key'
	const values = normaliseValues(await loadFields(em), keyColumnName, input.values ?? {})
	const metaData = { [keyColumnName]: recordKey, ...values }
	const [row] = await em.query(`
		INSERT INTO records (record_key, key_column_name, meta_data, table_id)
		VALUES ($1, $2, hstore($3::text[], $4::text[]), $5)
		RETURNING id
	`, [recordKey, keyColumnName, Object.keys(metaData), Object.values(metaData), input.tableId ?? null])
	await writeRecordChanges(em, [{ recordId: row.id, recordKey, action: 'create', source: actor.source, changes: diffValues(null, metaData), changedById: actor.userId }])
	return row.id
}

// Sets some fields on some records and leaves the others alone. Records whose
// values do not change are not written and get no history row.
export async function patchRecords(em: EntityManager, ids: string[], values: Record<string, string>, actor: Actor): Promise<{ updated: string[], found: number }> {
	const keyColumnName = await catalogueKeyColumnName(em)
	const normalised = normaliseValues(await loadFields(em), keyColumnName, values)
	const rows: { id: string, record_key: string, key_column_name: string, meta_data: Record<string, string> | null }[] = await em.query(`
		SELECT id, record_key, key_column_name, hstore_to_json(meta_data) AS meta_data FROM records WHERE id = ANY($1) ORDER BY id FOR UPDATE
	`, [ids])
	const history: RecordChangeRow[] = []
	for (const row of rows) {
		if (row.key_column_name in normalised) {
			throw new TRPCError({ code: 'BAD_REQUEST', message: `${row.key_column_name} is the key and cannot be changed here.` })
		}
		const changes = diffValues(row.meta_data, normalised)
		if (Object.keys(changes).length) {
			history.push({ recordId: row.id, recordKey: row.record_key, action: 'update', source: actor.source, changes, changedById: actor.userId })
		}
	}
	const updated = history.map((row) => row.recordId as string)
	if (updated.length) {
		await em.query(`
			UPDATE records SET meta_data = coalesce(meta_data, ''::hstore) || hstore($2::text[], $3::text[]), updated_at = now()
			WHERE id = ANY($1)
		`, [updated, Object.keys(normalised), Object.values(normalised)])
		await writeRecordChanges(em, history)
	}
	return { updated, found: rows.length }
}

// Sets different values on different records, as a pasted or filled range of
// cells does. Every value is checked before anything is written, so the range
// is saved whole or not at all; each changed record gets one history row.
export async function patchEach(em: EntityManager, changes: { id: string, values: Record<string, string> }[], actor: Actor): Promise<{ updated: string[], missing: string[] }> {
	const keyColumnName = await catalogueKeyColumnName(em)
	const fields = await loadFields(em)
	const ids = [...new Set(changes.map((change) => change.id))]
	const rows: { id: string, record_key: string, key_column_name: string, meta_data: Record<string, string> | null }[] = await em.query(`
		SELECT id, record_key, key_column_name, hstore_to_json(meta_data) AS meta_data FROM records WHERE id = ANY($1) ORDER BY id FOR UPDATE
	`, [ids])
	const byId = new Map(rows.map((row) => [row.id, row]))
	const merged = new Map<string, Record<string, string>>()
	for (const change of changes) {
		const row = byId.get(change.id)
		if (!row) continue
		let values: Record<string, string>
		try {
			values = normaliseValues(fields, keyColumnName ?? row.key_column_name, change.values)
		} catch (error) {
			if (error instanceof TRPCError) throw new TRPCError({ code: error.code, message: `${row.record_key}: ${error.message}` })
			throw error
		}
		merged.set(row.id, { ...merged.get(row.id), ...values })
	}
	const history: RecordChangeRow[] = []
	const written: { id: string, values: Record<string, string> }[] = []
	for (const [id, values] of merged) {
		const row = byId.get(id)!
		const diff = diffValues(row.meta_data, values)
		if (!Object.keys(diff).length) continue
		history.push({ recordId: id, recordKey: row.record_key, action: 'update', source: actor.source, changes: diff, changedById: actor.userId })
		written.push({ id, values: Object.fromEntries(Object.keys(diff).map((name) => [name, values[name]])) })
	}
	if (written.length) {
		await em.query(`
			UPDATE records r SET meta_data = coalesce(r.meta_data, ''::hstore) || ${JSON_TO_HSTORE}, updated_at = now()
			FROM unnest($1::uuid[], $2::json[]) AS u(id, m) WHERE r.id = u.id
		`, [written.map((row) => row.id), written.map((row) => JSON.stringify(row.values))])
		await writeRecordChanges(em, history)
	}
	return { updated: written.map((row) => row.id), missing: ids.filter((id) => !byId.has(id)) }
}

const SNAPSHOT = `(SELECT coalesce(jsonb_object_agg(e.key, jsonb_build_object('old', e.value, 'new', NULL)), '{}'::jsonb) FROM each(r.meta_data) e)`

// Deletes records, keeping their last values in the history. Links set on
// their key stay and turn dangling on the next entity pass. Without ids,
// deletes every record of the table, or of the catalogue.
export async function removeRecords(em: EntityManager, ids: string[] | null, actor: Actor, tableId?: string): Promise<number> {
	const scope = ids ? 'r.id = ANY($1::uuid[])' : tableId ? 'r.table_id = $1::uuid' : 'true'
	const scopeParameters = ids ? [ids] : tableId ? [tableId] : []
	await em.query(`
		INSERT INTO record_changes (record_id, record_key, action, source, changes, changed_by_id)
		SELECT r.id, r.record_key, 'delete', $${scopeParameters.length + 1}, ${SNAPSHOT}, $${scopeParameters.length + 2}::uuid FROM records r WHERE ${scope}
	`, [...scopeParameters, actor.source, actor.userId])
	await em.query(`UPDATE asset_files SET record_id = NULL, record_view = NULL WHERE record_id IN (SELECT r.id FROM records r WHERE ${scope})`, scopeParameters)
	const [, count] = await em.query(`DELETE FROM records r WHERE ${scope}`, scopeParameters)
	return count ?? 0
}

// Moves records to another table. Their values and links stay as they are.
export async function moveRecords(em: EntityManager, ids: string[], tableId: string, actor: Actor): Promise<number> {
	const [moved]: [{ id: string, record_key: string, from_name: string, to_name: string }[], number] = await em.query(`
		UPDATE records r SET table_id = $2, updated_at = now()
		FROM record_tables source, record_tables target
		WHERE r.id = ANY($1) AND r.table_id <> $2 AND source.id = r.table_id AND target.id = $2
		RETURNING r.id, r.record_key, source.name AS from_name, target.name AS to_name
	`, [ids, tableId])
	await writeRecordChanges(em, moved.map((row) => ({ recordId: row.id, recordKey: row.record_key, action: 'move', source: actor.source, changes: { table: { old: row.from_name, new: row.to_name } }, changedById: actor.userId })))
	return moved.length
}

export function likePattern(value: string): string {
	return `%${value.replace(/[\\%_]/g, '\\$&')}%`
}

// The WHERE and ORDER BY of the records list. Column names are checked
// against the declared fields and always sent as parameters.
export function recordQuerySql(query: RecordQuery, fields: RecordAttribute[], keyColumnName: string | null, parameters: unknown[]): { where: string, orderBy: string } {
	const byName = new Map(fields.map((field) => [field.name, field]))
	const parameter = (value: unknown) => {
		parameters.push(value)
		return `$${parameters.length}`
	}
	const columnExpression = (column: string) => {
		if (column === 'recordKey' || column === keyColumnName) return { expression: 'r.record_key', field: null }
		const field = byName.get(column)
		if (!field) throw new TRPCError({ code: 'BAD_REQUEST', message: `There is no field ${column}.` })
		return { expression: `coalesce(r.meta_data -> ${parameter(column)}, '')`, field }
	}
	const conditions: string[] = []
	if (query.tableId) conditions.push(`r.table_id = ${parameter(query.tableId)}::uuid`)
	if (query.ids?.length) conditions.push(`r.id = ANY(${parameter(query.ids)}::uuid[])`)
	const search = query.search?.trim()
	if (search) {
		const pattern = parameter(likePattern(search))
		conditions.push(`(r.record_key ILIKE ${pattern} OR EXISTS (SELECT 1 FROM each(r.meta_data) e WHERE e.value ILIKE ${pattern}))`)
	}
	for (const filter of query.filters ?? []) {
		const { expression, field } = columnExpression(filter.column)
		const value = filter.value ?? ''
		switch (filter.op) {
			case 'contains': conditions.push(`${expression} ILIKE ${parameter(likePattern(value))}`); break
			case 'is': conditions.push(`${expression} = ${parameter(value)}`); break
			case 'is_not': conditions.push(`${expression} <> ${parameter(value)}`); break
			case 'is_empty': conditions.push(`${expression} = ''`); break
			case 'is_not_empty': conditions.push(`${expression} <> ''`); break
			case 'has_any': {
				const values = filter.values ?? []
				if (!values.length) break
				conditions.push(field?.valueType === 'multi_select'
					? `string_to_array(${expression}, '|') && ${parameter(values)}::text[]`
					: `${expression} = ANY(${parameter(values)}::text[])`)
				break
			}
		}
	}
	const direction = query.sort?.direction === 'desc' ? 'DESC' : 'ASC'
	let order = `r.created_at ${direction}`
	const column = query.sort?.column
	if (column === 'recordKey' || (column && column === keyColumnName)) order = `r.record_key ${direction}`
	else if (column === 'createdAt') order = `r.created_at ${direction}`
	else if (column === 'updatedAt') order = `r.updated_at ${direction}`
	else if (column === 'fileCount') order = `file_count ${direction}`
	else if (column) {
		const field = byName.get(column)
		if (!field) throw new TRPCError({ code: 'BAD_REQUEST', message: `There is no field ${column}.` })
		const raw = `(r.meta_data -> ${parameter(column)})`
		if (field.valueType === 'number') order = `CASE WHEN ${raw} ~ '^-?\\d+(\\.\\d+)?$' THEN ${raw}::numeric END ${direction} NULLS LAST`
		else if (field.valueType === 'date') order = `CASE WHEN ${raw} ~ '^\\d{4}-\\d{2}-\\d{2}$' THEN ${raw} END ${direction} NULLS LAST`
		else order = `lower(NULLIF(${raw}, '')) ${direction} NULLS LAST`
	}
	return {
		where: conditions.length ? conditions.join(' AND ') : 'true',
		orderBy: `${order}, r.created_at ASC, r.id ASC`,
	}
}

// Files linked to a record by a link or, for files older than links, by the
// record column of the file.
const FILE_COUNT = `(SELECT count(*) FROM (
	SELECT l.asset_file_id FROM asset_entity_links l WHERE l.record_id = r.id AND l.target_kind = 'record' AND l.status = 'active'
	UNION SELECT a.id FROM asset_files a WHERE a.record_id = r.id
) linked)::int`

// The record's picture: a file at the thumbnail view first, else any linked
// file with a thumbnail.
const THUMBNAIL = `(SELECT a.id FROM asset_files a WHERE a.record_id = r.id AND a.has_thumbnail
	ORDER BY (a.record_view IS NOT DISTINCT FROM $1) DESC, a.record_view NULLS LAST, a.name LIMIT 1)`

export async function listRecords(em: EntityManager, query: RecordQuery, page: { offset: number, limit: number }, thumbnailView: string | null): Promise<{ rows: RecordRow[], total: number, fields: RecordAttribute[], keyColumnName: string | null }> {
	const [fields, keyColumnName] = await Promise.all([loadFields(em), catalogueKeyColumnName(em)])
	// A table counts the fields it shows as filled.
	const counted = query.tableId ? await tableFieldNames(em, query.tableId) : fields.map((field) => field.name)
	const parameters: unknown[] = [thumbnailView, counted]
	const { where, orderBy } = recordQuerySql(query, fields, keyColumnName, parameters)
	const rows: RawRecordRow[] = await em.query(`
		SELECT r.id, r.record_key, r.key_column_name, r.table_id, hstore_to_json(r.meta_data) AS meta_data, r.created_at, r.updated_at,
			${THUMBNAIL} AS thumbnail_file_id,
			${FILE_COUNT} AS file_count,
			(SELECT count(*) FROM each(r.meta_data) e WHERE e.value <> '' AND e.key = ANY($2))::int AS filled_count
		FROM records r
		WHERE ${where}
		ORDER BY ${orderBy}
		LIMIT ${Math.floor(page.limit)} OFFSET ${Math.floor(page.offset)}
	`, parameters)
	const countParameters: unknown[] = []
	const count = recordQuerySql({ ...query, sort: undefined }, fields, keyColumnName, countParameters)
	const [{ total }] = await em.query(`SELECT count(*)::int AS total FROM records r WHERE ${count.where}`, countParameters)
	return {
		rows: rows.map((row) => ({
			id: row.id,
			recordKey: row.record_key,
			keyColumnName: row.key_column_name,
			tableId: row.table_id,
			metaData: row.meta_data ?? {},
			createdAt: row.created_at,
			updatedAt: row.updated_at,
			thumbnailStorageKey: row.thumbnail_file_id ? `asset-file/${row.thumbnail_file_id}-thumbnail` : null,
			fileCount: row.file_count,
			filledCount: row.filled_count,
		})),
		total,
		fields,
		keyColumnName,
	}
}

// Where a record sits in its table: its 0-based position under the search,
// filters and sort, or null when they leave it out.
export async function locateRecord(em: EntityManager, recordKey: string, query: RecordQuery): Promise<{ id: string, tableId: string, position: number | null } | null> {
	const [record] = await em.query('SELECT id, table_id FROM records WHERE record_key = $1', [recordKey.trim()])
	if (!record) return null
	const [fields, keyColumnName] = await Promise.all([loadFields(em), catalogueKeyColumnName(em)])
	const parameters: unknown[] = [record.id]
	const { where, orderBy } = recordQuerySql({ ...query, tableId: record.table_id }, fields, keyColumnName, parameters)
	const source = orderBy.includes('file_count') ? `(SELECT r.*, ${FILE_COUNT} AS file_count FROM records r)` : 'records'
	const [row] = await em.query(`
		SELECT position FROM (
			SELECT r.id, (row_number() OVER (ORDER BY ${orderBy}) - 1)::int AS position
			FROM ${source} r
			WHERE ${where}
		) ranked
		WHERE id = $1
	`, parameters)
	return { id: record.id, tableId: record.table_id, position: row ? row.position : null }
}

export type CsvRow = Record<string, string>
export type CsvAnalysis = {
	keyColumnName: string
	columns: string[]
	newColumns: string[]
	newOptions: Record<string, string[]>
	rows: {
		key: string
		row: CsvRow
		existing: { id: string, metaData: Record<string, string>, tableId: string, tableName: string } | null
		values: Record<string, string>
		invalid: Record<string, string>
		differences: Record<string, { old: string, new: string }>
		duplicate: boolean
	}[]
}

// Reads a CSV against the catalogue: which columns and options are new, which
// values fail their field's type, and what each row would change.
export async function analyseCsv(em: EntityManager, chosenKeyColumnName: string, data: CsvRow[]): Promise<CsvAnalysis> {
	const keyColumnName = (await catalogueKeyColumnName(em)) ?? chosenKeyColumnName
	const fields = await loadFields(em)
	const byName = new Map(fields.map((field) => [field.name, field]))
	const keyOf = (row: CsvRow) => (row[keyColumnName] || row[chosenKeyColumnName] || '').trim()
	const isKeyColumn = (column: string) => column === keyColumnName || column === chosenKeyColumnName
	const columns = [...new Set(data.flatMap((row) => Object.keys(row)))].filter((column) => !isKeyColumn(column))
	const newColumns = columns.filter((column) => !byName.has(column))
	const learned: Record<string, string[]> = {}
	for (const column of columns) {
		const field = byName.get(column)
		if (!field) continue
		const options = newOptions(field, data.map((row) => row[column] ?? ''))
		if (options.length) learned[column] = options
	}
	const fieldFor = (column: string) => {
		const field = byName.get(column)
		if (!field) return { name: column, valueType: 'text' as const, options: [] }
		return { name: field.name, displayName: field.displayName, valueType: field.valueType, options: [...field.options, ...(learned[column] ?? [])] }
	}
	const keys = [...new Set(data.map(keyOf).filter(Boolean))]
	const existing: { id: string, record_key: string, meta_data: Record<string, string> | null, table_id: string, table_name: string }[] = keys.length
		? await em.query(`
			SELECT r.id, r.record_key, hstore_to_json(r.meta_data) AS meta_data, r.table_id, t.name AS table_name
			FROM records r JOIN record_tables t ON t.id = r.table_id WHERE r.record_key = ANY($1)
		`, [keys])
		: []
	const existingByKey = new Map(existing.map((row) => [row.record_key, row]))
	const counts = new Map<string, number>()
	for (const row of data) counts.set(keyOf(row), (counts.get(keyOf(row)) ?? 0) + 1)
	return {
		keyColumnName,
		columns,
		newColumns,
		newOptions: learned,
		rows: data.map((row) => {
			const key = keyOf(row)
			const current = existingByKey.get(key)
			const values: Record<string, string> = {}
			const invalid: Record<string, string> = {}
			for (const column of Object.keys(row)) {
				if (isKeyColumn(column)) continue
				const field = fieldFor(column)
				const message = validateValue(field, row[column] ?? '')
				if (message) invalid[column] = message
				else values[column] = normaliseValue(field, row[column] ?? '')
			}
			const differences: Record<string, { old: string, new: string }> = {}
			if (current) {
				for (const [column, value] of Object.entries(values)) {
					const old = current.meta_data?.[column] ?? ''
					if (old !== value) differences[column] = { old, new: value }
				}
			}
			return {
				key,
				row,
				existing: current ? { id: current.id, metaData: current.meta_data ?? {}, tableId: current.table_id, tableName: current.table_name } : null,
				values,
				invalid,
				differences,
				duplicate: !!key && (counts.get(key) ?? 0) > 1,
			}
		}),
	}
}

const JSON_TO_HSTORE = `coalesce((SELECT hstore(array_agg(j.key), array_agg(j.value)) FROM json_each_text(u.m) j), ''::hstore)`

// Applies an analysed CSV in one transaction: new columns become text fields,
// select fields learn their new options, rows with an invalid value are
// skipped whole, and every created or changed record gets a history row.
// New records go to the table, which shows every imported column; records
// already in another table are updated where they are.
export async function importCsv(em: EntityManager, analysis: CsvAnalysis, userId: string | null, tableId: string) {
	const importBatchId = randomUUID()
	await ensureFields(em, analysis.newColumns)
	await attachFieldsByName(em, tableId, analysis.columns)
	for (const [name, options] of Object.entries(analysis.newOptions)) {
		await em.query('UPDATE record_attributes SET options = options || $2::text[], updated_at = now() WHERE name = $1', [name, options])
	}
	const skipped: { key: string, column: string, message: string }[] = []
	const latest = new Map<string, CsvAnalysis['rows'][number]>()
	for (const row of analysis.rows) {
		if (!row.key) continue
		const invalid = Object.entries(row.invalid)
		if (invalid.length) {
			for (const [column, message] of invalid) skipped.push({ key: row.key, column, message })
			continue
		}
		latest.set(row.key, row)
	}
	const creates = [...latest.values()].filter((row) => !row.existing)
	const updates = [...latest.values()].filter((row) => row.existing && Object.keys(row.differences).length)
	const history: RecordChangeRow[] = []
	for (let start = 0; start < creates.length; start += WRITE_BATCH) {
		const batch = creates.slice(start, start + WRITE_BATCH)
		const metaData = batch.map((row) => ({ [analysis.keyColumnName]: row.key, ...row.values }))
		const inserted: { id: string, record_key: string }[] = await em.query(`
			INSERT INTO records (record_key, key_column_name, meta_data, table_id)
			SELECT u.k, $3, ${JSON_TO_HSTORE}, $4 FROM unnest($1::text[], $2::json[]) AS u(k, m)
			RETURNING id, record_key
		`, [batch.map((row) => row.key), metaData.map((values) => JSON.stringify(values)), analysis.keyColumnName, tableId])
		const ids = new Map(inserted.map((row) => [row.record_key, row.id]))
		batch.forEach((row, index) => history.push({ recordId: ids.get(row.key) ?? null, recordKey: row.key, action: 'create', source: 'csv', changes: diffValues(null, metaData[index]), changedById: userId, importBatchId }))
	}
	for (let start = 0; start < updates.length; start += WRITE_BATCH) {
		const batch = updates.slice(start, start + WRITE_BATCH)
		const changed = batch.map((row) => Object.fromEntries(Object.entries(row.differences).map(([column, difference]) => [column, difference.new])))
		await em.query(`
			UPDATE records r SET meta_data = coalesce(r.meta_data, ''::hstore) || ${JSON_TO_HSTORE}, updated_at = now()
			FROM unnest($1::uuid[], $2::json[]) AS u(id, m) WHERE r.id = u.id
		`, [batch.map((row) => row.existing!.id), changed.map((values) => JSON.stringify(values))])
		batch.forEach((row) => history.push({ recordId: row.existing!.id, recordKey: row.key, action: 'update', source: 'csv', changes: diffValues(row.existing!.metaData, Object.fromEntries(Object.entries(row.differences).map(([column, difference]) => [column, difference.new]))), changedById: userId, importBatchId }))
	}
	await writeRecordChanges(em, history)
	return {
		newRecords: creates.map((row) => row.key),
		updatedRecords: updates.map((row) => row.key),
		skipped,
		importBatchId,
	}
}
