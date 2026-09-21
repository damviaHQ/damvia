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
import { Brackets, In, SelectQueryBuilder } from "typeorm"
import { CollectionFile } from "../entity/collection-file"
import { MetadataField } from "../entity/metadata-field"
import { RecordAttribute } from "../entity/record-attribute"
import { User } from "../entity/user"
import { dataSource } from "../env"
import { userCollectionFilesQuery } from "./collection"

const UUID_PATTERN = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/i
const isUuid = (value: string) => UUID_PATTERN.test(value)

export type SearchSort = 'relevance' | 'name' | 'newest'

export type SearchInput = {
	query?: string | null
	extensions?: string[] | null
	minSize?: number | null
	maxSize?: number | null
	collectionId?: string | null
	assetTypes?: string[] | null
	recordViews?: string[] | null
	fileTypes?: string[] | null
	searchScope?: string | null
	exactMatch?: boolean | null
	attributes?: Record<string, string[] | null> | null
	metadata?: Record<string, string[] | { from?: string | null, to?: string | null } | null> | null
	variantAxes?: Record<string, string[] | null> | null
}

// A facet dimension left out of the predicate set so its counts show what selecting it would add.
export type SearchDimension = 'assetTypes' | 'fileTypes' | 'extensions' | 'recordViews' | `attribute:${string}` | `metadata:${string}` | `axis:${string}`

export type SearchContext = {
	searchableAttributes: RecordAttribute[]
	filterAttributes: RecordAttribute[]
	facetableAttributes: RecordAttribute[]
	searchableMetadata: boolean
	filterMetadata: MetadataField[]
	facetableMetadata: MetadataField[]
	facetableAxes: string[]
}

export const FACET_VALUES_LIMIT = 200

const documentMimeTypes = [
	'application/msword', // .doc
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
	'application/pdf', // .pdf
	'application/vnd.ms-powerpoint', // .ppt
	'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
	'application/vnd.ms-excel', // .xls
	'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
]

// Paired with fileTypeOf in client/src/utils/fileType.ts, which buckets a file
// the same way for the page filter; keep the two in step.
export const fileTypeConditions: Record<string, string> = {
	document: `asset_file.mime_type IN (${documentMimeTypes.map((type) => `'${type}'`).join(', ')})`,
	video: "(asset_file.mime_type ILIKE 'video/%' OR asset_file.mime_type = 'application/mp4')",
	image: "asset_file.mime_type ILIKE 'image/%'",
}

// The extension as typed in the file name, lower case and without the dot; null when the name has none.
export const fileExtensionExpression = "NULLIF(lower(substring(asset_file.name from '\\.([^.]+)$')), '')"

export function normalizeExtension(value: string) {
	return value.trim().toLowerCase().replace(/^\./, '')
}

export const fileTypeExpression = `CASE WHEN ${fileTypeConditions.image} THEN 'image' WHEN ${fileTypeConditions.video} THEN 'video' WHEN ${fileTypeConditions.document} THEN 'document' ELSE 'other' END`

export function searchTokens(query?: string | null): string[] {
	return query?.trim() ? query.trim().split(/\s+/) : []
}

export function activeAttributeIds(input: SearchInput): string[] {
	const attributes = input.attributes ?? {}
	return Object.keys(attributes).filter((key) => isUuid(key) && (attributes[key]?.length ?? 0) > 0)
}

export function activeMetadataIds(input: SearchInput): string[] {
	const metadata = input.metadata ?? {}
	return Object.keys(metadata).filter((key) => {
		const value = metadata[key]
		return isUuid(key) && (Array.isArray(value) ? value.length > 0 : !!(value?.from || value?.to))
	})
}

