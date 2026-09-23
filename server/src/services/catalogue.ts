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
import { z } from "zod"
import { RecordAttribute } from "../entity/record-attribute"
import { User } from "../entity/user"
import { userCollectionFilesQuery, userCollectionsQuery } from "./collection"
import { visibleCollectionIdsSql, visibleRecordsCondition } from "./product-collections"
import { catalogueKeyColumnName, likePattern, loadFields, RecordQuery, recordQuerySql } from "./records"

const relatedFilter = z.object({
	column: z.string().min(1).max(200),
	op: z.enum(['contains', 'is', 'is_not', 'is_empty', 'is_not_empty', 'has_any']),
	value: z.string().max(500).optional(),
	values: z.string().max(500).array().max(100).optional(),
}).refine(filter => ['is_empty', 'is_not_empty'].includes(filter.op) || (filter.op === 'has_any' ? !!filter.values?.length : !!filter.value?.trim()), 'Complete each filter before saving.')

export const relatedRecordsSettings = z.object({
	enabled: z.boolean(),
	groups: z.object({
		scope: z.enum(['current', 'all']),
		matchField: z.string().min(1).max(200).nullable(),
		hasPhoto: z.boolean(),
		filters: relatedFilter.array().max(10),
		excludeFilters: relatedFilter.array().max(10),
	}).array().min(1).max(5),
})
export type RelatedRecordsSettings = z.infer<typeof relatedRecordsSettings>
export const defaultRelatedRecords: RelatedRecordsSettings = {
	enabled: true,
	groups: [{ scope: 'all', matchField: '$family', hasPhoto: false, filters: [], excludeFilters: [] }],
}

export const CATALOGUE_PAGE_MAX = 96
// How many visuals a card carries before it shows a "+N" badge.
export const CARD_VISUALS = 4
const DETAIL_VISUALS = 60
const FACET_VALUES = 200

export type CatalogueVisual = { id: string, view: string | null, thumbnailStorageKey: string }
export type CatalogueCard = {
	id: string
	recordKey: string
	metaData: Record<string, string>
	thumbnailStorageKey: string | null
	visuals: CatalogueVisual[]
	visualCount: number
	fileCount: number
	readiness: { filled: number, total: number, ready: boolean }
	family: { key: string, label: string } | null
}
export type CatalogueQuery = RecordQuery & {
	collectionId?: string
	collectionOnly?: boolean
	searchTerms?: string[]
	related?: { settings: RelatedRecordsSettings, source: CatalogueCard, collectionId?: string }
	// One model: every product sharing the value of the family field.
	familyKey?: string
	// Products an administrator's definition calls ready, or the rest.
	readiness?: 'ready' | 'incomplete'
}

// The fields a reader may read. A field made filterable is viewable too, so
// this one list covers cards, the product page and the facets.
async function readableFields(em: EntityManager) {
	return (await loadFields(em)).filter((field) => field.viewable)
}

function readableValues(metaData: Record<string, string>, fields: RecordAttribute[], keyColumnName: string | null) {
	const values: Record<string, string> = {}
	for (const field of fields) {
		const value = metaData[field.name]
		if (value) values[field.name] = value
	}
	if (keyColumnName && metaData[keyColumnName]) values[keyColumnName] = metaData[keyColumnName]
	return values
}

// Free text reaches the key and the fields an administrator marked searchable.
// The records list searches every value, which a reader must not do: probing
// for a value would otherwise confirm what a field kept out of sight holds.
function searchCondition(search: string | string[] | undefined, fields: RecordAttribute[], parameters: unknown[]) {
	const terms = (Array.isArray(search) ? search : [search ?? '']).map(term => term.trim()).filter(Boolean)
	if (!terms.length) {
		return 'true'
	}
	parameters.push(terms.map(likePattern))
	const patterns = `$${parameters.length}::text[]`
	parameters.push(fields.filter((field) => field.searchable).map((field) => field.name))
	return `(r.record_key ILIKE ANY(${patterns}) OR EXISTS (
		SELECT 1 FROM each(r.meta_data) e
		WHERE e.key = ANY($${parameters.length}::text[]) AND e.value ILIKE ANY(${patterns})
	))`
}

// Files accessible through file collections or a visible record, with
// licence dates and region restrictions applied to both access paths.
function visibleFileIdsSql(user: User, parameters: unknown[], em: EntityManager) {
	const [sql, params] = userCollectionFilesQuery(user, em).select('collection_file.asset_file_id').getQueryAndParameters()
	const offset = parameters.length
	parameters.push(...params)
	return offset === 0 ? sql : sql.replace(/\$(\d+)/g, (_, index) => `$${Number(index) + offset}`)
}

