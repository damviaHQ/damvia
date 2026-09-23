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
import { Brackets, ILike, In, IsNull, Not } from "typeorm"
import { z } from "zod"
import { AssetFolder } from "../../entity/asset-folder"
import { ACTION_BAR_ACTIONS, CATALOGUE_MODES, Collection } from "../../entity/collection"
import { Group } from "../../entity/group"
import { CollectionFile } from "../../entity/collection-file"
import { RecordAttribute } from "../../entity/record-attribute"
import { User, UserRole } from "../../entity/user"
import { assetsS3, assetsS3Bucket, dataSource, mainS3, mainS3Bucket } from "../../env"
import {
	duplicateCollection,
	duplicateFiles,
	moveCollection,
	removeCollections,
	syncCollectionMenuItems,
	userCollectionFilesQuery,
	userCollectionsQuery
} from "../../services/collection"
import { formatActionBar, resetDescendantActionBars } from "../../services/collection-action-bar"
import { addRecords, collectionRecordPreview, createCataloguePage, excludeNotReadyRecords, pickableRecords, refreshDynamicCollection, removeRecords, setRecordsExcluded } from "../../services/product-collections"
import { loadViewableMetadata, ViewableMetadata } from "../../services/file-metadata"
import { loadVariantGroups, VariantGroupSummary } from "../../services/variant-grouping"
import { applySearchOrder, buildRangeQuery, buildSearchQuery, loadSearchContext, onePerFile, searchFacets } from "../../services/search"
import { collectionSynchronizationQueue } from "../../worker"
import { authMiddleware, publicProcedure, router, userAdmin, userApproved } from "../index"
import invitationRouter, { formatInvitation } from "./collection/invitation"
import { formatLicense } from "./license"
import { formatPage } from "./page"
import { splitMulti } from "../../services/record-values"

export type FormatCollectionOptions = {
	collection: Collection,
	user?: User,
	userVisibleCollections?: Collection[],
	recordAttributes?: RecordAttribute[],
	metadata?: Map<string, ViewableMetadata[]>,
	sampleFiles?: CollectionFile[],
}

export async function formatCollection({ collection, ...opts }: FormatCollectionOptions) {
	const shouldDisplayParent = !opts.userVisibleCollections ||
		opts.userVisibleCollections.some((current) => current.id === collection.parentId)

	return {
		id: collection.id,
		name: collection.name,
		public: collection.public,
		draft: collection.draft,
		description: collection.description,
		numberOfFiles: collection.numberOfFiles,
		numberOfRecords: collection.numberOfRecords,
		catalogueMode: collection.catalogueMode,
		includesAllRecords: collection.includesAllRecords,
		// The rules belong to whoever may edit the collection; a reader only
		// ever sees their outcome.
		recordFilters: opts.user && collection.canEdit(opts.user) ? collection.recordFilters : undefined,
		recordTableId: opts.user && collection.canEdit(opts.user) ? collection.recordTableId : undefined,
		synchronized: collection.synchronized,
		ownerId: collection.ownerId,
		children: collection.children?.length
			? await Promise.all(collection.children.map((child) => formatCollection({ collection: child, ...opts })))
			: undefined,
		files: collection.files?.length
			? await Promise.all(collection.files.map(file => formatCollectionFile({
				file,
				recordAttributes: opts.recordAttributes,
				metadata: opts.metadata,
			})))
			: undefined,
		page: collection.page ? await formatPage(collection.page, opts.user) : null,
		parentId: collection.parentId,
		parent: collection.parent && shouldDisplayParent
			? await formatCollection({ collection: collection.parent, ...opts })
			: undefined,
		invitations: collection.invitations ? collection.invitations.map(formatInvitation) : undefined,
		canEdit: opts.user ? collection.canEdit(opts.user) : undefined,
		sampleFiles: await Promise.all(
			collection.sampleFileIds
				.map((fileId) => (opts.sampleFiles ?? []).find((sample) => sample.id === fileId))
				.filter((file): file is CollectionFile => !!file)
				.map((file) => formatCollectionFile({ file }))
		),
		thumbnailURL: collection.hasThumbnail
			? await mainS3().presignedGetObject(mainS3Bucket(), collection.thumbnailStorageKey)
			: null,
		limitedToGroupIds: collection.limitedToGroupIds,
		canEditLimitedToGroupIds: collection.canEditLimitedToGroupIds,
		orphanedAt: collection.orphanedAt,
		orphanedReason: collection.orphanedReason,
		orphanedFromName: collection.orphanedFromName,
	}
}

// Names were unique per parent in the database until synchronized siblings were
// allowed to share one with a custom collection; manual actions keep the rule.
async function assertNameFree(parentId: string | null | undefined, name: string, exceptId?: string) {
	if (!parentId) return
	const taken = await dataSource.getRepository(Collection).existsBy({ parentId, name, ...(exceptId ? { id: Not(exceptId) } : {}) })
	if (taken) {
		throw new TRPCError({ code: 'BAD_REQUEST', message: 'A collection with this name already exists here.' })
	}
}

export type BuildTreeOptions = {
	collections: Collection[]
	user: User
	parent?: Collection
	sampleFiles?: CollectionFile[]
}

export async function buildTree({ collections, user, parent, sampleFiles }: BuildTreeOptions) {
	let currentCollections = collections
	if (parent) {
		currentCollections = currentCollections.filter((current) => current.parentId === parent.id)
	} else {
		currentCollections = currentCollections.filter(
			(current) => !collections.some((collection) => collection.id === current.parentId)
		)
	}

	return await Promise.all(currentCollections.map(async (current) => {
		current.parent = parent ?? null
		return {
			...await formatCollection({ collection: current, user, sampleFiles }),
			children: await buildTree({ collections, user, parent: current, sampleFiles })
		}
	}))
}

