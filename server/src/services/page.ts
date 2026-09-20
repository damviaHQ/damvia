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
import { randomUUID } from "node:crypto"
import sharp from "sharp"
import { EntityManager, In } from "typeorm"
import { Collection } from "../entity/collection"
import { CollectionFile } from "../entity/collection-file"
import { Page } from "../entity/page"
import { PageBlock, PageBlockType } from "../entity/page-block"
import { User, UserRole } from "../entity/user"
import { assetsS3, assetsS3Bucket, dataSource, logger, mainS3, mainS3Bucket } from "../env"
import {
	BlockData,
	BlockInput,
	BlockType,
	collectionIdsOf,
	fileIdsOf,
	pageIdsOf,
	parseBlockData,
	uploadKeysOf,
} from "../page-blocks/schema"
import { sanitizeBlockHtml } from "../page-blocks/sanitize"
import { userCollectionFilesQuery, userCollectionsQuery } from "./collection"
import { blockPrefix, collectPageGarbage, listPageObjects, removePageObjects, stagingKey } from "./page-storage"

export const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'] as const
export const VIDEO_MIME_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'] as const
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024
export const MAX_VIDEO_BYTES = 500 * 1024 * 1024

export type UploadKind = 'image' | 'video'
export type FindPageOptions = { em: EntityManager, user: User, pageId: string }

export async function findPage({ em, user, pageId }: FindPageOptions) {
	const page = await em.getRepository(Page).findOne({
		where: { id: pageId },
		relations: { blocks: true }
	})
	if (!page) {
		return null
	} else if (user.role === UserRole.ADMIN) {
		return page
	} else if (!page.collectionId) {
		return null
	}

	page.collection = await userCollectionsQuery(user)
		.andWhere('collection.id = :id', { id: page.collectionId })
		.getOne()
	if (!page.collection) {
		return null
	}
	return page
}

// Every editing procedure resolves the page the same way: invisible pages are
// indistinguishable from missing ones, visible pages still need edit rights.
export async function loadEditablePage(opts: FindPageOptions) {
	const page = await findPage(opts)
	if (!page) {
		throw new TRPCError({ code: 'NOT_FOUND', message: 'Page not found.' })
	} else if (!page.canEdit(opts.user)) {
		throw new TRPCError({ code: 'FORBIDDEN', message: 'This page cannot be edited.' })
	}
	return page
}

// The block payload is never trusted: it is parsed against the schema for its
// own type, its text is sanitized and its uploads must belong to this page.
export function normalizeBlockData(pageId: string, type: BlockType, data: unknown): BlockData {
	let parsed: BlockData
	try {
		parsed = parseBlockData(type, data)
	} catch (error) {
		throw new TRPCError({ code: 'BAD_REQUEST', message: `This ${type} block has invalid content.` })
	}

	if (type === 'text') {
		return { ...parsed, html: sanitizeBlockHtml((parsed as { html: string }).html) }
	}
	for (const key of uploadKeysOf(parsed)) {
		if (!key.startsWith(blockPrefix(pageId))) {
			throw new TRPCError({ code: 'BAD_REQUEST', message: 'This image does not belong to this page.' })
		}
	}
	return parsed
}

export type SavePageOptions = { em: EntityManager, page: Page, blocks: BlockInput[] }

// One mutation writes the whole page: blocks are created, updated, reordered
// and deleted in a single transaction, so the editor always saves atomically.
export async function savePage({ em, page, blocks }: SavePageOptions) {
	const repository = em.getRepository(PageBlock)
	const existing = page.blocks ?? []
	const saved: PageBlock[] = []

	for (const [position, input] of blocks.entries()) {
		const block = input.id ? existing.find((current) => current.id === input.id) : undefined
		if (input.id && !block) {
			throw new TRPCError({ code: 'BAD_REQUEST', message: 'This block is no longer on the page.' })
		}
		const target = block ?? new PageBlock({
			pageId: page.id,
			type: PageBlockType[input.type.toUpperCase()],
			position,
			size: input.size,
			data: normalizeBlockData(page.id, input.type, input.data),
		})
		if (block) {
			// The type is fixed at creation: changing it would orphan its payload.
			target.position = position
			target.size = input.size
			target.data = normalizeBlockData(page.id, target.type as BlockType, input.data)
		}
		saved.push(await repository.save(target))
	}

	const removed = existing.filter((block) => !saved.some((current) => current.id === block.id))
	if (removed.length) {
		await repository.remove(removed)
	}
	page.blocks = saved
	return saved
}