export async function loadSearchContext(input: SearchInput): Promise<SearchContext> {
	const repository = dataSource.getRepository(RecordAttribute)
	const fields = dataSource.getRepository(MetadataField)
	const ids = activeAttributeIds(input)
	const metadataIds = activeMetadataIds(input)
	const axes: { id: string }[] = await dataSource.query('SELECT a.id FROM variant_axes a WHERE NOT a.ignored AND EXISTS (SELECT 1 FROM variant_group_axes ga WHERE ga.variant_axis_id = a.id) ORDER BY a.created_at, a.id')
	const [searchableAttributes, filterAttributes, facetableAttributes, searchableMetadata, filterMetadata, facetableMetadata] = await Promise.all([
		repository.findBy({ searchable: true }),
		ids.length ? repository.findBy({ id: In(ids) }) : Promise.resolve([]),
		repository.findBy({ facetable: true }),
		fields.existsBy({ searchable: true }),
		metadataIds.length ? fields.findBy({ id: In(metadataIds), facetable: true }) : Promise.resolve([]),
		fields.findBy({ facetable: true }),
	])
	return { searchableAttributes, filterAttributes, facetableAttributes, searchableMetadata, filterMetadata, facetableMetadata, facetableAxes: axes.map((axis) => axis.id) }
}

// One token matches when the file name or any searchable attribute contains it.
function tokenMatch(context: SearchContext, parameter: string): string {
	const parts = [
		`asset_file.name ILIKE :${parameter}`,
		...context.searchableAttributes.map((_, index) => `(record.meta_data -> :attribute${index}) ILIKE :${parameter}`),
		...(context.searchableMetadata ? [`EXISTS (SELECT 1 FROM asset_file_metadata_values search_value INNER JOIN metadata_fields search_field ON search_field.id = search_value.metadata_field_id WHERE search_value.asset_file_id = asset_file.id AND search_field.searchable AND search_value.value_text ILIKE :${parameter})`] : []),
	]
	return `(${parts.join(' OR ')})`
}

export function buildSearchQuery(
	user: User,
	input: SearchInput,
	context: SearchContext,
	exclude?: SearchDimension,
): SelectQueryBuilder<CollectionFile> {
	const query = userCollectionFilesQuery(user)
	context.searchableAttributes.forEach((attribute, index) => query.setParameter(`attribute${index}`, attribute.name))

	const tokens = searchTokens(input.query)
	if (input.query && input.exactMatch) {
		query.andWhere(tokenMatch(context, 'query'), { query: `%${input.query}%` })
	} else if (tokens.length) {
		query.andWhere(new Brackets((baseQuery) =>
			tokens.reduce((q, value, index) => {
				const where = index === 0 ? q.where : q.orWhere
				return where.call(q, tokenMatch(context, `query${index}`), { [`query${index}`]: `%${value}%` })
			}, baseQuery),
		))
	}

	if (exclude !== 'assetTypes' && input.assetTypes?.length) {
		query.andWhere('asset_file.asset_type_id IN (:...assetTypeIds)', { assetTypeIds: input.assetTypes })
	}

	if (exclude !== 'recordViews' && input.recordViews?.length) {
		query.andWhere('asset_file.record_view IN (:...recordViews)', { recordViews: input.recordViews })
		query.andWhere('asset_type.is_related_to_records IS TRUE')
	}

	if (input.searchScope === 'current_with_sub' && input.collectionId) {
		query.andWhere('collection.mpath ILIKE :collectionPath', { collectionPath: `%${input.collectionId}.%` })
	} else if (input.searchScope === 'current' && input.collectionId) {
		query.andWhere('collection.id = :collectionId', { collectionId: input.collectionId })
	}

	// Values inside one attribute are alternatives; attributes narrow each other.
	const inputAttributes = input.attributes ?? {}
	context.filterAttributes
		.filter((attribute) => exclude !== `attribute:${attribute.id}` && (inputAttributes[attribute.id]?.length ?? 0) > 0)
		.forEach((attribute, index) => {
			// A multi-select value holds several options joined by |; any selected one matches.
			const condition = attribute.valueType === 'multi_select'
				? `string_to_array(record.meta_data -> :attributekey${index}, '|') && ARRAY[:...attributevalue${index}]::text[]`
				: `record.meta_data[:attributekey${index}] IN (:...attributevalue${index})`
			query.andWhere(condition, {
				[`attributekey${index}`]: attribute.name,
				[`attributevalue${index}`]: inputAttributes[attribute.id],
			})
		})

	// Metadata belongs to the file, so these filters also work on files no
	// record is linked to. A date field takes a from/to range, inclusive.
	const inputMetadata = input.metadata ?? {}
	context.filterMetadata
		.filter((field) => exclude !== `metadata:${field.id}`)
		.forEach((field, index) => {
			const value = inputMetadata[field.id]
			const exists = `EXISTS (SELECT 1 FROM asset_file_metadata_values filter_value${index} WHERE filter_value${index}.asset_file_id = asset_file.id AND filter_value${index}.metadata_field_id = :metadataField${index}`
			query.setParameter(`metadataField${index}`, field.id)
			if (Array.isArray(value)) {
				query.andWhere(`${exists} AND filter_value${index}.value_text IN (:...metadataValues${index}))`, { [`metadataValues${index}`]: value })
			} else if (value) {
				const bounds: string[] = []
				if (value.from) bounds.push(`filter_value${index}.value_date >= :metadataFrom${index}`)
				if (value.to) bounds.push(`filter_value${index}.value_date < CAST(:metadataTo${index} AS date) + 1`)
				query.andWhere(`${exists} AND ${bounds.join(' AND ')})`, { [`metadataFrom${index}`]: value.from, [`metadataTo${index}`]: value.to })
			}
		})

	// A value of a variant axis: the file is a member of a group using that
	// axis and holds that value at the axis position.
	const inputAxes = input.variantAxes ?? {}
	Object.keys(inputAxes).filter((axisId) => isUuid(axisId) && (inputAxes[axisId]?.length ?? 0) > 0 && exclude !== `axis:${axisId}`).forEach((axisId, index) => {
		query.andWhere(`EXISTS (
			SELECT 1 FROM variant_group_members axis_member${index}
			INNER JOIN variant_group_axes axis_position${index} ON axis_position${index}.variant_group_id = axis_member${index}.variant_group_id AND axis_position${index}.variant_axis_id = :axis${index}
			WHERE axis_member${index}.asset_file_id = asset_file.id AND axis_member${index}.axis_values[axis_position${index}.position + 1] IN (:...axisValues${index})
		)`, { [`axis${index}`]: axisId, [`axisValues${index}`]: inputAxes[axisId] })
	})

	if (exclude !== 'extensions' && input.extensions?.length) {
		query.andWhere(`${fileExtensionExpression} IN (:...extensions)`, {
			extensions: input.extensions.map(normalizeExtension).filter((value) => value),
		})
	}

	// A size range the user typed, in bytes; either end may be left open.
	if (typeof input.minSize === 'number') {
		query.andWhere('asset_file.size >= :minSize', { minSize: input.minSize })
	}
	if (typeof input.maxSize === 'number') {
		query.andWhere('asset_file.size <= :maxSize', { maxSize: input.maxSize })
	}

	if (exclude !== 'fileTypes' && input.fileTypes?.length) {
		const conditions = input.fileTypes.filter((type) => Object.prototype.hasOwnProperty.call(fileTypeConditions, type)).map((type) => fileTypeConditions[type])
		if (conditions.length) {
			query.andWhere(`(${conditions.join(' OR ')})`)
		}
	}

	return query
}

