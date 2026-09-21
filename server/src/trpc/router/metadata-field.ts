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
import { MetadataField } from "../../entity/metadata-field"
import { dataSource } from "../../env"
import { rerunEntityStage } from "../../services/enrichment"
import { authMiddleware, publicProcedure, router, userAdmin, userApproved } from "../index"

export const METADATA_FACET_VALUES = 200

export function formatMetadataField(field: MetadataField) {
	return {
		id: field.id,
		name: field.name,
		displayName: field.displayName,
		valueType: field.valueType,
		searchable: field.searchable,
		facetable: field.facetable,
		viewable: field.viewable,
		canLink: field.canLink,
		linkTarget: field.linkTarget,
		linkAttributeName: field.linkAttributeName,
		fileCount: field.fileCount,
	}
}

export default router({
	list: publicProcedure
		.use(authMiddleware(userAdmin))
		.query(async () => {
			const fields = await dataSource.getRepository(MetadataField).find({ order: { fileCount: 'DESC', name: 'ASC' } })
			const examples: { metadata_field_id: string, values: string[] }[] = await dataSource.query(`
				SELECT metadata_field_id, (array_agg(DISTINCT value_text))[1:2] AS values FROM asset_file_metadata_values GROUP BY metadata_field_id
			`)
			return fields.map((field) => ({ ...formatMetadataField(field), examples: examples.find((row) => row.metadata_field_id === field.id)?.values ?? [] }))
		}),
	update: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(z.object({
			id: z.uuid(),
			displayName: z.string().max(100).nullable(),
			searchable: z.boolean(),
			facetable: z.boolean(),
			viewable: z.boolean(),
			canLink: z.boolean(),
			linkTarget: z.enum(['record_key', 'attribute']).nullable(),
			linkAttributeName: z.string().max(200).nullable(),
		}))
		.mutation(async ({ input }) => {
			const field = await dataSource.getRepository(MetadataField).findOneBy({ id: input.id })
			if (!field) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Metadata field not found.' })
			}
			if (input.canLink && (!input.linkTarget || (input.linkTarget === 'attribute' && !input.linkAttributeName))) {
				throw new TRPCError({ code: 'BAD_REQUEST', message: 'Say what the field contains: a record key, or the value of an attribute.' })
			}
			if (input.facetable && field.valueType === 'gps') {
				throw new TRPCError({ code: 'BAD_REQUEST', message: 'A GPS position cannot be a filter.' })
			}
			const linkChanged = field.canLink !== input.canLink || field.linkTarget !== input.linkTarget || field.linkAttributeName !== input.linkAttributeName
			field.displayName = input.displayName?.trim() || null
			field.searchable = input.searchable
			field.facetable = input.facetable
			field.viewable = input.viewable
			field.canLink = input.canLink
			field.linkTarget = input.canLink ? input.linkTarget : null
			field.linkAttributeName = input.canLink && input.linkTarget === 'attribute' ? input.linkAttributeName : null
			await dataSource.getRepository(MetadataField).save(field)
			if (linkChanged) await rerunEntityStage()
			return formatMetadataField(field)
		}),
	// What the search panel needs: facetable fields with their values (text) or
	// their bounds (dates). Values are counted over the whole library.
	listFacets: publicProcedure
		.use(authMiddleware(userApproved))
		.query(async () => {
			const fields = await dataSource.getRepository(MetadataField).find({ where: { facetable: true }, order: { name: 'ASC' } })
			return Promise.all(fields.map(async (field) => {
				if (field.valueType === 'date') {
					const [bounds] = await dataSource.query('SELECT min(value_date) AS min, max(value_date) AS max FROM asset_file_metadata_values WHERE metadata_field_id = $1', [field.id])
					return { id: field.id, name: field.name, displayName: field.displayName, valueType: field.valueType, values: [] as string[], min: bounds.min as Date | null, max: bounds.max as Date | null, truncated: false }
				}
				const values: { value_text: string }[] = await dataSource.query(`
					SELECT value_text FROM asset_file_metadata_values WHERE metadata_field_id = $1 GROUP BY value_text ORDER BY count(*) DESC, value_text LIMIT $2
				`, [field.id, METADATA_FACET_VALUES + 1])
				return {
					id: field.id, name: field.name, displayName: field.displayName, valueType: field.valueType,
					values: values.slice(0, METADATA_FACET_VALUES).map((row) => row.value_text), min: null, max: null,
					truncated: values.length > METADATA_FACET_VALUES,
				}
			}))
		}),
})
