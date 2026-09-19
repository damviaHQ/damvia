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
import { ProductAttribute } from "../entity/product-attribute"
import { User } from "../entity/user"
import { dataSource } from "../env"
import { userCollectionFilesQuery } from "./collection"

const UUID_PATTERN = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/i
const isUuid = (value: string) => UUID_PATTERN.test(value)

export type SearchSort = 'relevance' | 'name' | 'newest'

export type SearchInput = {
	query?: string | null
	extensions?: string[] | null
	collectionId?: string | null
	assetTypes?: string[] | null
	productViews?: string[] | null
	fileTypes?: string[] | null
	searchScope?: string | null
	exactMatch?: boolean | null
	attributes?: Record<string, string[] | null> | null
}

// A facet dimension left out of the predicate set so its counts show what selecting it would add.
export type SearchDimension = 'assetTypes' | 'fileTypes' | 'extensions' | 'productViews' | `attribute:${string}`

export type SearchContext = {
	searchableAttributes: ProductAttribute[]
	filterAttributes: ProductAttribute[]
	facetableAttributes: ProductAttribute[]
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

export async function loadSearchContext(input: SearchInput): Promise<SearchContext> {
	const repository = dataSource.getRepository(ProductAttribute)
	const ids = activeAttributeIds(input)
	const [searchableAttributes, filterAttributes, facetableAttributes] = await Promise.all([
		repository.findBy({ searchable: true }),
		ids.length ? repository.findBy({ id: In(ids) }) : Promise.resolve([]),
		repository.findBy({ facetable: true }),
	])
	return { searchableAttributes, filterAttributes, facetableAttributes }
}

// One token matches when the file name or any searchable attribute contains it.
function tokenMatch(context: SearchContext, parameter: string): string {
	const parts = [
		`asset_file.name ILIKE :${parameter}`,
		...context.searchableAttributes.map((_, index) => `(product.meta_data -> :attribute${index}) ILIKE :${parameter}`),
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

	if (exclude !== 'productViews' && input.productViews?.length) {
		query.andWhere('asset_file.product_view IN (:...productViews)', { productViews: input.productViews })
		query.andWhere('asset_type.is_related_to_products IS TRUE')
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
			query.andWhere(`product.meta_data[:attributekey${index}] IN (:...attributevalue${index})`, {
				[`attributekey${index}`]: attribute.name,
				[`attributevalue${index}`]: inputAttributes[attribute.id],
			})
		})

	if (exclude !== 'extensions' && input.extensions?.length) {
		query.andWhere(`${fileExtensionExpression} IN (:...extensions)`, {
			extensions: input.extensions.map(normalizeExtension).filter((value) => value),
		})
	}

	if (exclude !== 'fileTypes' && input.fileTypes?.length) {
		const conditions = input.fileTypes.filter((type) => Object.prototype.hasOwnProperty.call(fileTypeConditions, type)).map((type) => fileTypeConditions[type])
		if (conditions.length) {
			query.andWhere(`(${conditions.join(' OR ')})`)
		}
	}

	return query
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
	productViews: Record<string, number>
	attributes: Record<string, Record<string, number>>
}

type CountRow = { key: string | null, count: string }

function toCounts(rows: CountRow[]): Record<string, number> {
	return Object.fromEntries(rows.filter((row) => row.key !== null).map((row) => [row.key as string, parseInt(row.count, 10)]))
}

async function countBy(query: SelectQueryBuilder<CollectionFile>, expression: string): Promise<Record<string, number>> {
	const rows = await query
		.select(expression, 'key')
		.addSelect('COUNT(*)', 'count')
		.groupBy(expression)
		.orderBy('COUNT(*)', 'DESC')
		.limit(FACET_VALUES_LIMIT)
		.getRawMany<CountRow>()
	return toCounts(rows)
}

// Counts run over the whole result set, each dimension with its own filter left out.
export async function searchFacets(user: User, input: SearchInput, context: SearchContext): Promise<SearchFacets> {
	const [assetTypes, fileTypes, extensions, productViews, ...attributes] = await Promise.all([
		countBy(buildSearchQuery(user, input, context, 'assetTypes'), 'asset_file.asset_type_id'),
		countBy(buildSearchQuery(user, input, context, 'fileTypes'), fileTypeExpression),
		countBy(buildSearchQuery(user, input, context, 'extensions'), fileExtensionExpression),
		countBy(buildSearchQuery(user, input, context, 'productViews').andWhere('asset_type.is_related_to_products IS TRUE'), 'asset_file.product_view'),
		...context.facetableAttributes.map((attribute) =>
			countBy(
				buildSearchQuery(user, input, context, `attribute:${attribute.id}`).setParameter('facetName', attribute.name),
				'product.meta_data -> :facetName',
			).then((counts) => [attribute.id, counts] as const)
		),
	])
	return { assetTypes, fileTypes, extensions, productViews, attributes: Object.fromEntries(attributes) }
}