// The scope of a listing: everything the reader may see, narrowed to one
// collection and its descendants when the reader opened one.
export async function scopeCondition(em: EntityManager, user: User, collectionId: string | undefined, parameters: unknown[], hideWithoutMedia = false, collectionOnly = false) {
	let visible = visibleRecordsCondition(user, 'r', parameters, em)
	if (hideWithoutMedia) {
		const files = visibleFileIdsSql(user, parameters, em)
		visible += ` AND EXISTS (
			SELECT 1 FROM asset_files a
			LEFT JOIN asset_entity_links l ON l.asset_file_id = a.id AND l.target_kind = 'record' AND l.status = 'active'
			WHERE coalesce(l.record_id, a.record_id) = r.id AND a.id IN (${files})
		)`
	}

	if (!collectionId) {
		return visible
	}
	const collection = await userCollectionsQuery(user, em).andWhere('collection.id = :id', { id: collectionId }).getOne()
	if (!collection) {
		throw new TRPCError({ code: 'NOT_FOUND', message: 'Collection not found.' })
	}
	if (collection.includesAllRecords) {
		return visible
	}
	parameters.push(collectionOnly ? collection.id : collection.path ?? '')
	const pathParameter = `$${parameters.length}`
	return `${visible} AND EXISTS (
		SELECT 1 FROM collection_records cr
		INNER JOIN collections holder ON holder.id = cr.collection_id
		WHERE cr.record_id = r.id AND NOT cr.excluded AND holder.id IN (${visibleCollectionIdsSql(user, parameters, em)}) AND ${collectionOnly ? `holder.id = ${pathParameter}::uuid` : `holder.mpath LIKE ${pathParameter} || '%'`}
	)`
}

async function visualsOf(em: EntityManager, user: User, recordIds: string[], thumbnailView: string | null, perRecord: number) {
	if (!recordIds.length) {
		return new Map<string, { visuals: CatalogueVisual[], visualCount: number, fileCount: number }>()
	}
	const parameters: unknown[] = [recordIds, thumbnailView ?? '']
	const visibleFiles = visibleFileIdsSql(user, parameters, em)
	// A file reaches a product through a link or, for files older than links,
	// through the column the matching used to write. Only the files the reader
	// may open are counted, so a card never promises media it cannot show.
	const rows: { record_id: string, id: string, record_view: string | null, has_thumbnail: boolean, position: string, visual_count: string, file_count: string }[] = await em.query(`
		WITH linked AS (
			SELECT DISTINCT coalesce(l.record_id, a.record_id) AS record_id, a.id, a.record_view, a.has_thumbnail, a.name
			FROM asset_files a
			LEFT JOIN asset_entity_links l ON l.asset_file_id = a.id AND l.target_kind = 'record' AND l.status = 'active'
			WHERE coalesce(l.record_id, a.record_id) = ANY($1::uuid[])
			AND a.id IN (${visibleFiles})
		)
		SELECT record_id, id, record_view, has_thumbnail,
			row_number() OVER (PARTITION BY record_id, has_thumbnail ORDER BY (record_view IS NOT DISTINCT FROM $2) DESC, record_view NULLS LAST, name) AS position,
			count(*) FILTER (WHERE has_thumbnail) OVER (PARTITION BY record_id) AS visual_count,
			count(*) OVER (PARTITION BY record_id) AS file_count
		FROM linked
		ORDER BY record_id, position
	`, parameters)
	const byRecord = new Map<string, { visuals: CatalogueVisual[], visualCount: number, fileCount: number }>()
	for (const row of rows) {
		const entry = byRecord.get(row.record_id)
			?? { visuals: [], visualCount: Number(row.visual_count), fileCount: Number(row.file_count) }
		if (row.has_thumbnail && Number(row.position) <= perRecord) {
			entry.visuals.push({ id: row.id, view: row.record_view, thumbnailStorageKey: `asset-file/${row.id}-thumbnail` })
		}
		byRecord.set(row.record_id, entry)
	}
	return byRecord
}

