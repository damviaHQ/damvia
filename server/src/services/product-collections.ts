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
import { EntityManager, IsNull, Not } from "typeorm"
import { Collection } from "../entity/collection"
import { Page } from "../entity/page"
import { PageBlock, PageBlockType } from "../entity/page-block"
import { CollectionRecord, CollectionRecordSource } from "../entity/collection-record"
import { User, UserRole } from "../entity/user"
import { dataSource, logger } from "../env"
import { userCollectionsQuery } from "./collection"
import { catalogueKeyColumnName, loadFields, RecordQuery, recordQuerySql } from "./records"

// A DELETE ... RETURNING hands back [rows, count] while an INSERT ... RETURNING
// hands back the rows; both are read the same way here.
function returnedRows(result: unknown): unknown[] {
	return Array.isArray(result) && Array.isArray(result[0]) ? result[0] : (result as unknown[])
}

// A query built by the query builder carries its own placeholder numbers.
// Pasting it inside a larger statement means renumbering them.
function shiftPlaceholders(sql: string, offset: number) {
	return offset === 0 ? sql : sql.replace(/\$(\d+)/g, (_, index) => `$${Number(index) + offset}`)
}

// The collections a reader may open, as a subquery. Products borrow the one
// visibility rule of the application instead of restating it.
export function visibleCollectionIdsSql(user: User, parameters: unknown[], em: EntityManager = dataSource.manager) {
	const [sql, params] = userCollectionsQuery(user, em).select('collection.id').getQueryAndParameters()
	const shifted = shiftPlaceholders(sql, parameters.length)
	parameters.push(...params)
	return shifted
}

// A reader sees a product when a collection they may open holds it, or stands
// for the whole catalogue. The media of that product keep their own rights.
export function visibleRecordsCondition(user: User, alias: string, parameters: unknown[], em: EntityManager = dataSource.manager) {
	const collections = visibleCollectionIdsSql(user, parameters, em)
	return `EXISTS (
		SELECT 1 FROM collections visible
		WHERE visible.id IN (${collections})
		AND (
			visible.includes_all_records
			OR EXISTS (SELECT 1 FROM collection_records cr WHERE cr.collection_id = visible.id AND cr.record_id = ${alias}.id AND NOT cr.excluded)
		)
	)`
}

// Picking products by hand reads the whole record database for an
// administrator, who is the one building the catalogue in the first place, and
// only what they can already see for anybody else. Matching is done on the
// record key so a reference list pasted from a spreadsheet lands as it is.
export async function pickableRecords(em: EntityManager, user: User, by: 'id' | 'key', values: string[]) {
	if (!values.length) {
		return []
	}
	const parameters: unknown[] = [values]
	const column = by === 'id' ? 'r.id = ANY($1::uuid[])' : 'btrim(lower(r.record_key)) = ANY($1::text[])'
	const visible = user.role === UserRole.ADMIN ? 'TRUE' : visibleRecordsCondition(user, 'r', parameters, em)
	return await em.query(
		`SELECT r.id, r.record_key AS "recordKey" FROM records r WHERE ${column} AND ${visible}`,
		parameters,
	) as { id: string, recordKey: string }[]
}

// A catalogue is read through the page of its collection, like everything
// else a reader opens, so the page is born with the block that draws the
// products. Without it the collection would open on the empty file layout.
export async function createCataloguePage(em: EntityManager, collection: Collection) {
	// A plain check-then-insert would race two requests turning the same
	// collection into a catalogue at once, and the second would fail against
	// the unique constraint on collection_id.
	const inserted = await em.query(
		`INSERT INTO pages (collection_id) VALUES ($1) ON CONFLICT (collection_id) DO NOTHING RETURNING id`,
		[collection.id],
	)
	if (!inserted.length) {
		return em.getRepository(Page).findOneByOrFail({ collectionId: collection.id })
	}
	const page = await em.getRepository(Page).findOneByOrFail({ id: inserted[0].id })
	// A collection holding both keeps the layout a reader already knows, with
	// the products above the files.
	const types = collection.catalogueMode === 'both'
		? [PageBlockType.PRODUCTS, PageBlockType.COLLECTIONS, PageBlockType.FILES]
		: [PageBlockType.PRODUCTS]
	await em.getRepository(PageBlock).save(types.map((type, position) => {
		const block = new PageBlock()
		block.pageId = page.id
		block.type = type
		block.position = position
		block.size = 'full'
		block.data = type === PageBlockType.COLLECTIONS
			? { title: '', layout: null, collectionsId: null, layoutFilter: null }
			: type === PageBlockType.FILES
				? { title: '', layout: null, masonrySize: null, collectionId: null }
				: { title: '', layout: null, collectionId: null }
		return block
	}))
	return page
}

export async function addRecords(em: EntityManager, collectionId: string, recordIds: string[], source = CollectionRecordSource.MANUAL) {
	if (!recordIds.length) {
		return 0
	}
	const inserted = await em.query(`
		INSERT INTO collection_records (collection_id, record_id, source)
		SELECT $1::uuid, id, $3 FROM records WHERE id = ANY($2::uuid[])
		ON CONFLICT (collection_id, record_id) DO NOTHING
		RETURNING record_id
	`, [collectionId, recordIds, source])
	return returnedRows(inserted).length
}

