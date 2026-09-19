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
import { Brackets, ILike, In } from "typeorm"
import { z } from "zod"
import { AssetFolder } from "../../entity/asset-folder"
import { Collection } from "../../entity/collection"
import { CollectionFile } from "../../entity/collection-file"
import { ProductAttribute } from "../../entity/product-attribute"
import { User, UserRole } from "../../entity/user"
import { assetsS3, assetsS3Bucket, dataSource, mainS3, mainS3Bucket } from "../../env"
import {
	duplicateCollection,
	duplicateFiles,
	removeCollection,
	syncCollectionMenuItems,
	userCollectionFilesQuery,
	userCollectionsQuery
} from "../../services/collection"
import { applySearchOrder, buildSearchQuery, loadSearchContext, searchFacets } from "../../services/search"
import { collectionSynchronizationQueue } from "../../worker"
import { authMiddleware, publicProcedure, router, userAdmin, userApproved } from "../index"
import invitationRouter, { formatInvitation } from "./collection/invitation"
import { formatLicense } from "./license"
import { formatPage } from "./page"

export type FormatCollectionOptions = {
	collection: Collection,
	user?: User,
	userVisibleCollections?: Collection[],
	productAttributes?: ProductAttribute[],
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
		synchronized: collection.synchronized,
		ownerId: collection.ownerId,
		children: collection.children?.length
			? await Promise.all(collection.children.map((child) => formatCollection({ collection: child, ...opts })))
			: undefined,
		files: collection.files?.length
			? await Promise.all(collection.files.map(file => formatCollectionFile({
				file,
				productAttributes: opts.productAttributes,
			})))
			: undefined,
		page: collection.page ? await formatPage(collection.page) : null,
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
	productAttributes?: ProductAttribute[],
}