async function relatedCondition(em: EntityManager, user: User, related: NonNullable<CatalogueQuery['related']>, fields: RecordAttribute[], keyColumnName: string | null, parameters: unknown[]) {
	if (!related.settings.enabled) return 'false'
	const groups: string[] = []
	for (const group of related.settings.groups) {
		if (group.scope === 'current' && !related.collectionId) continue
		const columns = [...group.filters, ...group.excludeFilters].map(filter => filter.column)
		if (columns.some(column => column !== 'recordKey' && column !== keyColumnName && !fields.some(field => field.name === column))) continue
		if (group.matchField === '$family' && !related.source.family) continue
		if (group.matchField && group.matchField !== '$family' && (!fields.some(field => field.name === group.matchField) || !related.source.metaData[group.matchField])) continue
		const conditions = [await scopeCondition(em, user, group.scope === 'current' ? related.collectionId : undefined, parameters)]
		if (group.matchField === '$family') {
			parameters.push(related.source.family!.key)
			conditions.push(`r.family_key = $${parameters.length}`)
		} else if (group.matchField) {
			parameters.push(group.matchField, related.source.metaData[group.matchField])
			conditions.push(`r.meta_data -> $${parameters.length - 1} = $${parameters.length}`)
		}
		conditions.push(recordQuerySql({ filters: group.filters }, fields, keyColumnName, parameters).where)
		for (const filter of group.excludeFilters) {
			conditions.push(`NOT (${recordQuerySql({ filters: [filter] }, fields, keyColumnName, parameters).where})`)
		}
		if (group.hasPhoto) {
			const files = visibleFileIdsSql(user, parameters, em)
			conditions.push(`EXISTS (
				SELECT 1 FROM asset_files a
				LEFT JOIN asset_entity_links l ON l.asset_file_id = a.id AND l.target_kind = 'record' AND l.status = 'active'
				WHERE coalesce(l.record_id, a.record_id) = r.id AND a.mime_type LIKE 'image/%' AND a.id IN (${files})
			)`)
		}
		groups.push(`(${conditions.join(' AND ')})`)
	}
	parameters.push(related.source.id)
	return `r.id <> $${parameters.length}::uuid AND (${groups.join(' OR ') || 'false'})`
}

export async function listCatalogue(
	em: EntityManager,
	user: User,
	query: CatalogueQuery,
	page: { offset: number, limit: number },
	thumbnailView: string | null,
	hideWithoutMedia = false,
) {
	const [fields, keyColumnName] = await Promise.all([readableFields(em), catalogueKeyColumnName(em)])
	const parameters: unknown[] = []
	const scope = await scopeCondition(em, user, query.collectionId, parameters, hideWithoutMedia, query.collectionOnly)
	const search = searchCondition(query.searchTerms ?? query.search, fields, parameters)
	const { where, orderBy } = recordQuerySql({
		...query,
		search: undefined,
		filters: query.filters?.map(filter => ({ ...filter, column: fields.find(field => field.id === filter.column)?.name ?? filter.column })),
	}, fields, keyColumnName, parameters)
	const readiness = query.readiness === 'ready' ? ' AND r.readiness_ready' : query.readiness === 'incomplete' ? ' AND NOT r.readiness_ready' : ''
	let family = ''
	if (query.familyKey) {
		parameters.push(query.familyKey)
		family = ` AND r.family_key = $${parameters.length}`
	}
	const related = query.related ? await relatedCondition(em, user, query.related, fields, keyColumnName, parameters) : 'true'
	// The page bounds are the last two placeholders, whatever came before.
	parameters.push(page.limit, page.offset)
	const rows: { id: string, record_key: string, meta_data: Record<string, string>, readiness_filled: number, readiness_total: number, readiness_ready: boolean, family_key: string | null, family_label: string | null, total: string }[] = await em.query(`
		SELECT r.id, r.record_key, hstore_to_json(r.meta_data) AS meta_data,
			r.readiness_filled, r.readiness_total, r.readiness_ready, r.family_key, r.family_label,
			count(*) OVER () AS total
		FROM records r
		WHERE ${scope} AND (${where}) AND ${search}${readiness}${family} AND (${related})
		ORDER BY ${orderBy}
		LIMIT $${parameters.length - 1} OFFSET $${parameters.length}
	`, parameters)
	const visuals = await visualsOf(em, user, rows.map((row) => row.id), thumbnailView, CARD_VISUALS)
	const cards: CatalogueCard[] = rows.map((row) => {
		const found = visuals.get(row.id)
		return {
			id: row.id,
			recordKey: row.record_key,
			metaData: readableValues(row.meta_data ?? {}, fields, keyColumnName),
			thumbnailStorageKey: found?.visuals[0]?.thumbnailStorageKey ?? null,
			visuals: found?.visuals ?? [],
			visualCount: found?.visualCount ?? 0,
			fileCount: found?.fileCount ?? 0,
			readiness: { filled: row.readiness_filled, total: row.readiness_total, ready: row.readiness_ready },
			family: row.family_key ? { key: row.family_key, label: row.family_label ?? row.family_key } : null,
		}
	})
	return { rows: cards, total: rows.length ? Number(rows[0].total) : 0, fields, keyColumnName }
}