export function createBlockUpload({ pageId, kind, contentType }: { pageId: string, kind: UploadKind, contentType: string }) {
	const allowed: readonly string[] = kind === 'image' ? IMAGE_MIME_TYPES : VIDEO_MIME_TYPES
	if (!allowed.includes(contentType)) {
		throw new TRPCError({ code: 'BAD_REQUEST', message: `This file type cannot be used as a page ${kind}.` })
	}

	const uploadId = randomUUID()
	const policy = mainS3().newPostPolicy()
	policy.setBucket(mainS3Bucket())
	policy.setKey(stagingKey(pageId, uploadId))
	policy.setExpires(new Date(Date.now() + 10 * 60 * 1000))
	policy.setContentType(contentType)
	policy.setContentLengthRange(1, kind === 'image' ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES)
	return mainS3().presignedPostPolicy(policy).then(({ postURL, formData }) => ({
		uploadId,
		url: postURL,
		fields: formData as Record<string, string>,
	}))
}

// Images are re-encoded, so whatever was uploaded is replaced by bytes this
// server produced. Videos are only accepted when their content matches.
export async function finalizeBlockUpload({ pageId, uploadId, kind }: { pageId: string, uploadId: string, kind: UploadKind }) {
	const source = stagingKey(pageId, uploadId)
	const target = `${blockPrefix(pageId)}${randomUUID()}`
	const limit = kind === 'image' ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES
	let staged: { versionId?: string | null } | null = null
	try {
		const object = await mainS3().statObject(mainS3Bucket(), source)
		staged = object
		if (object.size < 1 || object.size > limit) {
			throw new Error('size')
		}

		if (kind === 'image') {
			const buffer = await readObject(source, limit)
			const image = sharp(buffer, { limitInputPixels: 40_000_000, failOn: 'warning' })
			const metadata = await image.metadata()
			if (!['jpeg', 'png', 'webp', 'gif', 'avif'].includes(metadata.format ?? '')) {
				throw new Error('format')
			}
			const output = await image
				.resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
				.webp({ quality: 85 }).timeout({ seconds: 20 }).toBuffer()
			await mainS3().putObject(mainS3Bucket(), target, output, output.length, { 'Content-Type': 'image/webp' })
		} else {
			const { fileTypeFromBuffer } = await import('file-type')
			const head = await readObject(source, 64 * 1024)
			const detected = await fileTypeFromBuffer(head)
			if (!detected || !(VIDEO_MIME_TYPES as readonly string[]).includes(detected.mime)) {
				throw new Error('format')
			}
			await mainS3().copyObject(mainS3Bucket(), target, `/${mainS3Bucket()}/${source}`)
		}
	} catch (error) {
		logger.warn('page.upload-failed', { pageId, kind, code: error.code })
		throw new TRPCError({
			code: 'BAD_REQUEST',
			message: kind === 'image'
				? 'Upload a JPEG, PNG, WebP, GIF or AVIF image of up to 20 MB.'
				: 'Upload an MP4, WebM or MOV video of up to 500 MB.',
		})
	} finally {
		if (staged) {
			await mainS3().removeObject(mainS3Bucket(), source).catch(() => logger.warn('page.staging-cleanup-failed', { pageId }))
		}
	}
	return { s3key: target }
}

async function readObject(key: string, limit: number) {
	const stream = await mainS3().getObject(mainS3Bucket(), key)
	const chunks: Buffer[] = []
	let bytes = 0
	for await (const chunk of stream) {
		bytes += chunk.length
		chunks.push(Buffer.from(chunk))
		if (bytes > limit) {
			stream.destroy()
			break
		}
	}
	if (bytes > limit) {
		throw new Error('size')
	}
	return Buffer.concat(chunks)
}