export async function formatCollectionFile({ file, productAttributes }: FormatCollectionFileOptions) {
	const attributes = productAttributes
		? Object
			.entries(file.assetFile.product?.metaData ?? {})
			.map(([key, value]) => {
				const productAttribute = productAttributes.find(v => v.viewable && v.name === key)
				return productAttribute ? {
					id: productAttribute.id,
					name: productAttribute.name,
					displayName: productAttribute.displayName,
					value,
				} : null
			})
			.filter(v => v)
		: null

	return {
		id: file.id,
		name: file.assetFile.name,
		mimeType: file.assetFile.mimeType,
		assetTypeId: file.assetFile.assetTypeId,
		product: file.assetFile.product ? { id: file.assetFile.product.id, attributes } : null,
		assetType: file.assetFile.assetType ? {
			...file.assetFile.assetType,
			productAttributes: productAttributes
				?.filter(attribute => attribute.viewable)
				.map(attribute => ({
					id: attribute.id,
					name: attribute.name,
					displayName: attribute.displayName,
				})) ?? [],
		} : null,
		productView: file.assetFile.productView,
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

const searchScope = z.enum(['all', 'current', 'current_with_sub']).optional().nullable()

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
			collectionId: z.string().uuid().nullable().optional(),
			assetTypes: z.string().uuid().array().optional().nullable(),
			productViews: z.string().array().optional().nullable(),
			fileTypes: z.string().array().optional().nullable(),
			searchScope: searchScope,
			exactMatch: z.boolean().optional().nullable(),
			attributes: z.record(z.string().array().nullable()).nullable().optional(),
			sort: z.enum(['relevance', 'name', 'newest']).optional().nullable(),
		}))
		.query(async ({ input, ctx }) => {
			const context = await loadSearchContext(input)
			const query = applySearchOrder(buildSearchQuery(ctx.user, input, context), input, context, input.sort)

			const perPage = 300
			const [[results, total], facets] = await Promise.all([
				query.offset(Math.max((input.page - 1) * perPage, 0)).limit(perPage).getManyAndCount(),
				searchFacets(ctx.user, input, context),
			])
			const totalPages = Math.ceil(total / perPage)
			const searchTerm = input.query?.trim().toLowerCase()
			if (searchTerm && input.page === 1) {
				await dataSource.query(`
					INSERT INTO activity_events (user_id, type, collection_id, metadata)
					SELECT $1, 'search', $2, $3::jsonb
					WHERE NOT EXISTS (
						SELECT 1 FROM activity_events
						WHERE user_id = $1 AND type = 'search' AND metadata ->> 'query' = $4 AND created_at > now() - interval '1 minute'
					)
				`, [ctx.user.id, ['current', 'current_with_sub'].includes(input.searchScope ?? '') ? input.collectionId : null, JSON.stringify({ query: searchTerm, total }), searchTerm])
			}
			const productAttributes = await dataSource.getRepository(ProductAttribute).find()

			return {
				total,
				page: input.page,
				totalPages,
				previousPage: input.page > 1 ? input.page - 1 : null,
				nextPage: totalPages > input.page ? input.page + 1 : null,
				facets,
				results: await Promise.all(results.map(file => formatCollectionFile({ file, productAttributes }))),
			}
		}),
	searchNotFound: publicProcedure
		.use(authMiddleware(userApproved))
		.input(z.object({
			query: z.string().max(200).array().max(300),
			collectionId: z.string().uuid().nullable().optional(),
			assetTypes: z.string().uuid().array().optional().nullable(),
			productViews: z.string().array().optional().nullable(),
			fileTypes: z.string().array().optional().nullable(),
			searchScope: searchScope,
		}))
		.query(async ({ input, ctx }) => {
			// A term counts as found when a visible file name or a searchable attribute contains it.
			const scope = { ...input, query: null, attributes: null }
			const context = await loadSearchContext(scope)
			const visible = buildSearchQuery(ctx.user, scope, context).select('asset_file.name', 'name')
			context.searchableAttributes.forEach((_, index) => visible.addSelect(`product.meta_data -> :attribute${index}`, `attr${index}`))
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
		.input(z.string().uuid())
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
			collection.children = await userCollectionsQuery(ctx.user).andWhere({ parentId: collection.id }).getMany()
			collection.files = await userCollectionFilesQuery(ctx.user).andWhere({ collectionId: collection.id }).getMany()

			const sampleFileIds = collection.children.flatMap(child => child.sampleFileIds)
			const sampleFiles = sampleFileIds.length
				? await userCollectionFilesQuery(ctx.user).andWhere({ id: In(sampleFileIds) }).getMany()
				: []

			const productAttributes = await dataSource.getRepository(ProductAttribute).find()
			return formatCollection({
				collection,
				user: ctx.user,
				userVisibleCollections,
				productAttributes,
				sampleFiles,
			})
		}),
	lastAddedFiles: publicProcedure
		.use(authMiddleware(userApproved))
		.input(z.object({
			collectionId: z.string().uuid().nullable().optional(),
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
			const productAttributes = await dataSource.getRepository(ProductAttribute).find()
			return Promise.all(files.map((file) => formatCollectionFile({ file, productAttributes })))
		}),
	create: publicProcedure
		.use(authMiddleware(userApproved))
		.input(
			z.object({
				name: z.string().min(1).max(80),
				description: z.string().max(255).optional(),
				public: z.boolean().optional(),
				draft: z.boolean().optional(),
				parentId: z.string().uuid().optional(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			const collection = new Collection()
			collection.name = input.name
			collection.description = input.description ?? null
			if (input.parentId) {
				collection.parent = await dataSource.getRepository(Collection).findOneBy({
					id: input.parentId,
					ownerId: ctx.user.role !== UserRole.ADMIN ? ctx.user.id : undefined,
				})
			}
			collection.public = collection.parent?.public ?? input.public ?? false
			collection.draft = collection.parent?.draft ?? input.draft ?? false
			if (ctx.user.role !== UserRole.ADMIN) {
				collection.public = false
				collection.draft = false
			}
			collection.owner = collection.public ? null : ctx.user
			await dataSource.transaction(async (em) => {
				await em.getRepository(Collection).save(collection)
				await syncCollectionMenuItems(em, collection)
			})
			return formatCollection({ collection, user: ctx.user })
		}),
	createFromAsset: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(
			z.object({
				assetFolderId: z.string().uuid(),
				description: z.string().max(255).optional(),
				public: z.boolean().optional(),
				draft: z.boolean().optional(),
				parentId: z.string().uuid().optional(),
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
				collection.parent = await dataSource.getRepository(Collection).findOneBy({
					id: input.parentId,
					ownerId: ctx.user.role !== UserRole.ADMIN ? ctx.user.id : undefined,
				})
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
				id: z.string().uuid(),
				items: z.array(z.object({
					id: z.string().uuid(),
					type: z.union([z.literal('collection'), z.literal('file')]),
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
			})
		}),
	update: publicProcedure
		.use(authMiddleware(userApproved))
		.input(
			z.object({
				id: z.string().uuid(),
				name: z.string().min(1).max(80),
				description: z.string().max(255).optional().nullable(),
				public: z.boolean().optional(),
				draft: z.boolean().optional(),
				hasThumbnail: z.boolean().optional(),
				limitedToGroupIds: z.string().array().optional(),
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

			await dataSource.transaction(async (em) => {
				await em.getRepository(Collection).save(collection)
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
			return formatCollection({ collection, user: ctx.user })
		}),
	presignedThumbnailUploadUrl: publicProcedure
		.use(authMiddleware(userApproved))
		.input(z.object({
			id: z.string().uuid(),
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
	removeFiles: publicProcedure
		.use(authMiddleware(userApproved))
		.input(z.string().uuid().array())
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
		.input(z.string().uuid())
		.mutation(async ({ input, ctx }) => {
			const collection = await userCollectionsQuery(ctx.user)
				.andWhere('collection.id = :id', { id: input })
				.leftJoinAndMapOne('collection.parent', 'collection.parent', 'parent', 'parent.id = collection.parent_id')
				.getOne()
			if (!collection) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Collection not found.' })
			} else if (collection.parent?.synchronized) {
				throw new TRPCError({ code: 'BAD_REQUEST', message: 'Synchronized collections cannot be deleted.' })
			} else if (!collection.canEdit(ctx.user)) {
				throw new TRPCError({ code: 'FORBIDDEN', message: 'This collection cannot be edited.' })
			}

			await dataSource.transaction((em) => removeCollection(em, collection.id))
		}),
	getFiles: publicProcedure
		.use(authMiddleware(userApproved))
		.input(
			z.object({
				items: z.array(z.object({
					id: z.string().uuid(),
					type: z.union([z.literal('collection'), z.literal('file')]),
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
			const productAttributes = await dataSource.getRepository(ProductAttribute).find()

			return {
				files: await Promise.all(collectionFiles.map(file => formatCollectionFile({ file, productAttributes }))),
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
				parentId: z.string().uuid().optional(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			const collection = new Collection()
			collection.name = input.name
			collection.description = input.description ?? null
			if (input.parentId) {
				collection.parent = await dataSource.getRepository(Collection).findOneBy({
					id: input.parentId,
					ownerId: ctx.user.id,
				})
			}
			collection.public = false
			collection.draft = false
			collection.owner = ctx.user
			await dataSource.transaction(async (em) => {
				await em.getRepository(Collection).save(collection)
				await syncCollectionMenuItems(em, collection)
			})
			return formatCollection({ collection, user: ctx.user })
		}),
})
