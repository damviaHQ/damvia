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
import { EntityManager, IsNull } from "typeorm"
import { ReadinessDefinition } from "../entity/readiness-definition"

export type ReadinessStageResult = { definitions: number, records: number }

// The definition that applies to a table: its own, or the catalogue-wide one.
export async function readinessFor(em: EntityManager, tableId: string | null) {
	const own = tableId ? await em.getRepository(ReadinessDefinition).findOneBy({ tableId }) : null
	return own ?? await em.getRepository(ReadinessDefinition).findOneBy({ tableId: IsNull() })
}

// Counts, for every record, how many of the required fields carry a value and
// how many of the required views have a file. One statement per definition:
// the catalogue is written in bulk by imports, so a row-by-row pass is not an
// option. A definition asking for nothing leaves every record ready.
export async function runReadinessStage(em: EntityManager, recordIds?: string[]): Promise<ReadinessStageResult> {
	const definitions = await em.getRepository(ReadinessDefinition).find()
	if (!definitions.length) {
		const reset = await em.query(
			`UPDATE records SET readiness_filled = 0, readiness_total = 0, readiness_ready = true
			 WHERE (readiness_total <> 0 OR readiness_ready IS FALSE)${recordIds ? ' AND id = ANY($1::uuid[])' : ''}`,
			recordIds ? [recordIds] : [],
		)
		return { definitions: 0, records: Number(reset?.[1] ?? 0) }
	}
	let records = 0
	for (const definition of definitions) {
		const parameters: unknown[] = [definition.requiredAttributeIds, definition.requiredViews]
		// A definition tied to a table covers that table; the catalogue-wide one
		// covers every table no definition of its own claims.
		let scope = ''
		if (definition.tableId) {
			parameters.push(definition.tableId)
			scope = `r.table_id = $${parameters.length}::uuid`
		} else {
			parameters.push(definitions.filter((current) => current.tableId).map((current) => current.tableId))
			scope = `NOT (r.table_id = ANY($${parameters.length}::uuid[]))`
		}
		if (recordIds) {
			parameters.push(recordIds)
			scope += ` AND r.id = ANY($${parameters.length}::uuid[])`
		}
		const result = await em.query(`
			WITH required AS (
				SELECT name FROM record_attributes WHERE id = ANY($1::uuid[])
			), scored AS (
				SELECT r.id,
					(SELECT count(*) FROM required WHERE coalesce(r.meta_data -> required.name, '') <> '')
					+ (
						SELECT count(*) FROM unnest($2::text[]) AS wanted(view)
						WHERE EXISTS (
							SELECT 1 FROM asset_files a
							LEFT JOIN asset_entity_links l ON l.asset_file_id = a.id AND l.target_kind = 'record' AND l.status = 'active'
							WHERE coalesce(l.record_id, a.record_id) = r.id AND a.record_view = wanted.view
						)
					) AS filled,
					(SELECT count(*) FROM required) + coalesce(array_length($2::text[], 1), 0) AS total
				FROM records r
				WHERE ${scope}
			)
			UPDATE records r
			SET readiness_filled = scored.filled,
				readiness_total = scored.total,
				readiness_ready = scored.filled >= scored.total
			FROM scored
			WHERE r.id = scored.id
			AND (r.readiness_filled <> scored.filled OR r.readiness_total <> scored.total OR r.readiness_ready <> (scored.filled >= scored.total))
		`, parameters)
		records += Number(result?.[1] ?? 0)
	}
	return { definitions: definitions.length, records }
}
