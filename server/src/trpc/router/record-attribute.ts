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
import { DataRecord } from "../../entity/data-record"
import { RECORD_VALUE_TYPES, RecordAttribute } from "../../entity/record-attribute"
import { dataSource } from "../../env"
import { rerunEntityStage } from "../../services/enrichment"
import { MAX_OPTIONS, MULTI_SELECT_SEPARATOR, optionsFromValues, validateValue } from "../../services/record-values"
import { catalogueKeyColumnName, fieldIsLinked } from "../../services/records"
import { authMiddleware, publicProcedure, router, userAdmin } from "../index"

export function formatRecordAttribute(attribute: RecordAttribute) {
	return {
		id: attribute.id,
		name: attribute.name,
		displayName: attribute.displayName,
		valueType: attribute.valueType,
		options: attribute.options,
		position: attribute.position,
		facetable: attribute.facetable,
		viewable: attribute.viewable,
		searchable: attribute.searchable,
	}
}

const options = z.array(z.string().trim().min(1).max(200).refine((value) => !value.includes(MULTI_SELECT_SEPARATOR), `An option cannot contain ${MULTI_SELECT_SEPARATOR}.`))
	.max(MAX_OPTIONS)
	.transform((values) => [...new Set(values)])
const valueType = z.enum(RECORD_VALUE_TYPES)
const isSelect = (type: string) => type === 'single_select' || type === 'multi_select'

async function valuesOf(name: string): Promise<string[]> {
	const rows: { value: string }[] = await dataSource.query(`SELECT meta_data -> $1 AS value FROM records WHERE meta_data ? $1 AND meta_data -> $1 <> ''`, [name])
	return rows.map((row) => row.value)
}

// How many stored values the field's type or options would now refuse.
async function invalidCount(attribute: RecordAttribute): Promise<number> {
	if (attribute.valueType === 'text' || attribute.valueType === 'long_text') return 0
	return (await valuesOf(attribute.name)).filter((value) => validateValue(attribute, value) !== null).length
}

