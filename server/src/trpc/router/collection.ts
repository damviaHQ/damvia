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
				.filter((file) => file)
				.map((file) => formatCollectionFile({ file }))
		),
		thumbnailURL: collection.hasThumbnail
			? await mainS3().presignedGetObject(mainS3Bucket(), collection.thumbnailStorageKey)
			: null,
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
		current.parent = parent
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
			allowedRegionIds: file.assetFile.license.allowedRegionIds,
			expired:
				new Date(file.assetFile.license.usageFrom).getTime() >= Date.now() &&
				new Date(file.assetFile.license.usageTo).getTime() <= Date.now(),
		} : null,
	}
}

export default router({
	invitation: invitationRouter,
	tree: publicProcedure
		.use(authMiddleware(userApproved))
		.query(async ({ ctx }) => {
			const collections = await userCollectionsQuery(ctx.user).getMany()
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
			page: z.number().default(1),
			query: z.string().nullable().optional(),
			collectionId: z.string().nullable().optional(),
			assetTypes: z.string().array().optional().nullable(),
			productViews: z.string().array().optional().nullable(),
			fileTypes: z.string().array().optional().nullable(),
			searchScope: z.string().optional().nullable(),
			exactMatch: z.boolean().optional().nullable(),
			attributes: z.record(z.string().array().nullable()).nullable().optional(),
		}))
		.query(async ({ input, ctx }) => {
			const searchableAttributes = await dataSource.getRepository(ProductAttribute).findBy({
				searchable: true
			})

			let query = userCollectionFilesQuery(ctx.user)
			if (input.query && input.exactMatch) {
				const queryParts = [
					'asset_file.name ILIKE :query',
					...searchableAttributes.map((attribute) => `product.meta_data['${attribute.name}'] ILIKE :query`),
				]
				query.andWhere(`(${queryParts.join(' OR ')})`, { query: `%${input.query}%` })
			} else if (input.query) {
				query.andWhere(new Brackets((baseQuery) =>
					input.query.replaceAll(/\s+/gm, ' ').split(' ').reduce((q, value, index) => {
						const queryKey = `query${index}`
						const where = index === 0 ? q.where : q.orWhere
						const queryParts = [
							`asset_file.name ILIKE :${queryKey}`,
							...searchableAttributes.map((attribute) => `product.meta_data['${attribute.name}'] ILIKE :${queryKey}`),
						]
						return where.call(q, `(${queryParts.join(' OR ')})`, { [queryKey]: `%${value}%` })
					}, baseQuery),
				))
			}

			if (input.assetTypes?.length) {
				query.andWhere('asset_file.asset_type_id IN (:...assetTypeIds)', { assetTypeIds: input.assetTypes })
			}

			if (input.productViews?.length) {
				query.andWhere('asset_file.product_view IN (:...productViews)', { productViews: input.productViews })
			}

			if (input.searchScope === 'current_with_sub') {
				query.andWhere('collection.mpath ILIKE :collectionPath', { collectionPath: `%${input.collectionId}.%` })
			} else if (input.searchScope === 'current' && input.collectionId) {
				query.andWhere('collection.id = :collectionId', { collectionId: input.collectionId })
			}

			const attributesKeys = Object.keys(input.attributes ?? {}).filter((key) => input.attributes[key].length > 0)
			if (attributesKeys.length) {
				const attributes = await dataSource.getRepository(ProductAttribute).findBy({
					id: In(attributesKeys),
				})
				query.andWhere(new Brackets((baseQuery) =>
					attributes.reduce((q, attribute, index) => {
						const attrKey = `attributekey${index}`
						const attrValue = `attributevalue${index}`
						const where = index === 0 ? q.where : q.orWhere
						return where.call(q, `product.meta_data[:${attrKey}] IN (:...${attrValue})`, {
							[attrKey]: attribute.name,
							[attrValue]: input.attributes[attribute.id],
						})
					}, baseQuery)
				))
			}

			if (input.productViews?.length || attributesKeys.length) {
				query.andWhere('asset_type.is_related_to_products IS TRUE')
			}

			if (input.fileTypes?.length) {
				const documentMimeTypes = [
					'application/msword', // .doc
					'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
					'application/pdf', // .pdf
					'application/vnd.ms-powerpoint', // .ppt
					'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
					'application/vnd.ms-excel', // .xls
					'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
				]
				const fileTypeQueries = {
					document: `asset_file.mime_type IN (${documentMimeTypes.map((type) => `'${type}'`).join(', ')})`,
					video: "asset_file.mime_type ILIKE 'video/%'",
					image: "asset_file.mime_type ILIKE 'image/%'",
				}
				const queries = input.fileTypes.map((type) => fileTypeQueries[type]).filter((q) => q)
				if (queries.length) {
					query.andWhere(`(${queries.join(' OR ')})`)
				}
			}

			const perPage = 300
			const [results, total] = await query.skip(Math.max((input.page - 1) * perPage, 0)).take(perPage).getManyAndCount()
			const totalPages = Math.ceil(total / perPage)
			const productAttributes = await dataSource.getRepository(ProductAttribute).find()

			return {
				total,
				page: input.page,
				totalPages,
				previousPage: input.page > 1 ? input.page - 1 : null,
				nextPage: totalPages > input.page ? input.page + 1 : null,
				results: await Promise.all(results.map(file => formatCollectionFile({ file, productAttributes }))),
			}
		}),
	searchNotFound: publicProcedure
		.use(authMiddleware(userApproved))
		.input(z.object({
			query: z.string().array(),
			collectionId: z.string().nullable().optional(),
			assetTypes: z.string().array().optional().nullable(),
			searchScope: z.string().optional().nullable(),
		}))
		.query(async ({ input, ctx }) => {
			const collections = await userCollectionsQuery(ctx.user).getMany()
			let queryParams = [input.query, collections.map((collection) => collection.id)] as any[]
			let queryIndex = 3
			let queryCriteria = [
				`asset_files.name ILIKE '%' || t.tag || '%'`,
				`collection_files.collection_id = ANY($2::uuid[])`,
			]

			if (input.assetTypes?.length) {
				queryParams = [...queryParams, input.assetTypes]
				queryCriteria = [...queryCriteria, `asset_files.asset_type_id = ANY($${queryIndex++}::uuid[])`]
			}

			if (input.searchScope === 'current_with_sub') {
				queryParams = [...queryParams, `%${input.collectionId}.%`]
				queryCriteria = [...queryCriteria, `collection.mpath ILIKE $${queryIndex++}`]
			} else if (input.searchScope === 'current' && input.collectionId) {
				queryParams = [...queryParams, input.collectionId]
				queryCriteria = [...queryCriteria, `collection.id = $${queryIndex++}`]
			}

			const result = await dataSource.query(`
        SELECT t.tag
        FROM unnest($1::text[]) AS t(tag)
		 		LEFT JOIN LATERAL (
					SELECT *
					FROM asset_files
			 		INNER JOIN collection_files ON collection_files.asset_file_id = asset_files.id
					WHERE ${queryCriteria.join(' AND ')}
				) AS subq ON true
        GROUP BY t.tag
        HAVING COUNT(subq) = 0;
			`, queryParams)
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
			collection.description = input.description
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
			collection.owner = collection.public ? undefined : ctx.user
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
			collection.description = input.description
			collection.assetFolder = assetFolder
			if (input.parentId) {
				collection.parent = await dataSource.getRepository(Collection).findOneBy({
					id: input.parentId,
					ownerId: ctx.user.role !== UserRole.ADMIN ? ctx.user.id : undefined,
				})
			}
			collection.public = collection.parent?.public ?? input.public ?? false
			collection.draft = collection.parent?.draft ?? input.draft ?? false
			collection.owner = collection.public ? undefined : ctx.user
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
					await duplicateCollection({ em, source: item, destination: collection })
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
			collection.description = input.description
			collection.draft = input.draft ?? false
			collection.hasThumbnail = input.hasThumbnail ?? collection.hasThumbnail
			if (!collection.public && !collection.ownerId) {
				collection.ownerId = ctx.user.id
			}

			await dataSource.transaction(async (em) => {
				await em.getRepository(Collection).save(collection)
				const children = await em.getTreeRepository(Collection).findDescendants(collection)
				await em.getRepository(Collection).update(
					{ id: In(children.map((child) => child.id)) },
					{ draft: collection.draft, ownerId: collection.ownerId },
				)
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
			const collections = []
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
			collection.description = input.description
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