// A file shared by several visible collections is one result: its first
// visible collection file stands for it, whatever the order asked for.
export function onePerFile(query: SelectQueryBuilder<CollectionFile>, candidates: SelectQueryBuilder<CollectionFile>, collapseVariants = false) {
	let first = candidates.select('collection_file.id')
	if (collapseVariants) {
		// A group of variants is one result too, shown by its cover when the
		// reader can see it, else by its first visible member.
		const key = 'coalesce(CAST(collapse_member.variant_group_id AS text), CAST(asset_file.id AS text))'
		first = first
			.leftJoin('variant_group_members', 'collapse_member', 'collapse_member.asset_file_id = asset_file.id')
			.leftJoin('variant_groups', 'collapse_group', 'collapse_group.id = collapse_member.variant_group_id')
			.distinctOn([key]).orderBy(key).addOrderBy('CASE WHEN collapse_group.cover_asset_file_id = asset_file.id THEN 0 ELSE 1 END').addOrderBy('collection_file.id')
	} else {
		first = first.distinctOn(['asset_file.id']).orderBy('asset_file.id').addOrderBy('collection_file.id')
	}
	return query.andWhere(`collection_file.id IN (${first.getQuery()})`).setParameters(first.getParameters())
}

// Files linked to a range (an attribute value) that records matching the text
// query share. They are listed apart from the exact results and never repeat
// one of them.
function addRangeConditions(user: User, query: SelectQueryBuilder<CollectionFile>, input: SearchInput, context: SearchContext) {
	const tokens = input.exactMatch && input.query ? [input.query] : searchTokens(input.query)
	const matches = tokens.map((token, index) => {
		query.setParameter(`range${index}`, `%${token}%`)
		return [
			`range_record.record_key ILIKE :range${index}`,
			...context.searchableAttributes.map((_, attribute) => `(range_record.meta_data -> :attribute${attribute}) ILIKE :range${index}`),
		].join(' OR ')
	})
	const exact = buildSearchQuery(user, input, context).select('asset_file.id')
	return query
		.andWhere(`EXISTS (
			SELECT 1 FROM asset_entity_links range_link
			INNER JOIN records range_record ON (range_record.meta_data -> range_link.attribute_name) = range_link.attribute_value
			WHERE range_link.asset_file_id = asset_file.id AND range_link.target_kind = 'attribute' AND range_link.status = 'active'
				AND (${matches.map((match) => `(${match})`).join(' OR ')})
		)`)
		.andWhere(`asset_file.id NOT IN (${exact.getQuery()})`)
		.setParameters(exact.getParameters())
}