// The membership as whoever builds the collection sees it: every row, the ones
// taken out of the catalogue included, with the score that says what is left to
// produce. Readers never see this; it is the screen a catalogue is built on.
export async function collectionRecordPreview(em: EntityManager, collectionId: string, page: { offset: number, limit: number }) {
	const rows: {
		id: string, record_key: string, meta_data: Record<string, string>, source: string, excluded: boolean,
		readiness_filled: number, readiness_total: number, readiness_ready: boolean, total: string,
	}[] = await em.query(`
		SELECT r.id, r.record_key, hstore_to_json(r.meta_data) AS meta_data, cr.source, cr.excluded,
			r.readiness_filled, r.readiness_total, r.readiness_ready,
			count(*) OVER () AS total
		FROM collection_records cr
		INNER JOIN records r ON r.id = cr.record_id
		WHERE cr.collection_id = $1::uuid
		ORDER BY cr.excluded, r.record_key
		LIMIT $2 OFFSET $3
	`, [collectionId, page.limit, page.offset])
	return {
		rows: rows.map((row) => ({
			id: row.id,
			recordKey: row.record_key,
			metaData: row.meta_data ?? {},
			source: row.source,
			excluded: row.excluded,
			readiness: { filled: row.readiness_filled, total: row.readiness_total, ready: row.readiness_ready },
		})),
		total: rows.length ? Number(rows[0].total) : 0,
	}
}

export async function setRecordsExcluded(em: EntityManager, collectionId: string, recordIds: string[], excluded: boolean) {
	if (!recordIds.length) {
		return 0
	}
	const changed = await em.query(
		`UPDATE collection_records SET excluded = $3 WHERE collection_id = $1::uuid AND record_id = ANY($2::uuid[]) AND excluded <> $3 RETURNING record_id`,
		[collectionId, recordIds, excluded],
	)
	return returnedRows(changed).length
}

// Taking out everything a readiness definition does not call ready, in one go,
// which is the whole point of scoring a catalogue before publishing it.
export async function excludeNotReadyRecords(em: EntityManager, collectionId: string) {
	const changed = await em.query(`
		UPDATE collection_records cr SET excluded = true
		FROM records r
		WHERE r.id = cr.record_id AND cr.collection_id = $1::uuid AND NOT cr.excluded AND NOT r.readiness_ready
		RETURNING cr.record_id
	`, [collectionId])
	return returnedRows(changed).length
}

export async function removeRecords(em: EntityManager, collectionId: string, recordIds: string[]) {
	if (!recordIds.length) {
		return 0
	}
	const removed = await em.query(
		`DELETE FROM collection_records WHERE collection_id = $1::uuid AND record_id = ANY($2::uuid[]) RETURNING record_id`,
		[collectionId, recordIds],
	)
	return returnedRows(removed).length
}

// The membership of a collection driven by rules. Rows added by hand are left
// alone: a product picked by an editor stays even when the rules stop matching
// it, and only rows written by a previous refresh are taken away.
export async function refreshDynamicCollection(em: EntityManager, collection: Collection) {
	if (!collection.recordFilters?.length) {
		return { added: 0, removed: 0 }
	}
	const [fields, keyColumnName] = await Promise.all([loadFields(em), catalogueKeyColumnName(em)])
	const query: RecordQuery = {
		tableId: collection.recordTableId ?? undefined,
		filters: collection.recordFilters,
	}
	const parameters: unknown[] = [collection.id]
	const { where } = recordQuerySql(query, fields, keyColumnName, parameters)
	const removed = await em.query(`
		DELETE FROM collection_records cr
		WHERE cr.collection_id = $1::uuid AND cr.source = '${CollectionRecordSource.RULE}'
		AND NOT EXISTS (SELECT 1 FROM records r WHERE r.id = cr.record_id AND (${where}))
		RETURNING cr.record_id
	`, parameters)
	const added = await em.query(`
		INSERT INTO collection_records (collection_id, record_id, source)
		SELECT $1::uuid, r.id, '${CollectionRecordSource.RULE}' FROM records r WHERE ${where}
		ON CONFLICT (collection_id, record_id) DO NOTHING
		RETURNING record_id
	`, parameters)
	return { added: returnedRows(added).length, removed: returnedRows(removed).length }
}

// Every collection driven by rules, refreshed in one pass. A collection whose
// rules point at a field that no longer exists is skipped rather than failing
// the pass for everybody else.
export async function refreshAllDynamicCollections(em: EntityManager) {
	const collections = await em.getRepository(Collection).findBy({ recordFilters: Not(IsNull()) })
	let added = 0
	let removed = 0
	for (const collection of collections) {
		try {
			const result = await refreshDynamicCollection(em, collection)
			added += result.added
			removed += result.removed
		} catch (cause) {
			logger.warn('product-collection.rules-failed', { collectionId: collection.id, message: (cause as Error).message })
		}
	}
	return { collections: collections.length, added, removed }
}

export async function collectionRecordIds(em: EntityManager, collectionId: string) {
	const rows = await em.getRepository(CollectionRecord).findBy({ collectionId })
	return rows.map((row) => row.recordId)
}
