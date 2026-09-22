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
import { RecordAttribute } from "../entity/record-attribute"
import { User } from "../entity/user"
import { userCollectionFilesQuery, userCollectionsQuery } from "./collection"
import { visibleCollectionIdsSql, visibleRecordsCondition } from "./product-collections"
import { catalogueKeyColumnName, likePattern, loadFields, RecordQuery, recordQuerySql } from "./records"

export const CATALOGUE_PAGE_MAX = 96
// How many visuals a card carries before it shows a "+N" badge.
export const CARD_VISUALS = 4
const DETAIL_VISUALS = 60
const FACET_VALUES = 50

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
	// One model: every product sharing the value of the family field.
	familyKey?: string
	// Products an administrator's definition calls ready, or the rest.
	readiness?: 'ready' | 'incomplete'
}

// The fields a reader may read. A field made filterable is viewable too, so
// this one list covers cards, the product page and the facets.
export async function readableFields(em: EntityManager) {
	return (await loadFields(em)).filter((field) => field.viewable)
}

export function readableValues(metaData: Record<string, string>, fields: RecordAttribute[], keyColumnName: string | null) {
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
function searchCondition(search: string | undefined, fields: RecordAttribute[], parameters: unknown[]) {
	const text = search?.trim()
	if (!text) {
		return 'true'
	}
	parameters.push(likePattern(text))
	const pattern = `$${parameters.length}`
	parameters.push(fields.filter((field) => field.searchable).map((field) => field.name))
	return `(r.record_key ILIKE ${pattern} OR EXISTS (
		SELECT 1 FROM each(r.meta_data) e
		WHERE e.key = ANY($${parameters.length}::text[]) AND e.value ILIKE ${pattern}
	))`
}

// The files a reader may open, as a subquery. Media keep the rights of the
// library: a product stays visible while a file of it does not.
function visibleFileIdsSql(user: User, parameters: unknown[], em: EntityManager) {
	const [sql, params] = userCollectionFilesQuery(user, em).select('collection_file.asset_file_id').getQueryAndParameters()
	const offset = parameters.length
	parameters.push(...params)
	return offset === 0 ? sql : sql.replace(/\$(\d+)/g, (_, index) => `$${Number(index) + offset}`)
}

// The scope of a listing: everything the reader may see, narrowed to one
// collection and its descendants when the reader opened one.
async function scopeCondition(em: EntityManager, user: User, collectionId: string | undefined, parameters: unknown[]) {
	const visible = visibleRecordsCondition(user, 'r', parameters, em)
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
	parameters.push(collection.path ?? '')
	return `${visible} AND EXISTS (
		SELECT 1 FROM collection_records cr
		INNER JOIN collections holder ON holder.id = cr.collection_id
		WHERE cr.record_id = r.id AND holder.mpath LIKE $${parameters.length} || '%'
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
	const scope = await scopeCondition(em, user, query.collectionId, parameters)
	const search = searchCondition(query.search, fields, parameters)
	const { where, orderBy } = recordQuerySql({ ...query, search: undefined }, fields, keyColumnName, parameters)
	const readiness = query.readiness === 'ready' ? ' AND r.readiness_ready' : query.readiness === 'incomplete' ? ' AND NOT r.readiness_ready' : ''
	// An administrator can keep products with nothing to show out of the
	// catalogue. It is a count per row, so it is only ever applied to a listing.
	let withMedia = ''
	if (hideWithoutMedia) {
		const files = visibleFileIdsSql(user, parameters, em)
		withMedia = ` AND EXISTS (
			SELECT 1 FROM asset_files a
			LEFT JOIN asset_entity_links l ON l.asset_file_id = a.id AND l.target_kind = 'record' AND l.status = 'active'
			WHERE coalesce(l.record_id, a.record_id) = r.id AND a.id IN (${files})
		)`
	}
	let family = ''
	if (query.familyKey) {
		parameters.push(query.familyKey)
		family = ` AND r.family_key = $${parameters.length}`
	}
	// The page bounds are the last two placeholders, whatever came before.
	parameters.push(page.limit, page.offset)
	const rows: { id: string, record_key: string, meta_data: Record<string, string>, readiness_filled: number, readiness_total: number, readiness_ready: boolean, family_key: string | null, family_label: string | null, total: string }[] = await em.query(`
		SELECT r.id, r.record_key, hstore_to_json(r.meta_data) AS meta_data,
			r.readiness_filled, r.readiness_total, r.readiness_ready, r.family_key, r.family_label,
			count(*) OVER () AS total
		FROM records r
		WHERE ${scope} AND (${where}) AND ${search}${readiness}${family}${withMedia}
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

export async function getCatalogueRecord(em: EntityManager, user: User, id: string, thumbnailView: string | null) {
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
		WHERE coalesce(l.record_id, a.record_id) = $1::uuid
		AND a.id IN (${visibleFiles})
		ORDER BY a.record_view NULLS LAST, a.name
	`, parameters)
	// The other products of the same model, so a reader jumps from one colour
	// or format to the next.
	const siblings = rows[0].family
		? (await listCatalogue(em, user, { familyKey: rows[0].family.key }, { offset: 0, limit: 24 }, thumbnailView)).rows
			.filter((sibling) => sibling.id !== id)
		: []
	return {
		...rows[0],
		siblings,
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

// The values a reader can narrow the catalogue with, counted over what they
// are allowed to see and over the filters already chosen.
export async function catalogueFacets(em: EntityManager, user: User, query: CatalogueQuery, thumbnailView: string | null) {
	const [fields, keyColumnName] = await Promise.all([readableFields(em), catalogueKeyColumnName(em)])
	const facetable = fields.filter((field) => field.facetable)
	if (!facetable.length) {
		return []
	}
	const parameters: unknown[] = []
	const scope = await scopeCondition(em, user, query.collectionId, parameters)
	const search = searchCondition(query.search, fields, parameters)
	const { where } = recordQuerySql({ ...query, search: undefined }, fields, keyColumnName, parameters)
	parameters.push(facetable.map((field) => field.name))
	const names = `$${parameters.length}`
	parameters.push(facetable.filter((field) => field.valueType === 'multi_select').map((field) => field.name))
	const multi = `$${parameters.length}`
	const rows: { key: string, value: string, count: string }[] = await em.query(`
		WITH scope AS (SELECT r.meta_data FROM records r WHERE ${scope} AND (${where}) AND ${search})
		SELECT pair.key, value, count(*)::int AS count
		FROM scope
		CROSS JOIN LATERAL each(scope.meta_data) AS pair(key, raw)
		CROSS JOIN LATERAL unnest(CASE WHEN pair.key = ANY(${multi}::text[]) THEN string_to_array(pair.raw, '|') ELSE ARRAY[pair.raw] END) AS value
		WHERE pair.key = ANY(${names}::text[]) AND value <> ''
		GROUP BY 1, 2
		ORDER BY 3 DESC, 2 ASC
	`, parameters)
	return facetable.map((field) => ({
		name: field.name,
		displayName: field.displayName ?? field.name,
		valueType: field.valueType,
		values: rows
			.filter((row) => row.key === field.name)
			.slice(0, FACET_VALUES)
			.map((row) => ({ value: row.value, count: Number(row.count) })),
	})).filter((facet) => facet.values.length > 0)
}

// One row per model: its label, how many products it holds and the visual of
// the first of them.
export async function listFamilies(em: EntityManager, user: User, query: CatalogueQuery, page: { offset: number, limit: number }) {
	const [fields, keyColumnName] = await Promise.all([readableFields(em), catalogueKeyColumnName(em)])
	const parameters: unknown[] = []
	const scope = await scopeCondition(em, user, query.collectionId, parameters)
	const search = searchCondition(query.search, fields, parameters)
	const { where } = recordQuerySql({ ...query, search: undefined }, fields, keyColumnName, parameters)
	parameters.push(page.limit, page.offset)
	const rows: { family_key: string, family_label: string, count: string, total: string }[] = await em.query(`
		SELECT r.family_key, min(r.family_label) AS family_label, count(*)::int AS count, count(*) OVER () AS total
		FROM records r
		WHERE ${scope} AND (${where}) AND ${search} AND r.family_key IS NOT NULL
		GROUP BY r.family_key
		ORDER BY min(r.family_label)
		LIMIT $${parameters.length - 1} OFFSET $${parameters.length}
	`, parameters)
	return {
		rows: rows.map((row) => ({ key: row.family_key, label: row.family_label, count: Number(row.count) })),
		total: rows.length ? Number(rows[0].total) : 0,
	}
}

// The collections a reader browses products in, for the catalogue landing page.
export async function catalogueCollections(em: EntityManager, user: User) {
	const parameters: unknown[] = []
	const visible = visibleCollectionIdsSql(user, parameters, em)
	return em.query(`
		SELECT c.id, c.name, c.description, c.number_of_records, c.includes_all_records, c.catalogue_mode
		FROM collections c
		WHERE c.id IN (${visible}) AND c.catalogue_mode <> 'files'
		ORDER BY c.name
	`, parameters) as Promise<{ id: string, name: string, description: string | null, number_of_records: number, includes_all_records: boolean, catalogue_mode: string }[]>
}