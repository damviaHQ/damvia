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
import { EntityManager } from "typeorm"
import { RecordChangeAction, RecordChanges, RecordChangeSource } from "../entity/record-change"

export type RecordChangeRow = {
	recordId: string | null
	recordKey: string
	action: RecordChangeAction
	source: RecordChangeSource
	changes: RecordChanges
	changedById: string | null
	importBatchId?: string | null
}

const BATCH = 5000

// Only the keys whose value really changed; a missing key reads as empty.
export function diffValues(before: Record<string, string> | null, after: Record<string, string>): RecordChanges {
	const changes: RecordChanges = {}
	for (const [key, value] of Object.entries(after)) {
		const old = before?.[key] ?? null
		if ((old ?? '') !== (value ?? '')) changes[key] = { old, new: value }
	}
	return changes
}

export async function writeRecordChanges(em: EntityManager, rows: RecordChangeRow[]): Promise<void> {
	for (let start = 0; start < rows.length; start += BATCH) {
		const batch = rows.slice(start, start + BATCH)
		await em.query(`
			INSERT INTO record_changes (record_id, record_key, action, source, changes, changed_by_id, import_batch_id)
			SELECT * FROM unnest($1::uuid[], $2::text[], $3::varchar[], $4::varchar[], $5::jsonb[], $6::uuid[], $7::uuid[])
		`, [
			batch.map((row) => row.recordId),
			batch.map((row) => row.recordKey),
			batch.map((row) => row.action),
			batch.map((row) => row.source),
			batch.map((row) => JSON.stringify(row.changes)),
			batch.map((row) => row.changedById),
			batch.map((row) => row.importBatchId ?? null),
		])
	}
}
