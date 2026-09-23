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
import { z } from "zod"
import { Collection } from "../../entity/collection"
import { EnrichmentSettings } from "../../entity/enrichment-settings"
import { assetsS3, assetsS3Bucket, dataSource } from "../../env"
import {
	CATALOGUE_PAGE_MAX,
	defaultRelatedRecords,
	CatalogueCard,
	catalogueFacets,
	getCatalogueRecord,
	listCatalogue,
} from "../../services/catalogue"
import { userCollectionFilesQuery } from "../../services/collection"
import { loadViewableMetadata } from "../../services/file-metadata"
import { formatCollectionFile } from "./collection"
import { readinessFor } from "../../services/record-readiness"
import { authMiddleware, publicProcedure, router, userApproved } from "../index"

// The reader side of the record database: products, their visuals and the
// values an administrator made visible. Nothing here reaches a record the
// reader cannot see through a collection.
const filter = z.object({
	column: z.string().min(1).max(200),
	op: z.enum(['contains', 'is', 'is_not', 'is_empty', 'is_not_empty', 'has_any']),
	value: z.string().max(500).optional(),
	values: z.string().max(500).array().max(100).optional(),
})
const query = {
	collectionId: z.uuid().optional(),
	collectionOnly: z.boolean().optional(),
	readiness: z.enum(['ready', 'incomplete']).optional(),
	familyKey: z.string().max(200).optional(),
	search: z.string().max(200).optional(),
	searchTerms: z.string().min(1).max(200).array().max(100).optional(),
	filters: filter.array().max(10).optional(),
	sort: z.object({ column: z.string().min(1).max(200), direction: z.enum(['asc', 'desc']) }).optional(),
}

async function settings() {
	return dataSource.getRepository(EnrichmentSettings).findOneByOrFail({ id: 1 })
}

// The labels an administrator chose for a product that carries everything
// required, and for one that does not.
async function readinessLabels() {
	const definition = await readinessFor(dataSource.manager, null)
	return {
		ready: definition?.readyLabel ?? 'Ready to use',
		incomplete: definition?.incompleteLabel ?? 'To complete',
		defined: !!definition && (definition.requiredAttributeIds.length > 0 || definition.requiredViews.length > 0),
	}
}

function presign(key: string | null): Promise<string | null> {
	return key ? assetsS3().presignedGetObject(assetsS3Bucket(), key) : Promise.resolve(null)
}

async function formatVisual(visual: { id: string, view: string | null, thumbnailStorageKey: string }) {
	return { id: visual.id, view: visual.view, thumbnailURL: await presign(visual.thumbnailStorageKey) }
}

async function formatCard(card: CatalogueCard) {
	const { thumbnailStorageKey, visuals, ...rest } = card
	return {
		...rest,
		thumbnailURL: await presign(thumbnailStorageKey),
		visuals: await Promise.all(visuals.map(formatVisual)),
	}
}

export default router({
	facets: publicProcedure
		.use(authMiddleware(userApproved))
		.input(z.object(query))
		.query(async ({ input, ctx }) => catalogueFacets(dataSource.manager, ctx.user, input, (await settings()).hideRecordsWithoutMedia)),
	list: publicProcedure
		.use(authMiddleware(userApproved))
		.input(z.object({
			offset: z.number().int().min(0),
			limit: z.number().int().min(1).max(CATALOGUE_PAGE_MAX),
			...query,
		}))
		.query(async ({ input, ctx }) => {
			const { offset, limit, ...rest } = input
			const enrichment = await settings()
			const result = await listCatalogue(dataSource.manager, ctx.user, rest, { offset, limit }, enrichment.thumbnailView, enrichment.hideRecordsWithoutMedia)
			return {
				products: await Promise.all(result.rows.map(formatCard)),
				total: result.total,
				// The one field a card shows under the reference, when the
				// administrator named one and readers may see it.
				cardTitleField: result.fields.some((field) => field.name === enrichment.cardTitleAttributeName)
					? enrichment.cardTitleAttributeName
					: null,
				fields: result.fields.map((field) => ({
					id: field.id,
					name: field.name,
					displayName: field.displayName ?? field.name,
					valueType: field.valueType,
					facetable: field.facetable,
					position: field.position,
				})),
			}
		}),
	get: publicProcedure
		.use(authMiddleware(userApproved))
		.input(z.union([z.uuid(), z.object({ id: z.uuid(), collectionId: z.uuid().optional(), relatedOffset: z.number().int().min(0).default(0) })]))
		.query(async ({ input, ctx }) => {
			const enrichment = await settings()
			const { id, collectionId, relatedOffset } = typeof input === 'string' ? { id: input, collectionId: undefined, relatedOffset: 0 } : input
			const collection = collectionId ? await dataSource.getRepository(Collection).findOneBy({ id: collectionId }) : null
			const record = await getCatalogueRecord(dataSource.manager, ctx.user, id, enrichment.thumbnailView,
				collection?.relatedRecords ?? enrichment.relatedRecords ?? defaultRelatedRecords, collectionId, relatedOffset, enrichment.hideRecordsWithoutMedia)
			const { thumbnailStorageKey, visuals, files, fields, siblings, ...rest } = record
			const linkedFiles = files.length ? await userCollectionFilesQuery(ctx.user)
				.andWhere('asset_file.id IN (:...ids)', { ids: files.map(file => file.id) })
				.orderBy('asset_file.record_view', 'ASC', 'NULLS LAST')
				.addOrderBy('asset_file.name', 'ASC')
				.addOrderBy('collection_file.id', 'ASC')
				.getMany() : []
			const uniqueFiles = [...new Map(linkedFiles.map(file => [file.assetFileId, file])).values()]
			const metadata = await loadViewableMetadata(uniqueFiles.map(file => file.assetFileId))
			const attributes = fields.flatMap(field => {
				const value = record.metaData[field.name] ?? null
				const values = field.valueType === 'multi_select' && value ? value.split('|').filter(Boolean) : [value]
				return values.map(value => ({ id: field.id, name: field.name, displayName: field.displayName, value, facetable: field.facetable }))
			})
			return {
				...rest,
				cardTitleField: fields.some(field => field.name === enrichment.cardTitleAttributeName) ? enrichment.cardTitleAttributeName : null,
				collectionFiles: await Promise.all(uniqueFiles.map(async file => ({
					...await formatCollectionFile({ file, recordAttributes: fields, metadata }),
					record: { id: record.id, attributes },
				}))),
				thumbnailURL: await presign(thumbnailStorageKey),
				visuals: await Promise.all(visuals.map(formatVisual)),
				fields: fields.map((field) => ({
					name: field.name,
					displayName: field.displayName ?? field.name,
					valueType: field.valueType,
					position: field.position,
				})),
				files: await Promise.all(files.map(async ({ thumbnailStorageKey: key, ...file }) => ({
					...file,
					thumbnailURL: await presign(key),
				}))),
				readinessLabels: await readinessLabels(),
				siblings: await Promise.all(siblings.map(formatCard)),
			}
		}),
})