export type PageAssetFile = { name: string, mimeType: string, thumbnailURL: string | null, fileURL: string }
export type PageAssetCollection = {
	id: string
	name: string
	numberOfFiles: number
	draft: boolean
	canEdit: boolean
	thumbnailURL: string | null
	sampleFiles: { id: string, name: string, thumbnailURL: string | null }[]
}

export type PageAssets = {
	uploads: Record<string, string>
	files: Record<string, PageAssetFile>
	collections: Record<string, PageAssetCollection>
	pages: Record<string, { name: string | null }>
}

// Everything a block points at is resolved for the viewer, never for the author:
// a file the viewer cannot reach is simply absent from the result.
export async function resolvePageAssets(user: User, blocks: PageBlock[]): Promise<PageAssets> {
	const assets: PageAssets = { uploads: {}, files: {}, collections: {}, pages: {} }
	const uploadKeys = new Set<string>()
	const fileIds = new Set<string>()
	const collectionIds = new Set<string>()
	const pageIds = new Set<string>()
	for (const block of blocks) {
		uploadKeysOf(block.data).forEach((key) => uploadKeys.add(key))
		fileIdsOf(block.data).forEach((id) => fileIds.add(id))
		collectionIdsOf(block.data).forEach((id) => collectionIds.add(id))
		pageIdsOf(block.data).forEach((id) => pageIds.add(id))
	}

	await Promise.all([...uploadKeys].map(async (key) => {
		assets.uploads[key] = await mainS3().presignedGetObject(mainS3Bucket(), key)
	}))

	if (fileIds.size) {
		const files = await userCollectionFilesQuery(user)
			.andWhere('collection_file.id IN (:...ids)', { ids: [...fileIds] })
			.getMany()
		await Promise.all(files.map(async (file: CollectionFile) => {
			assets.files[file.id] = {
				name: file.assetFile.name,
				mimeType: file.assetFile.mimeType,
				thumbnailURL: file.assetFile.hasThumbnail
					? await assetsS3().presignedGetObject(assetsS3Bucket(), file.assetFile.thumbnailStorageKey)
					: null,
				fileURL: await assetsS3().presignedGetObject(assetsS3Bucket(), file.assetFile.originalStorageKey),
			}
		}))
	}

	if (collectionIds.size) {
		const collections = await userCollectionsQuery(user)
			.andWhere('collection.id IN (:...ids)', { ids: [...collectionIds] })
			.getMany()
		// A collection card previews its content, so the sample files a card
		// falls back on when it has no thumbnail of its own are resolved too.
		const sampleIds = collections.flatMap((collection: Collection) => collection.sampleFileIds ?? [])
		const samples = sampleIds.length
			? await userCollectionFilesQuery(user).andWhere('collection_file.id IN (:...ids)', { ids: sampleIds }).getMany()
			: []
		await Promise.all(collections.map(async (collection: Collection) => {
			assets.collections[collection.id] = {
				id: collection.id,
				name: collection.name,
				numberOfFiles: collection.numberOfFiles,
				draft: collection.draft,
				canEdit: collection.canEdit(user),
				thumbnailURL: collection.hasThumbnail
					? await mainS3().presignedGetObject(mainS3Bucket(), collection.thumbnailStorageKey)
					: null,
				sampleFiles: await Promise.all((collection.sampleFileIds ?? [])
					.map((fileId) => samples.find((sample: CollectionFile) => sample.id === fileId))
					.filter((file): file is CollectionFile => !!file)
					.map(async (file: CollectionFile) => ({
						id: file.id,
						name: file.assetFile.name,
						thumbnailURL: file.assetFile.hasThumbnail
							? await assetsS3().presignedGetObject(assetsS3Bucket(), file.assetFile.thumbnailStorageKey)
							: null,
					}))),
			}
		}))
	}

	if (pageIds.size) {
		const pages = await dataSource.getRepository(Page).find({ where: { id: In([...pageIds]) } })
		for (const page of pages) {
			assets.pages[page.id] = { name: page.name }
		}
	}

	return assets
}

export { blockPrefix, collectPageGarbage, listPageObjects, removePageObjects }
