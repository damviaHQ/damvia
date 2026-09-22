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
import { EnrichmentSettings } from "../../entity/enrichment-settings"
import { assetsS3, assetsS3Bucket, dataSource } from "../../env"
import {
	catalogueCollections,
	catalogueFacets,
	CATALOGUE_PAGE_MAX,
	CatalogueCard,
	getCatalogueRecord,
	listCatalogue,
	listFamilies,
} from "../../services/catalogue"
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
	readiness: z.enum(['ready', 'incomplete']).optional(),
	familyKey: z.string().max(200).optional(),
	search: z.string().max(200).optional(),
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
				keyColumnName: result.keyColumnName,
				readinessLabels: await readinessLabels(),
				fields: result.fields.map((field) => ({
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
		.input(z.uuid())
		.query(async ({ input, ctx }) => {
			const record = await getCatalogueRecord(dataSource.manager, ctx.user, input, (await settings()).thumbnailView)
			const { thumbnailStorageKey, visuals, files, fields, siblings, ...rest } = record
			return {
				...rest,
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
	// One entry per model rather than one per key.
	families: publicProcedure
		.use(authMiddleware(userApproved))
		.input(z.object({
			offset: z.number().int().min(0),
			limit: z.number().int().min(1).max(CATALOGUE_PAGE_MAX),
			...query,
		}))
		.query(async ({ input, ctx }) => {
			const { offset, limit, ...rest } = input
			return listFamilies(dataSource.manager, ctx.user, rest, { offset, limit })
		}),
	facets: publicProcedure
		.use(authMiddleware(userApproved))
		.input(z.object(query))
		.query(({ input, ctx }) => catalogueFacets(dataSource.manager, ctx.user, input, null)),
	collections: publicProcedure
		.use(authMiddleware(userApproved))
		.query(async ({ ctx }) => {
			const rows = await catalogueCollections(dataSource.manager, ctx.user)
			return rows.map((row) => ({
				id: row.id,
				name: row.name,
				description: row.description,
				numberOfRecords: row.number_of_records,
				includesAllRecords: row.includes_all_records,
				catalogueMode: row.catalogue_mode,
			}))
		}),
})