export async function catalogueFacets(em: EntityManager, user: User, query: CatalogueQuery, hideWithoutMedia = false) {
	const [fields, keyColumnName] = await Promise.all([readableFields(em), catalogueKeyColumnName(em)])
	const parameters: unknown[] = []
	const scope = await scopeCondition(em, user, query.collectionId, parameters, hideWithoutMedia, query.collectionOnly)
	const [count] = await em.query(`SELECT count(*)::int AS total FROM records r WHERE ${scope}`, parameters)
	const attributes = await Promise.all(fields.filter(field => field.facetable).map(async field => {
		const values = [...parameters]
		const search = searchCondition(query.searchTerms ?? query.search, fields, values)
		const { where } = recordQuerySql({ filters: query.filters?.filter(filter => filter.column !== field.name && filter.column !== field.id).map(filter => ({ ...filter, column: fields.find(field => field.id === filter.column)?.name ?? filter.column })) }, fields, keyColumnName, values)
		values.push(field.name)
		const expression = `r.meta_data -> $${values.length}`
		const options: { id: string, label: string, count: number }[] = await em.query(`
			SELECT value AS id, value AS label, count(DISTINCT r.id)::int AS count
			FROM records r
			CROSS JOIN LATERAL unnest(${field.valueType === 'multi_select' ? `string_to_array(${expression}, '|')` : `ARRAY[${expression}]`}) AS value
			WHERE ${scope} AND ${search} AND (${where}) AND value IS NOT NULL AND value <> ''
			GROUP BY value ORDER BY value LIMIT ${FACET_VALUES}
		`, values)
		for (const value of query.filters?.find(filter => filter.column === field.name || filter.column === field.id)?.values ?? []) {
			if (!options.some(option => option.id === value)) options.push({ id: value, label: value, count: 0 })
		}
		return { id: field.id, label: field.displayName ?? field.name, options }
	}))
	return { total: count.total as number, assetTypes: [], fileTypes: [], extensions: [], attributes }
}

export async function getCatalogueRecord(em: EntityManager, user: User, id: string, thumbnailView: string | null, relatedSettings = defaultRelatedRecords, collectionId?: string, relatedOffset = 0, hideWithoutMedia = false) {
	const { rows, fields, keyColumnName } = await listCatalogue(em, user, { ids: [id] }, { offset: 0, limit: 1 }, thumbnailView)
	if (!rows.length) {
		throw new TRPCError({ code: 'NOT_FOUND', message: 'Product not found.' })
	}
	const visuals = await visualsOf(em, user, [id], thumbnailView, DETAIL_VISUALS)
	const parameters: unknown[] = [id]
	const visibleFiles = visibleFileIdsSql(user, parameters, em)
	// Every file of the product the reader may open, whatever kind it is.
	const files: { id: string, name: string, path: string, record_view: string | null, has_thumbnail: boolean, mime_type: string, size: string }[] = await em.query(`
		SELECT DISTINCT a.id, a.name, f.path, a.record_view, a.has_thumbnail, a.mime_type, a.size
		FROM asset_files a
		INNER JOIN asset_folders f ON f.id = a.folder_id
		LEFT JOIN asset_entity_links l ON l.asset_file_id = a.id AND l.target_kind = 'record' AND l.status = 'active'
		WHERE (
			coalesce(l.record_id, a.record_id) = $1::uuid
			OR EXISTS (
				SELECT 1 FROM asset_entity_links range_link
				INNER JOIN records range_record ON range_record.id = $1::uuid
					AND (range_record.meta_data -> range_link.attribute_name) = range_link.attribute_value
				WHERE range_link.asset_file_id = a.id AND range_link.target_kind = 'attribute' AND range_link.status = 'active'
			)
		)
		AND a.id IN (${visibleFiles})
		ORDER BY a.record_view NULLS LAST, a.name
	`, parameters)
	if (collectionId) await scopeCondition(em, user, collectionId, [])
	const related = await listCatalogue(em, user, {
		related: { settings: relatedSettings, source: rows[0], collectionId },
		sort: { column: 'recordKey', direction: 'asc' },
	}, { offset: relatedOffset, limit: 24 }, thumbnailView, hideWithoutMedia)
	return {
		...rows[0],
		siblings: related.rows,
		relatedTotal: related.total,
		visuals: visuals.get(id)?.visuals ?? [],
		visualCount: visuals.get(id)?.visualCount ?? rows[0].visualCount,
		fields,
		keyColumnName,
		files: files.map((file) => ({
			id: file.id,
			name: file.name,
			path: file.path,
			view: file.record_view,
			mimeType: file.mime_type,
			size: file.size,
			thumbnailStorageKey: file.has_thumbnail ? `asset-file/${file.id}-thumbnail` : null,
		})),
	}
}