export function buildRangeQuery(user: User, input: SearchInput, context: SearchContext): SelectQueryBuilder<CollectionFile> | null {
	if (!input.query?.trim()) return null
	const scope = { ...input, query: null }
	const query = addRangeConditions(user, buildSearchQuery(user, scope, context), input, context)
	onePerFile(query, addRangeConditions(user, buildSearchQuery(user, scope, context), input, context))
	return query.orderBy('asset_file.name', 'ASC').addOrderBy('asset_file.id', 'ASC')
}

export function applySearchOrder(query: SelectQueryBuilder<CollectionFile>, input: SearchInput, context: SearchContext, sort?: SearchSort | null) {
	const tokens = searchTokens(input.query)
	const effectiveSort: SearchSort = sort ?? (tokens.length ? 'relevance' : 'name')
	if (effectiveSort === 'newest') {
		query.orderBy('asset_file.updated_at', 'DESC')
	} else if (effectiveSort === 'relevance' && tokens.length) {
		if (input.exactMatch) {
			query.orderBy('CASE WHEN asset_file.name ILIKE :prefix THEN 1 ELSE 0 END', 'DESC')
				.setParameter('prefix', `${input.query!.trim()}%`)
		} else {
			// Files matching more of the words come first, then files whose name starts with a word.
			const matched = tokens.map((_, index) => `(CASE WHEN ${tokenMatch(context, `query${index}`)} THEN 1 ELSE 0 END)`).join(' + ')
			const prefixed = tokens.map((value, index) => {
				query.setParameter(`prefix${index}`, `${value}%`)
				return `(CASE WHEN asset_file.name ILIKE :prefix${index} THEN 1 ELSE 0 END)`
			}).join(' + ')
			query.orderBy(`(${matched})`, 'DESC').addOrderBy(`(${prefixed})`, 'DESC')
		}
		query.addOrderBy('asset_file.name', 'ASC')
	} else {
		query.orderBy('asset_file.name', 'ASC')
	}
	query.addOrderBy('asset_file.id', 'ASC')
	return query
}

export type SearchFacets = {
	assetTypes: Record<string, number>
	fileTypes: Record<string, number>
	extensions: Record<string, number>
	recordViews: Record<string, number>
	attributes: Record<string, Record<string, number>>
	metadata: Record<string, Record<string, number>>
	metadataRanges: Record<string, { min: Date | null, max: Date | null }>
	variantAxes: Record<string, Record<string, number>>
}

type CountRow = { key: string | null, count: string }

function toCounts(rows: CountRow[]): Record<string, number> {
	return Object.fromEntries(rows.filter((row) => row.key !== null).map((row) => [row.key as string, parseInt(row.count, 10)]))
}

