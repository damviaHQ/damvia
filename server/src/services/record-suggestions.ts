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
import { EnrichmentSettings } from "../entity/enrichment-settings"
import { normaliseValue, RecordValueError } from "./record-values"
import { catalogueKeyColumnName, loadFields } from "./records"

export type ValueSuggestion = { recordId: string, field: string, value: string, support: number, example: string }

// A record gets the values its look-alikes agree on. Keys built from parts,
// such as 18875-554-M, are compared part by part: another key of the same shape
// sharing the first parts is a sibling, and sharing more parts makes it closer
// (18875-554-L is closer than 18875-002-M). Records of the same model, when a
// Model field is set, are the farthest siblings.
// For each empty field, the closest siblings holding a value decide: one value
// among them is suggested, several mean the field varies there (a colour, a
// size) and nothing is suggested.
export async function suggestValues(em: EntityManager, recordIds: string[]): Promise<ValueSuggestion[]> {
	if (!recordIds.length) return []
	const rows: ValueSuggestion[] = await em.query(`
		WITH me AS (
			SELECT id, meta_data, family_key, damvia_key_head(record_key) AS head,
				regexp_split_to_array(record_key, '[-_./ ]') AS parts,
				regexp_replace(record_key, '[^-_./ ]', '', 'g') AS shape
			FROM records WHERE id = ANY($1::uuid[])
		), candidates AS (
			SELECT me.id AS target, r.id, r.record_key, r.meta_data,
				coalesce((SELECT min(i) - 1 FROM generate_subscripts(me.parts, 1) AS i
					WHERE me.parts[i] IS DISTINCT FROM (regexp_split_to_array(r.record_key, '[-_./ ]'))[i]), cardinality(me.parts)) AS depth
			FROM me JOIN records r ON damvia_key_head(r.record_key) = me.head
			WHERE me.shape <> '' AND r.id <> me.id AND regexp_replace(r.record_key, '[^-_./ ]', '', 'g') = me.shape
			UNION ALL
			SELECT me.id, r.id, r.record_key, r.meta_data, 0
			FROM me JOIN records r ON r.family_key = me.family_key
			WHERE r.id <> me.id
		), siblings AS (
			SELECT target, record_key, meta_data, max(depth) AS depth
			FROM candidates GROUP BY target, id, record_key, meta_data
		), known AS (
			SELECT s.target, s.depth, s.record_key, e.key AS field, e.value
			FROM siblings s JOIN me ON me.id = s.target, each(s.meta_data) AS e
			WHERE btrim(e.value) <> '' AND coalesce(btrim(me.meta_data -> e.key), '') = ''
		), closest AS (
			SELECT target, field, max(depth) AS depth FROM known GROUP BY target, field
		)
		SELECT k.target AS "recordId", k.field, min(k.value) AS value, count(*)::int AS support, min(k.record_key) AS example, k.depth
		FROM known k JOIN closest c USING (target, field, depth)
		GROUP BY k.target, k.field, k.depth
		HAVING count(DISTINCT k.value) = 1
		ORDER BY k.target, k.field
	`, [recordIds])
	if (!rows.length) return []
	const keyColumnName = await catalogueKeyColumnName(em)
	const fields = new Map((await loadFields(em)).map((field) => [field.name, field]))
	// The fields telling the members of a model apart only come from closer keys.
	const axes = new Set((await em.getRepository(EnrichmentSettings).findOneBy({ id: 1 }))?.familyAxisAttributeNames ?? [])
	const suggestions: ValueSuggestion[] = []
	for (const row of rows as (ValueSuggestion & { depth: number })[]) {
		const field = fields.get(row.field)
		if (!field || row.field === keyColumnName || (row.depth === 0 && axes.has(row.field))) continue
		try {
			const value = normaliseValue(field, row.value)
			if (value) suggestions.push({ recordId: row.recordId, field: row.field, value, support: row.support, example: row.example })
		} catch (error) {
			if (!(error instanceof RecordValueError)) throw error
		}
	}
	return suggestions
}