export type FormatCollectionFileOptions = {
	file: CollectionFile,
	recordAttributes?: RecordAttribute[],
	metadata?: Map<string, ViewableMetadata[]>,
	variantGroups?: Map<string, VariantGroupSummary>,
}

export async function formatCollectionFile({ file, recordAttributes, metadata, variantGroups }: FormatCollectionFileOptions) {
	const attributes = recordAttributes
		? Object
			.entries(file.assetFile.record?.metaData ?? {})
			.map(([key, value]) => {
				const recordAttribute = recordAttributes.find(v => v.viewable && v.name === key)
				return recordAttribute ? {
					id: recordAttribute.id,
					name: recordAttribute.name,
					displayName: recordAttribute.displayName,
					// Readers see the options of a multi-select, not their stored form.
					value: recordAttribute.valueType === 'multi_select' ? splitMulti(value).join(', ') : value,
				} : null
			})
			.filter(v => v)
		: null

	return {
		id: file.id,
		name: file.assetFile.name,
		mimeType: file.assetFile.mimeType,
		assetTypeId: file.assetFile.assetTypeId,
		record: file.assetFile.record ? { id: file.assetFile.record.id, attributes } : null,
		assetType: file.assetFile.assetType ? {
			...file.assetFile.assetType,
			recordAttributes: recordAttributes
				?.filter(attribute => attribute.viewable)
				.map(attribute => ({
					id: attribute.id,
					name: attribute.name,
					displayName: attribute.displayName,
				})) ?? [],
		} : null,
		recordView: file.assetFile.recordView,
		metadata: metadata ? metadata.get(file.assetFile.id) ?? [] : null,
		variantGroup: variantGroups?.get(file.assetFile.id) ?? null,
		size: parseInt(file.assetFile.size, 10),
		collectionId: file.collectionId,
		updatedAt: file.assetFile.updatedAt,
		dimensions: {
			height: file.assetFile.height,
			width: file.assetFile.width,
		},
		thumbnailURL: file.assetFile.hasThumbnail
			? await assetsS3().presignedGetObject(assetsS3Bucket(), file.assetFile.thumbnailStorageKey)
			: null,
		fileURL: await assetsS3().presignedGetObject(assetsS3Bucket(), file.assetFile.originalStorageKey),
		license: file.assetFile.license ? {
			id: file.assetFile.license.id,
			name: file.assetFile.license.name,
			scopes: file.assetFile.license.scopes,
			details: file.assetFile.license.details,
			allowedRegionIds: file.assetFile.license.allowedRegionIds,
			expired:
				(file.assetFile.license.usageFrom && new Date(file.assetFile.license.usageFrom).toISOString().slice(0, 10) > new Date().toISOString().slice(0, 10)) ||
				(file.assetFile.license.usageTo && new Date(file.assetFile.license.usageTo).toISOString().slice(0, 10) < new Date().toISOString().slice(0, 10)),
		} : null,
	}
}

const actionBarRule = z.object({
	mode: z.enum(['everyone', 'only', 'except', 'nobody']),
	roles: z.enum(UserRole).array().max(4),
	groupIds: z.uuid().array().max(200),
	userIds: z.uuid().array().max(500),
})
const actionBarSettings = z.partialRecord(z.enum(ACTION_BAR_ACTIONS), actionBarRule)

const searchScope = z.enum(['all', 'current', 'current_with_sub']).optional().nullable()
const RANGE_RESULTS = 60
const metadataInput = z.record(z.string(), z.union([z.string().max(500).array().max(200), z.object({ from: z.iso.date().nullable().optional(), to: z.iso.date().nullable().optional() })]).nullable()).nullable().optional()