// A multi-select field counts each option on its own: the rows of the search
// are wrapped so their value can be split (TypeORM has no lateral join).
async function countOptions(query: SelectQueryBuilder<CollectionFile>, expression: string): Promise<Record<string, number>> {
	const [sql, parameters] = query
		.select('asset_file.id', 'file_id')
		.addSelect(expression, 'raw')
		.orderBy()
		.getQueryAndParameters()
	const rows: CountRow[] = await dataSource.query(`
		SELECT option AS key, COUNT(DISTINCT rows.file_id) AS count
		FROM (${sql}) rows CROSS JOIN LATERAL unnest(string_to_array(rows.raw, '|')) AS option
		WHERE option <> ''
		GROUP BY option ORDER BY 2 DESC LIMIT ${FACET_VALUES_LIMIT}
	`, parameters)
	return toCounts(rows)
}

async function countBy(query: SelectQueryBuilder<CollectionFile>, expression: string): Promise<Record<string, number>> {
	const rows = await query
		.select(expression, 'key')
		.addSelect('COUNT(DISTINCT asset_file.id)', 'count')
		.groupBy(expression)
		.orderBy('COUNT(DISTINCT asset_file.id)', 'DESC')
		.limit(FACET_VALUES_LIMIT)
		.getRawMany<CountRow>()
	return toCounts(rows)
}

// Counts run over the whole result set, each dimension with its own filter left out.
export async function searchFacets(user: User, input: SearchInput, context: SearchContext): Promise<SearchFacets> {
	const textFields = context.facetableMetadata.filter((field) => field.valueType !== 'date')
	const dateFields = context.facetableMetadata.filter((field) => field.valueType === 'date')
	const [metadata, metadataRanges] = await Promise.all([
		Promise.all(textFields.map((field) =>
			countBy(
				buildSearchQuery(user, input, context, `metadata:${field.id}`)
					.innerJoin('asset_file_metadata_values', 'facet_value', 'facet_value.asset_file_id = asset_file.id AND facet_value.metadata_field_id = :facetField', { facetField: field.id }),
				'facet_value.value_text',
			).then((counts) => [field.id, counts] as const)
		)),
		Promise.all(dateFields.map((field) =>
			buildSearchQuery(user, input, context, `metadata:${field.id}`)
				.innerJoin('asset_file_metadata_values', 'facet_value', 'facet_value.asset_file_id = asset_file.id AND facet_value.metadata_field_id = :facetField', { facetField: field.id })
				.select('min(facet_value.value_date)', 'min').addSelect('max(facet_value.value_date)', 'max')
				.getRawOne<{ min: Date | null, max: Date | null }>()
				.then((bounds) => [field.id, { min: bounds?.min ?? null, max: bounds?.max ?? null }] as const)
		)),
	])
	const variantAxes = await Promise.all(context.facetableAxes.map((axisId) =>
		countBy(
			buildSearchQuery(user, input, context, `axis:${axisId}`)
				.innerJoin('variant_group_members', 'facet_member', 'facet_member.asset_file_id = asset_file.id')
				.innerJoin('variant_group_axes', 'facet_axis', 'facet_axis.variant_group_id = facet_member.variant_group_id AND facet_axis.variant_axis_id = :facetAxis', { facetAxis: axisId }),
			'facet_member.axis_values[facet_axis.position + 1]',
		).then((counts) => [axisId, counts] as const)
	))
	const [assetTypes, fileTypes, extensions, recordViews, ...attributes] = await Promise.all([
		countBy(buildSearchQuery(user, input, context, 'assetTypes'), 'asset_file.asset_type_id'),
		countBy(buildSearchQuery(user, input, context, 'fileTypes'), fileTypeExpression),
		countBy(buildSearchQuery(user, input, context, 'extensions'), fileExtensionExpression),
		countBy(buildSearchQuery(user, input, context, 'recordViews').andWhere('asset_type.is_related_to_records IS TRUE'), 'asset_file.record_view'),
		...context.facetableAttributes.map((attribute) =>
			(attribute.valueType === 'multi_select' ? countOptions : countBy)(
				buildSearchQuery(user, input, context, `attribute:${attribute.id}`).setParameter('facetName', attribute.name),
				'record.meta_data -> :facetName',
			).then((counts) => [attribute.id, counts] as const)
		),
	])
	return { assetTypes, fileTypes, extensions, recordViews, attributes: Object.fromEntries(attributes), metadata: Object.fromEntries(metadata), metadataRanges: Object.fromEntries(metadataRanges), variantAxes: Object.fromEntries(variantAxes.filter(([, counts]) => Object.keys(counts).length > 0)) }
}
