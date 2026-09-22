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

export type FamilyStageResult = { families: number, records: number }

// Products that share the value of the field an administrator chose belong to
// the same family: one model, several keys. The grouping key ignores case,
// accents and stray spaces; the label keeps the value as it was typed.
export async function runFamilyStage(em: EntityManager, changedFields?: string[]): Promise<FamilyStageResult> {
	const settings = await em.getRepository(EnrichmentSettings).findOneByOrFail({ id: 1 })
	const field = settings.familyAttributeName?.trim()
	// Regrouping rewrites the whole catalogue, which a cell edit on any other
	// field has no reason to pay for.
	if (changedFields && (!field || !changedFields.includes(field))) {
		return { families: 0, records: 0 }
	}
	if (!field) {
		const cleared = await em.query(`UPDATE records SET family_key = NULL, family_label = NULL WHERE family_key IS NOT NULL`)
		return { families: 0, records: Number(cleared?.[1] ?? 0) }
	}
	const written = await em.query(`
		WITH keyed AS (
			SELECT id, damvia_family_key(meta_data -> $1) AS key, btrim(coalesce(meta_data -> $1, '')) AS label
			FROM records
		), labelled AS (
			SELECT key, min(label) AS label FROM keyed WHERE key IS NOT NULL GROUP BY key
		)
		UPDATE records r
		SET family_key = keyed.key, family_label = labelled.label
		FROM keyed LEFT JOIN labelled ON labelled.key = keyed.key
		WHERE r.id = keyed.id
		AND (r.family_key IS DISTINCT FROM keyed.key OR r.family_label IS DISTINCT FROM labelled.label)
	`, [field])
	const [{ count }] = await em.query(`SELECT count(DISTINCT family_key)::int AS count FROM records WHERE family_key IS NOT NULL`)
	return { families: Number(count), records: Number(written?.[1] ?? 0) }
}