export default router({
	listAvailable: publicProcedure
		.use(authMiddleware(userAdmin))
		.query(async () => {
			const records = await dataSource.getRepository(DataRecord)
				.createQueryBuilder('records')
				.select('distinct skeys(records.meta_data) as name')
				.getRawMany<{ name: string }>()
			return records.map((record) => record.name)
		}),
	list: publicProcedure
		.use(authMiddleware(userAdmin))
		.query(async () => {
			const attributes = await dataSource.getRepository(RecordAttribute).find({ order: { position: 'ASC', name: 'ASC' } })
			return attributes.map(formatRecordAttribute)
		}),
	listFacets: publicProcedure
		.use(authMiddleware())
		.query(async () => {
			const facets = await dataSource.getRepository(RecordAttribute).find({ where: { facetable: true }, order: { position: 'ASC', name: 'ASC' } })
			// A multi-select value holds several options; each one is a facet value.
			const facetValues: { name: string, value: string }[] = await dataSource.query(`
				SELECT DISTINCT a.name, v.value
				FROM record_attributes a
				INNER JOIN records r ON exist(r.meta_data, a.name)
				CROSS JOIN LATERAL unnest(CASE WHEN a.value_type = 'multi_select' THEN string_to_array(r.meta_data -> a.name, '|') ELSE ARRAY[r.meta_data -> a.name] END) AS v(value)
				WHERE a.facetable IS TRUE
			`)
			return facets.map((facet) => ({
				id: facet.id,
				name: facet.name,
				displayName: facet.displayName,
				values: facetValues.filter((entry) => entry.name === facet.name).map((entry) => entry.value),
			}))
		}),
	create: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(z.object({
			name: z.string().trim().min(1).max(100),
			displayName: z.string().trim().max(200).nullable(),
			valueType: valueType.default('text'),
			options: options.optional(),
			facetable: z.boolean(),
			viewable: z.boolean(),
			searchable: z.boolean(),
		}))
		.mutation(async ({ input }) => {
			const repository = dataSource.getRepository(RecordAttribute)
			if (input.name === await catalogueKeyColumnName(dataSource.manager)) {
				throw new TRPCError({ code: 'BAD_REQUEST', message: `${input.name} is the key column.` })
			}
			if (await repository.existsBy({ name: input.name })) {
				throw new TRPCError({ code: 'CONFLICT', message: `A field named ${input.name} already exists.` })
			}
			const [{ next }] = await dataSource.query('SELECT coalesce(max(position) + 1, 0)::int AS next FROM record_attributes')
			const attribute = repository.create({
				name: input.name,
				displayName: input.displayName || null,
				valueType: input.valueType,
				options: isSelect(input.valueType) ? (input.options?.length ? input.options : optionsFromValues(await valuesOf(input.name), input.valueType)) : [],
				position: next,
				facetable: input.facetable,
				viewable: input.facetable || input.viewable,
				searchable: input.searchable,
			})
			await repository.save(attribute)
			return { ...formatRecordAttribute(attribute), invalidCount: await invalidCount(attribute) }
		}),
	update: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(z.object({
			id: z.uuid(),
			displayName: z.string().trim().max(200).nullable().optional(),
			valueType: valueType.optional(),
			options: options.optional(),
			facetable: z.boolean().optional(),
			viewable: z.boolean().optional(),
			searchable: z.boolean().optional(),
		}))
		.mutation(async ({ input }) => {
			const repository = dataSource.getRepository(RecordAttribute)
			const attribute = await repository.findOneBy({ id: input.id })
			if (!attribute) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Record attribute not found.' })
			}
			if (input.displayName !== undefined) attribute.displayName = input.displayName || null
			if (input.facetable !== undefined) attribute.facetable = input.facetable
			if (input.viewable !== undefined) attribute.viewable = input.viewable
			if (input.searchable !== undefined) attribute.searchable = input.searchable
			attribute.viewable = attribute.facetable || attribute.viewable
			if (input.valueType !== undefined) attribute.valueType = input.valueType
			if (input.options !== undefined) attribute.options = input.options
			if (!isSelect(attribute.valueType)) attribute.options = []
			// A field turned into a select starts with the values records already hold.
			else if (!attribute.options.length) attribute.options = optionsFromValues(await valuesOf(attribute.name), attribute.valueType)
			await repository.save(attribute)
			return { ...formatRecordAttribute(attribute), invalidCount: await invalidCount(attribute) }
		}),
	reorder: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(z.object({ ids: z.array(z.uuid()).min(1).max(1000) }))
		.mutation(async ({ input }) => {
			await dataSource.query(`
				UPDATE record_attributes a SET position = o.position - 1, updated_at = now()
				FROM unnest($1::uuid[]) WITH ORDINALITY AS o(id, position) WHERE a.id = o.id
			`, [input.ids])
			const attributes = await dataSource.getRepository(RecordAttribute).find({ order: { position: 'ASC', name: 'ASC' } })
			return attributes.map(formatRecordAttribute)
		}),
	// Removing a field removes its value from every record, and each record
	// keeps the value it lost in its history.
	remove: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(z.uuid())
		.mutation(async ({ input, ctx }) => {
			const attribute = await dataSource.getRepository(RecordAttribute).findOneBy({ id: input })
			if (!attribute) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Record attribute not found.' })
			}
			const linked = await fieldIsLinked(dataSource.manager, [attribute.name])
			const cleared = await dataSource.transaction(async (em) => {
				await em.query(`
					INSERT INTO record_changes (record_id, record_key, action, source, changes, changed_by_id)
					SELECT r.id, r.record_key, 'update', 'attribute', jsonb_build_object($1::text, jsonb_build_object('old', r.meta_data -> $1, 'new', NULL)), $2
					FROM records r WHERE r.meta_data ? $1 AND r.meta_data -> $1 <> ''
				`, [attribute.name, ctx.user.id])
				const [, count] = await em.query(`UPDATE records SET meta_data = delete(meta_data, $1::text), updated_at = now() WHERE meta_data ? $1`, [attribute.name])
				await em.getRepository(RecordAttribute).remove(attribute)
				return count ?? 0
			})
			if (linked) await rerunEntityStage()
			return { ...formatRecordAttribute({ ...attribute, id: input } as RecordAttribute), cleared }
		}),
	usage: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(z.uuid())
		.query(async ({ input }) => {
			const attribute = await dataSource.getRepository(RecordAttribute).findOneBy({ id: input })
			if (!attribute) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Record attribute not found.' })
			}
			const values = await valuesOf(attribute.name)
			return {
				filled: values.length,
				invalid: await invalidCount(attribute),
			}
		}),
})