export default router({
	invitation: invitationRouter,
	tree: publicProcedure
		.use(authMiddleware(userApproved))
		.query(async ({ ctx }) => {
			const collections = await userCollectionsQuery(ctx.user)
				.leftJoinAndSelect('collection.page', 'page')
				.leftJoinAndSelect('page.blocks', 'blocks')
				.getMany()
			return buildTree({ collections, user: ctx.user })
		}),
	treeAdmin: publicProcedure
		.use(authMiddleware(userAdmin))
		.query(async ({ ctx }) => {
			const collections = await userCollectionsQuery(ctx.user)
				.andWhere('collection.public = :public', { public: true })
				.leftJoinAndSelect('collection.page', 'page')
				.getMany()
			return buildTree({ collections, user: ctx.user })
		}),
	search: publicProcedure
		.use(authMiddleware(userApproved))
		.input(z.object({
			page: z.number().int().min(1).default(1),
			query: z.string().max(2000).nullable().optional(),
			collectionId: z.uuid().nullable().optional(),
			assetTypes: z.uuid().array().optional().nullable(),
			recordViews: z.string().array().optional().nullable(),
			fileTypes: z.string().array().optional().nullable(),
			extensions: z.string().max(20).array().max(50).optional().nullable(),
			minSize: z.number().int().min(0).max(1e15).optional().nullable(),
			maxSize: z.number().int().min(0).max(1e15).optional().nullable(),
			searchScope: searchScope,
			exactMatch: z.boolean().optional().nullable(),
			attributes: z.record(z.string(), z.string().array().nullable()).nullable().optional(),
			metadata: metadataInput,
			variantAxes: z.record(z.string(), z.string().max(200).array().max(100).nullable()).nullable().optional(),
			sort: z.enum(['relevance', 'name', 'newest']).optional().nullable(),
			collapseVariants: z.boolean().optional(),
			// Picking an image inside the page editor is not a library search.
			silent: z.boolean().optional(),
		}))
		.query(async ({ input, ctx }) => {
			const context = await loadSearchContext(input)
			const query = applySearchOrder(onePerFile(buildSearchQuery(ctx.user, input, context), buildSearchQuery(ctx.user, input, context), !!input.collapseVariants), input, context, input.sort)
			const range = input.page === 1 ? buildRangeQuery(ctx.user, input, context) : null

			const perPage = 300
			const [[results, total], facets, [rangeResults, rangeTotal]] = await Promise.all([
				query.offset(Math.max((input.page - 1) * perPage, 0)).limit(perPage).getManyAndCount(),
				searchFacets(ctx.user, input, context),
				range ? range.limit(RANGE_RESULTS).getManyAndCount() : Promise.resolve([[], 0] as [CollectionFile[], number]),
			])
			const totalPages = Math.ceil(total / perPage)
			const searchTerm = input.query?.trim().toLowerCase()
			if (searchTerm && input.page === 1 && !input.silent) {
				await dataSource.query(`
					INSERT INTO activity_events (user_id, type, collection_id, metadata)
					SELECT $1, 'search', $2, $3::jsonb
					WHERE NOT EXISTS (
						SELECT 1 FROM activity_events
						WHERE user_id = $1 AND type = 'search' AND metadata ->> 'query' = $4 AND created_at > now() - interval '1 minute'
					)
				`, [ctx.user.id, ['current', 'current_with_sub'].includes(input.searchScope ?? '') ? input.collectionId : null, JSON.stringify({ query: searchTerm, total }), searchTerm])
			}
			const recordAttributes = await dataSource.getRepository(RecordAttribute).find()
			const metadata = await loadViewableMetadata([...results, ...rangeResults].map((file) => file.assetFileId))
			const variantGroups = input.collapseVariants ? await loadVariantGroups(ctx.user, results.map((file) => file.assetFileId)) : undefined

			return {
				total,
				page: input.page,
				totalPages,
				previousPage: input.page > 1 ? input.page - 1 : null,
				nextPage: totalPages > input.page ? input.page + 1 : null,
				facets,
				results: await Promise.all(results.map(file => formatCollectionFile({ file, recordAttributes, metadata, variantGroups }))),
				rangeResults: await Promise.all(rangeResults.map(file => formatCollectionFile({ file, recordAttributes, metadata }))),
				rangeTotal,
			}
		}),
	rangeSearch: publicProcedure
		.use(authMiddleware(userApproved))
		.input(z.object({
			page: z.number().int().min(1).default(1),
			query: z.string().min(1).max(2000),
			collectionId: z.uuid().nullable().optional(),
			assetTypes: z.uuid().array().optional().nullable(),
			fileTypes: z.string().array().optional().nullable(),
			extensions: z.string().max(20).array().max(50).optional().nullable(),
			minSize: z.number().int().min(0).max(1e15).optional().nullable(),
			maxSize: z.number().int().min(0).max(1e15).optional().nullable(),
			searchScope: searchScope,
			exactMatch: z.boolean().optional().nullable(),
			attributes: z.record(z.string(), z.string().array().nullable()).nullable().optional(),
			metadata: metadataInput,
			variantAxes: z.record(z.string(), z.string().max(200).array().max(100).nullable()).nullable().optional(),
		}))
		.query(async ({ input, ctx }) => {
			const context = await loadSearchContext(input)
			const perPage = 300
			const [results, total] = await buildRangeQuery(ctx.user, input, context)!
				.offset((input.page - 1) * perPage).limit(perPage).getManyAndCount()
			const recordAttributes = await dataSource.getRepository(RecordAttribute).find()
			const metadata = await loadViewableMetadata(results.map((file) => file.assetFileId))
			const totalPages = Math.ceil(total / perPage)
			return {
				total,
				page: input.page,
				totalPages,
				nextPage: totalPages > input.page ? input.page + 1 : null,
				results: await Promise.all(results.map(file => formatCollectionFile({ file, recordAttributes, metadata }))),
			}
		}),
	searchNotFound: publicProcedure
		.use(authMiddleware(userApproved))
		.input(z.object({
			query: z.string().max(200).array().max(300),
			collectionId: z.uuid().nullable().optional(),
			assetTypes: z.uuid().array().optional().nullable(),
			recordViews: z.string().array().optional().nullable(),
			fileTypes: z.string().array().optional().nullable(),
			extensions: z.string().max(20).array().max(50).optional().nullable(),
			minSize: z.number().int().min(0).max(1e15).optional().nullable(),
			maxSize: z.number().int().min(0).max(1e15).optional().nullable(),
			searchScope: searchScope,
		}))
		.query(async ({ input, ctx }) => {
			// A term counts as found when a visible file name or a searchable attribute contains it.
			const scope = { ...input, query: null, attributes: null }
			const context = await loadSearchContext(scope)
			const visible = buildSearchQuery(ctx.user, scope, context).select('asset_file.name', 'name')
			context.searchableAttributes.forEach((_, index) => visible.addSelect(`record.meta_data -> :attribute${index}`, `attr${index}`))
			const [sql, parameters] = visible.getQueryAndParameters()
			const shifted = sql.replace(/\$(\d+)/g, (_, n) => `$${Number(n) + 1}`)
			const columns = ['visible.name', ...context.searchableAttributes.map((_, index) => `visible."attr${index}"`)]
			const result = await dataSource.query(`
				SELECT tag FROM unnest($1::text[]) AS terms(tag)
				WHERE NOT EXISTS (SELECT 1 FROM (${shifted}) AS visible WHERE ${columns.map((column) => `${column} ILIKE '%' || tag || '%'`).join(' OR ')})
			`, [input.query, ...parameters])
			return result.map((row) => row.tag) as string[]
		}),
	findById: publicProcedure
		.use(authMiddleware(userApproved))
		.input(z.uuid())
		.query(async ({ input, ctx }) => {
			const collection = await userCollectionsQuery(ctx.user)
				.setFindOptions({
					where: { id: input },
					relations: {
						invitations: true,
						page: {
							blocks: true,
						},
					},
				})
				.getOne()
			if (!collection) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Collection not found.' })
			}

			const userVisibleCollections = await userCollectionsQuery(ctx.user).getMany()
			await dataSource.getTreeRepository(Collection).findAncestorsTree(collection)
			collection.children = await userCollectionsQuery(ctx.user).leftJoinAndSelect('collection.page', 'page').andWhere({ parentId: collection.id }).getMany()
			collection.files = await userCollectionFilesQuery(ctx.user).andWhere({ collectionId: collection.id }).getMany()

			const sampleFileIds = collection.children.flatMap(child => child.sampleFileIds)
			const sampleFiles = sampleFileIds.length
				? await userCollectionFilesQuery(ctx.user).andWhere({ id: In(sampleFileIds) }).getMany()
				: []

			const recordAttributes = await dataSource.getRepository(RecordAttribute).find()
			const metadata = await loadViewableMetadata(collection.files.map((file) => file.assetFileId))
			return {
				...await formatCollection({
					collection,
					user: ctx.user,
					userVisibleCollections,
					recordAttributes,
					metadata,
					sampleFiles,
				}),
				...await formatActionBar(collection, ctx.user),
			}
		}),
	lastAddedFiles: publicProcedure
		.use(authMiddleware(userApproved))
		.input(z.object({
			collectionId: z.uuid().nullable().optional(),
		}))
		.query(async ({ input, ctx }) => {
			let filesQuery = userCollectionFilesQuery(ctx.user)
				.orderBy('collection_file.created_at', 'DESC')
				.limit(10)
			if (input.collectionId) {
				filesQuery = filesQuery.andWhere(
					":collectionId = ANY(string_to_array(collection.mpath, '.'))",
					{ collectionId: input.collectionId },
				)
			} else {
				filesQuery = filesQuery.andWhere('collection.draft IS FALSE AND collection.public IS TRUE')
			}

			const files = await filesQuery.getMany()
			const recordAttributes = await dataSource.getRepository(RecordAttribute).find()
			const metadata = await loadViewableMetadata(files.map((file) => file.assetFileId))
			return Promise.all(files.map((file) => formatCollectionFile({ file, recordAttributes, metadata })))
		}),
	create: publicProcedure
		.use(authMiddleware(userApproved))
		.input(
			z.object({
				name: z.string().min(1).max(80),
				description: z.string().max(255).optional(),
				public: z.boolean().optional(),
				draft: z.boolean().optional(),
				parentId: z.uuid().optional(),
				catalogueMode: z.enum(CATALOGUE_MODES).optional(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			const collection = new Collection()
			collection.name = input.name
			collection.description = input.description ?? null
			collection.catalogueMode = input.catalogueMode ?? 'files'
			if (input.parentId) {
				collection.parent = await dataSource.getRepository(Collection).findOneBy(
					ctx.user.role !== UserRole.ADMIN ? { id: input.parentId, ownerId: ctx.user.id } : { id: input.parentId },
				)
			}
			collection.public = collection.parent?.public ?? input.public ?? false
			collection.draft = collection.parent?.draft ?? input.draft ?? false
			if (ctx.user.role !== UserRole.ADMIN) {
				collection.public = false
				collection.draft = false
			}
			collection.owner = collection.public ? null : ctx.user
			await assertNameFree(collection.parent?.id, collection.name)
			await dataSource.transaction(async (em) => {
				await em.getRepository(Collection).save(collection)
				await syncCollectionMenuItems(em, collection)
				if (collection.catalogueMode !== 'files') {
					await createCataloguePage(em, collection)
				}
			})
			return formatCollection({ collection, user: ctx.user })
		}),
	createFromAsset: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(
			z.object({
				assetFolderId: z.uuid(),
				description: z.string().max(255).optional(),
				public: z.boolean().optional(),
				draft: z.boolean().optional(),
				parentId: z.uuid().optional(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			const assetFolder = await dataSource.getRepository(AssetFolder).findOneBy({ id: input.assetFolderId })
			if (!assetFolder) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Asset folder not found.' })
			}

			const collection = new Collection()
			collection.name = assetFolder.name
			collection.description = input.description ?? null
			collection.assetFolder = assetFolder
			if (input.parentId) {
				collection.parent = await dataSource.getRepository(Collection).findOneBy(
					ctx.user.role !== UserRole.ADMIN ? { id: input.parentId, ownerId: ctx.user.id } : { id: input.parentId },
				)
				if (collection.parent?.synchronized) {
					throw new TRPCError({ code: 'BAD_REQUEST', message: 'The subfolders of a synchronized collection are linked by the synchronization.' })
				}
			}
			collection.public = collection.parent?.public ?? input.public ?? false
			collection.draft = collection.parent?.draft ?? input.draft ?? false
			collection.owner = collection.public ? null : ctx.user
			await dataSource.transaction(async (em) => {
				await em.getRepository(Collection).save(collection)
				await collectionSynchronizationQueue.push({ collectionId: collection.id })
			})
			return formatCollection({ collection, user: ctx.user })
		}),
	addItems: publicProcedure
		.use(authMiddleware(userApproved))
		.input(
			z.object({
				id: z.uuid(),
				items: z.array(z.object({
					id: z.uuid(),
					type: z.union([z.literal('collection'), z.literal('file'), z.literal('record')]),
				}))
			}),
		)
		.mutation(async ({ input, ctx }) => {
			const collection = await userCollectionsQuery(ctx.user).andWhere('collection.id = :id', { id: input.id }).getOne()
			if (!collection) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Collection not found.' })
			} else if (collection.assetFolderId) {
				throw new TRPCError({ code: 'BAD_REQUEST', message: 'Synchronized folders cannot be changed.' })
			} else if (!collection.canEdit(ctx.user)) {
				throw new TRPCError({ code: 'FORBIDDEN', message: 'This collection cannot be edited.' })
			}

			await dataSource.transaction(async (em) => {
				const collectionsToDuplicate = await userCollectionsQuery(ctx.user)
					.andWhereInIds(input.items.filter(v => v.type === 'collection').map(v => v.id))
					.getMany()
				for (const item of collectionsToDuplicate) {
					await duplicateCollection({ em, source: item, destination: collection, user: ctx.user })
				}

				const filesToDuplicate = await userCollectionFilesQuery(ctx.user)
					.andWhereInIds(input.items.filter(v => v.type === 'file').map(v => v.id))
					.getMany()
				await duplicateFiles({ em, files: filesToDuplicate, destination: collection })

				// A product joins the collection only when the reader can
				// already see it somewhere else.
				const recordIds = input.items.filter(v => v.type === 'record').map(v => v.id)
				if (recordIds.length) {
					const rows = await pickableRecords(em, ctx.user, 'id', recordIds)
					await addRecords(em, collection.id, rows.map((row) => row.id))
					if (collection.catalogueMode === 'files') {
						await em.getRepository(Collection).update(collection.id, {
							catalogueMode: collection.numberOfFiles > 0 ? 'both' : 'products',
						})
					}
				}
			})
		}),
	rename: publicProcedure
		.use(authMiddleware(userApproved))
		.input(z.object({ id: z.uuid(), name: z.string().trim().min(1).max(80) }))
		.mutation(async ({ input, ctx }) => {
			const collection = await userCollectionsQuery(ctx.user).andWhere('collection.id = :id', { id: input.id }).getOne()
			if (!collection) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Collection not found.' })
			}
			if (!collection.canEdit(ctx.user)) {
				throw new TRPCError({ code: 'FORBIDDEN', message: 'This collection cannot be edited.' })
			}
			if (collection.synchronized) {
				throw new TRPCError({ code: 'BAD_REQUEST', message: 'Rename synchronized collections in your cloud storage.' })
			}
			await assertNameFree(collection.parentId, input.name, collection.id)
			await dataSource.getRepository(Collection).update(collection.id, { name: input.name })
			collection.name = input.name
			return formatCollection({ collection, user: ctx.user })
		}),
	update: publicProcedure
		.use(authMiddleware(userApproved))
		.input(
			z.object({
				id: z.uuid(),
				name: z.string().min(1).max(80),
				description: z.string().max(255).optional().nullable(),
				public: z.boolean().optional(),
				draft: z.boolean().optional(),
				hasThumbnail: z.boolean().optional(),
				limitedToGroupIds: z.string().array().optional(),
				actionBar: actionBarSettings.nullable().optional(),
				resetDescendantActionBars: z.boolean().optional(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			const collection = await userCollectionsQuery(ctx.user).andWhere('collection.id = :id', { id: input.id }).getOne()
			if (!collection) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Collection not found.' })
			} else if (!collection.canEdit(ctx.user)) {
				throw new TRPCError({ code: 'FORBIDDEN', message: 'This collection cannot be edited.' })
			}

			if (input.public !== undefined && input.public !== collection.public) {
				throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot change the public status of a collection.' })
			}
			if (!collection.synchronized) {
				await assertNameFree(collection.parentId, input.name, collection.id)
			}

			collection.name = input.name
			collection.description = input.description ?? null
			collection.draft = input.draft ?? false
			collection.hasThumbnail = input.hasThumbnail ?? collection.hasThumbnail
			if (!collection.public && !collection.ownerId) {
				collection.ownerId = ctx.user.id
			}
			if (collection.canEditLimitedToGroupIds && input.limitedToGroupIds !== undefined) {
				collection.limitedToGroupIds = input.limitedToGroupIds
			}
			if (input.actionBar !== undefined) {
				collection.actionBar = input.actionBar
			}

			await dataSource.transaction(async (em) => {
				await em.getRepository(Collection).save(collection)
				if (input.resetDescendantActionBars) {
					await resetDescendantActionBars(em, collection)
				}
				const children = await em.getTreeRepository(Collection).findDescendants(collection)
				await em.getRepository(Collection).update({
					id: In(children.map((child) => child.id).filter((childId) => childId !== collection.id)),
				}, {
					draft: collection.draft,
					ownerId: collection.ownerId,
					limitedToGroupIds: collection.limitedToGroupIds,
					canEditLimitedToGroupIds: collection.limitedToGroupIds.length === 0,
				})
				await syncCollectionMenuItems(em, collection, true)
				if (!collection.hasThumbnail) {
					await mainS3().removeObjects(mainS3Bucket(), [collection.thumbnailStorageKey])
				}
			})
			return {
				...await formatCollection({ collection, user: ctx.user }),
				...await formatActionBar(collection, ctx.user),
			}
		}),
	// Whom an editor can name in the action bar settings. Owners are often
	// members, who cannot list groups or users anywhere else.
	actionBarAudience: publicProcedure
		.use(authMiddleware(userApproved))
		.input(z.uuid())
		.query(async ({ input, ctx }) => {
			const collection = await userCollectionsQuery(ctx.user).andWhere('collection.id = :id', { id: input }).getOne()
			if (!collection) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Collection not found.' })
			} else if (!collection.canEdit(ctx.user)) {
				throw new TRPCError({ code: 'FORBIDDEN', message: 'This collection cannot be edited.' })
			}
			const [groups, users] = await Promise.all([
				dataSource.getRepository(Group).find({ order: { name: 'ASC' } }),
				dataSource.getRepository(User).find({
					where: ctx.user.role === UserRole.ADMIN ? { approved: true } : { approved: true, regionId: ctx.user.regionId },
					select: { id: true, name: true, email: true },
					order: { name: 'ASC' },
				}),
			])
			return {
				groups: groups.map((group) => ({ id: group.id, name: group.name })),
				users: users.map((user) => ({ id: user.id, name: user.name, email: user.email })),
			}
		}),
	presignedThumbnailUploadUrl: publicProcedure
		.use(authMiddleware(userApproved))
		.input(z.object({
			id: z.uuid(),
		}))
		.query(async ({ input, ctx }) => {
			const collection = await userCollectionsQuery(ctx.user).andWhere('collection.id = :id', { id: input.id }).getOne()
			if (!collection) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Collection not found.' })
			} else if (!collection.canEdit(ctx.user)) {
				throw new TRPCError({ code: 'FORBIDDEN', message: 'This collection cannot be edited.' })
			}
			return mainS3().presignedPutObject(mainS3Bucket(), collection.thumbnailStorageKey, 24 * 60 * 60)
		}),
	removeRecords: publicProcedure
		.use(authMiddleware(userApproved))
		.input(z.object({ id: z.uuid(), recordIds: z.uuid().array().min(1).max(500) }))
		.mutation(async ({ input, ctx }) => {
			const collection = await userCollectionsQuery(ctx.user).andWhere('collection.id = :id', { id: input.id }).getOne()
			if (!collection) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Collection not found.' })
			} else if (!collection.canEdit(ctx.user)) {
				throw new TRPCError({ code: 'FORBIDDEN', message: 'This collection cannot be edited.' })
			}
			return dataSource.transaction((em) => removeRecords(em, collection.id, input.recordIds))
		}),
	// A catalogue is usually assembled from a reference list held somewhere
	// else, a buying sheet or an export. The keys that match nothing come back
	// so the list can be corrected rather than silently shortened.
	addRecordsByKey: publicProcedure
		.use(authMiddleware(userApproved))
		.input(z.object({ id: z.uuid(), keys: z.string().min(1).max(200).array().min(1).max(5000) }))
		.mutation(async ({ input, ctx }) => {
			const collection = await userCollectionsQuery(ctx.user).andWhere('collection.id = :id', { id: input.id }).getOne()
			if (!collection) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Collection not found.' })
			} else if (!collection.canEdit(ctx.user)) {
				throw new TRPCError({ code: 'FORBIDDEN', message: 'This collection cannot be edited.' })
			}
			const wanted = [...new Set(input.keys.map((key) => key.trim().toLowerCase()).filter(Boolean))]
			return await dataSource.transaction(async (em) => {
				const found = await pickableRecords(em, ctx.user, 'key', wanted)
				const added = await addRecords(em, collection.id, found.map((row) => row.id))
				if (found.length && collection.catalogueMode === 'files') {
					await em.getRepository(Collection).update(collection.id, {
						catalogueMode: collection.numberOfFiles > 0 ? 'both' : 'products',
					})
				}
				const matched = new Set(found.map((row) => row.recordKey.trim().toLowerCase()))
				return { added, matched: found.length, unmatched: wanted.filter((key) => !matched.has(key)) }
			})
		}),
	// The membership as its builder sees it, the products taken out of the
	// catalogue included. Only whoever may edit the collection reads this: it
	// carries the score, which is production information, not reader material.
	recordPreview: publicProcedure
		.use(authMiddleware(userApproved))
		.input(z.object({ id: z.uuid(), offset: z.number().int().min(0), limit: z.number().int().min(1).max(200) }))
		.query(async ({ input, ctx }) => {
			const collection = await userCollectionsQuery(ctx.user).andWhere('collection.id = :id', { id: input.id }).getOne()
			if (!collection) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Collection not found.' })
			} else if (!collection.canEdit(ctx.user)) {
				throw new TRPCError({ code: 'FORBIDDEN', message: 'This collection cannot be edited.' })
			}
			return collectionRecordPreview(dataSource.manager, collection.id, { offset: input.offset, limit: input.limit })
		}),
	// Taking a product out of the catalogue keeps its row: a rule would put it
	// back at the next pass, and the builder would lose the decision.
	setRecordsExcluded: publicProcedure
		.use(authMiddleware(userApproved))
		.input(z.object({ id: z.uuid(), recordIds: z.uuid().array().min(1).max(500), excluded: z.boolean() }))
		.mutation(async ({ input, ctx }) => {
			const collection = await userCollectionsQuery(ctx.user).andWhere('collection.id = :id', { id: input.id }).getOne()
			if (!collection) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Collection not found.' })
			} else if (!collection.canEdit(ctx.user)) {
				throw new TRPCError({ code: 'FORBIDDEN', message: 'This collection cannot be edited.' })
			}
			return dataSource.transaction((em) => setRecordsExcluded(em, collection.id, input.recordIds, input.excluded))
		}),
	excludeNotReadyRecords: publicProcedure
		.use(authMiddleware(userApproved))
		.input(z.object({ id: z.uuid() }))
		.mutation(async ({ input, ctx }) => {
			const collection = await userCollectionsQuery(ctx.user).andWhere('collection.id = :id', { id: input.id }).getOne()
			if (!collection) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Collection not found.' })
			} else if (!collection.canEdit(ctx.user)) {
				throw new TRPCError({ code: 'FORBIDDEN', message: 'This collection cannot be edited.' })
			}
			return dataSource.transaction((em) => excludeNotReadyRecords(em, collection.id))
		}),
	// The rules of a collection driven by filters. Saving them rewrites the
	// membership straight away; products picked by hand are left alone.
	setRecordRules: publicProcedure
		.use(authMiddleware(userApproved))
		.input(z.object({
			id: z.uuid(),
			catalogueMode: z.enum(CATALOGUE_MODES).optional(),
			recordTableId: z.uuid().nullable().optional(),
			recordFilters: z.array(z.object({
				column: z.string().min(1),
				op: z.enum(['contains', 'is', 'is_not', 'is_empty', 'is_not_empty', 'has_any']),
				value: z.string().optional(),
				values: z.string().array().optional(),
			})).max(10).nullable().optional(),
			includesAllRecords: z.boolean().optional(),
		}))
		.mutation(async ({ input, ctx }) => {
			const collection = await userCollectionsQuery(ctx.user).andWhere('collection.id = :id', { id: input.id }).getOne()
			if (!collection) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Collection not found.' })
			} else if (!collection.canEdit(ctx.user)) {
				throw new TRPCError({ code: 'FORBIDDEN', message: 'This collection cannot be edited.' })
			}
			// Rules and the whole-catalogue switch are administrator matters:
			// both fill a collection without looking at what the caller may
			// see, so anyone else would read the catalogue through their own
			// collection. Everybody else picks products by hand, which is
			// checked against their own visibility in addItems.
			const writesMembership = input.includesAllRecords !== undefined
				|| input.recordFilters !== undefined
				|| input.recordTableId !== undefined
			if (writesMembership && ctx.user.role !== UserRole.ADMIN) {
				throw new TRPCError({ code: 'FORBIDDEN', message: 'Only an administrator sets the rules of a collection.' })
			}
			await dataSource.transaction(async (em) => {
				await em.getRepository(Collection).update(collection.id, {
					...(input.catalogueMode !== undefined ? { catalogueMode: input.catalogueMode } : {}),
					...(input.recordTableId !== undefined ? { recordTableId: input.recordTableId } : {}),
					...(input.recordFilters !== undefined ? { recordFilters: input.recordFilters } : {}),
					...(input.includesAllRecords !== undefined ? { includesAllRecords: input.includesAllRecords } : {}),
				})
				const updated = await em.getRepository(Collection).findOneByOrFail({ id: collection.id })
				// Turning a collection into a catalogue gives it the page that
				// draws the products, so it stops opening on an empty layout.
				if (updated.catalogueMode !== 'files') {
					await createCataloguePage(em, updated)
				}
				await refreshDynamicCollection(em, updated)
			})
			const saved = await userCollectionsQuery(ctx.user).andWhere('collection.id = :id', { id: input.id }).getOneOrFail()
			return formatCollection({ collection: saved, user: ctx.user })
		}),
	removeFiles: publicProcedure
		.use(authMiddleware(userApproved))
		.input(z.uuid().array())
		.mutation(async ({ input, ctx }) => {
			const collectionFiles = await userCollectionFilesQuery(ctx.user)
				.andWhere('collection_file.id IN (:...input)', { input })
				.getMany()
			if (collectionFiles.length !== input.length) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'File not found.' })
			} else if (collectionFiles.some(file => file.collection?.synchronized)) {
				throw new TRPCError({ code: 'BAD_REQUEST', message: 'Files of a synchronized collection cannot be deleted.' })
			} else if (!collectionFiles.every(file => file.collection?.canEdit(ctx.user))) {
				throw new TRPCError({ code: 'FORBIDDEN', message: 'This collection cannot be edited.' })
			}

			await dataSource.getRepository(CollectionFile).remove(collectionFiles)
		}),
	remove: publicProcedure
		.use(authMiddleware(userApproved))
		.input(z.uuid())
		.mutation(async ({ input, ctx }) => {
			const collection = await userCollectionsQuery(ctx.user)
				.andWhere('collection.id = :id', { id: input })
				.leftJoinAndMapOne('collection.parent', 'collection.parent', 'parent', 'parent.id = collection.parent_id')
				.getOne()
			if (!collection) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Collection not found.' })
			} else if (collection.synchronized && collection.parent?.synchronized && !collection.orphanedAt) {
				throw new TRPCError({ code: 'BAD_REQUEST', message: 'Synchronized collections cannot be deleted.' })
			} else if (!collection.canEdit(ctx.user)) {
				throw new TRPCError({ code: 'FORBIDDEN', message: 'This collection cannot be edited.' })
			}

			const cleanup = await dataSource.transaction((em) => removeCollections(em, [collection.id]))
			await cleanup()
		}),
	move: publicProcedure
		.use(authMiddleware(userApproved))
		.input(z.object({ id: z.uuid(), parentId: z.uuid().nullable() }))
		.mutation(async ({ input, ctx }) => {
			const collection = await userCollectionsQuery(ctx.user)
				.andWhere('collection.id = :id', { id: input.id })
				.leftJoinAndMapOne('collection.parent', 'collection.parent', 'parent', 'parent.id = collection.parent_id')
				.getOne()
			if (!collection) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Collection not found.' })
			} else if (!collection.canEdit(ctx.user)) {
				throw new TRPCError({ code: 'FORBIDDEN', message: 'This collection cannot be edited.' })
			} else if (collection.synchronized && collection.parent?.synchronized) {
				throw new TRPCError({ code: 'BAD_REQUEST', message: 'Move the folder in your cloud storage to move this collection.' })
			}

			const parent = input.parentId
				? await dataSource.getRepository(Collection).findOneBy(
					ctx.user.role !== UserRole.ADMIN ? { id: input.parentId, ownerId: ctx.user.id } : { id: input.parentId },
				)
				: null
			if (input.parentId && !parent) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Destination collection not found.' })
			} else if (parent && parent.public !== collection.public) {
				throw new TRPCError({ code: 'BAD_REQUEST', message: 'A collection cannot move between the catalogue and private collections.' })
			} else if (parent?.path?.startsWith(collection.path ?? '')) {
				throw new TRPCError({ code: 'BAD_REQUEST', message: 'A collection cannot be moved inside itself.' })
			}
			if (parent?.id !== collection.parentId) {
				await assertNameFree(parent?.id, collection.name, collection.id)
				await dataSource.transaction((em) => moveCollection(em, collection, parent))
			}
			return formatCollection({ collection, user: ctx.user })
		}),
	listOrphaned: publicProcedure
		.use(authMiddleware(userAdmin))
		.query(async ({ ctx }) => {
			const collections = await dataSource.getRepository(Collection).find({
				where: { orphanedAt: Not(IsNull()) },
				order: { orphanedAt: 'DESC' },
			})
			return Promise.all(collections.map((collection) => formatCollection({ collection, user: ctx.user })))
		}),
	dismissOrphan: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(z.uuid())
		.mutation(async ({ input }) => {
			const collection = await dataSource.getRepository(Collection).findOneBy({ id: input })
			if (!collection) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Collection not found.' })
			} else if (collection.synchronized) {
				throw new TRPCError({ code: 'BAD_REQUEST', message: 'Delete this collection, or move its folder back where it is mirrored.' })
			}
			await dataSource.getRepository(Collection).update(collection.id, { orphanedAt: null, orphanedReason: null, orphanedFromName: null })
		}),
	getFiles: publicProcedure
		.use(authMiddleware(userApproved))
		.input(
			z.object({
				items: z.array(z.object({
					id: z.uuid(),
					type: z.union([z.literal('collection'), z.literal('file'), z.literal('record')]),
				}))
			}),
		)
		.mutation(async ({ input, ctx }) => {
			const collections: Collection[] = []
			for (const value of input.items.filter((v) => v.type === 'collection')) {
				const found = await userCollectionsQuery(ctx.user)
					.andWhere({ path: ILike(`%${value.id}.%`) })
					.getMany()
				collections.push(...found)
			}
			const collectionFiles = await userCollectionFilesQuery(ctx.user)
				.andWhere(new Brackets((q) => q
					.where({ id: In(input.items.filter((v) => v.type === 'file').map((v) => v.id)) })
					.orWhere({ collectionId: In(collections.map((c) => c.id)) })
				))
				.getMany()
			const licenses = Object.values(
				collectionFiles.reduce((licenses, file) => {
					if (file.assetFile.license) {
						licenses[file.assetFile.license.id] = file.assetFile.license
					}
					return licenses
				}, {})
			)
			const recordAttributes = await dataSource.getRepository(RecordAttribute).find()

			return {
				files: await Promise.all(collectionFiles.map(file => formatCollectionFile({ file, recordAttributes }))),
				licenses: await Promise.all(licenses.map(formatLicense)),
				allowDirectDownload:
					collectionFiles.reduce((total, file) => total + parseInt(file.assetFile.size, 10), 0) <= 2_000_000_000, // 2GB
			}
		}),
	ListPrivateCollections: publicProcedure
		.use(authMiddleware(userApproved))
		.query(async ({ ctx }) => {
			const collections = await userCollectionsQuery(ctx.user)
				.andWhere('collection.public IS FALSE', { public: false })
				.andWhere('collection.owner_id = :userId', { userId: ctx.user.id })
				.getMany()
			return buildTree({ collections, user: ctx.user })
		}),
	createUserCollection: publicProcedure
		.use(authMiddleware(userApproved))
		.input(
			z.object({
				name: z.string().min(1).max(80),
				description: z.string().max(255).optional(),
				parentId: z.uuid().optional(),
				catalogueMode: z.enum(CATALOGUE_MODES).optional(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			const collection = new Collection()
			collection.name = input.name
			collection.description = input.description ?? null
			collection.catalogueMode = input.catalogueMode ?? 'files'
			if (input.parentId) {
				collection.parent = await dataSource.getRepository(Collection).findOneBy({
					id: input.parentId,
					ownerId: ctx.user.id,
				})
			}
			collection.public = false
			collection.draft = false
			collection.owner = ctx.user
			await assertNameFree(collection.parent?.id, collection.name)
			await dataSource.transaction(async (em) => {
				await em.getRepository(Collection).save(collection)
				await syncCollectionMenuItems(em, collection)
				if (collection.catalogueMode !== 'files') {
					await createCataloguePage(em, collection)
				}
			})
			return formatCollection({ collection, user: ctx.user })
		}),
})
