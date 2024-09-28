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
import { fromFile as fileTypeFromFile } from "file-type"
import ffmpeg from "fluent-ffmpeg"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import sharp from "sharp"
import { v4 as uuid } from 'uuid'
import { AssetFile, AssetFileStatus } from "../entity/asset-file"
import { AssetFolder, AssetFolderStatus } from "../entity/asset-folder"
import { Collection } from "../entity/collection"
import { CollectionFile } from "../entity/collection-file"
import { Product } from "../entity/product"
import { assetsS3, assetsS3Bucket, assetUpdater, dataSource, logger } from "../env"
import { assetUpdateContentQueue, collectionSynchronizationQueue } from "../worker"

let _tmpDir = null
export async function tmpDir() {
	if (!_tmpDir) {
		_tmpDir = await mkdtemp(join(tmpdir(), 'dam-asset'))
	}
	return _tmpDir
}

export async function tmpFile() {
	return join(await tmpDir(), uuid())
}

export async function updateFileContent(file: AssetFile): Promise<void> {
	const contentPath = await assetUpdater().fetchFileContent(file)
	const fileType = await fileTypeFromFile(contentPath)
	file.mimeType = fileType?.ext === 'webp' ? 'image/webp' : (fileType?.mime ?? 'application/octet-stream')
	await assetsS3().fPutObject(assetsS3Bucket(), file.originalStorageKey, contentPath, { 'Content-Type': file.mimeType })

	const thumbnailPath = await generateFileThumbnail(file, contentPath).catch(() => null)
	if (thumbnailPath === null && file.hasThumbnail) {
		file.hasThumbnail = false
		await assetsS3().removeObjects(assetsS3Bucket(), [file.thumbnailStorageKey])
	} else if (thumbnailPath) {
		await assetsS3().fPutObject(assetsS3Bucket(), file.thumbnailStorageKey, thumbnailPath, { 'Content-Type': 'image/png' })
		if (!file.hasThumbnail) {
			file.hasThumbnail = true
		}
	}

	const dimensions = await extractDimensions(file, contentPath).catch(() => null)
	file.width = dimensions?.width ?? null
	file.height = dimensions?.height ?? null

	file.status = AssetFileStatus.UP_TO_DATE
	await dataSource.getRepository(AssetFile).save(file)

	if (thumbnailPath) {
		rm(thumbnailPath).catch((error) => logger.error("failed to delete thumbnail", { error: error.message }))
	}
	rm(contentPath).catch((error) => logger.error("failed to delete file", { error: error.message }))
}

export async function generateFileThumbnail(file: AssetFile, contentPath: string): Promise<string | null> {
	if (file.mimeType.startsWith('video/')) {
		const thumbnailFolder = await tmpDir()
		const thumbnailFiles = await new Promise<string[]>((resolve, reject) => {
			let _filenames = []
			ffmpeg(contentPath).thumbnail({
				count: 1,
				folder: thumbnailFolder,
			})
				.on('filenames', (filenames) => _filenames = filenames)
				.on('error', reject)
				.on('end', () => resolve(_filenames))
		})
		return join(thumbnailFolder, thumbnailFiles[0])
	} else if (file.mimeType.startsWith('image/')) {
		const thumbnailPath = await tmpFile()
		await sharp(contentPath).resize({ height: 1280 }).toFormat('webp').toFile(thumbnailPath)
		return thumbnailPath
	}
	return null
}

export async function extractDimensions(file: AssetFile, contentPath: string): Promise<{ width: number, height: number } | null> {
	if (file.mimeType.startsWith('video/')) {
		return new Promise((resolve) => {
			ffmpeg.ffprobe(contentPath, (err, metadata) => {
				if (err) {
					resolve(null)
					return
				}

				const { width, height } = metadata.streams.find(stream => stream.codec_type === 'video') ?? {}
				if (width && height) {
					resolve({ width, height })
					return
				}
				resolve(null)
			})
		})
	} else if (file.mimeType.startsWith('image/')) {
		const meta = await sharp(contentPath).metadata()
		return { width: meta.width, height: meta.height }
	}
	return null
}

export async function processDeletion() {
	const filesToDelete = await dataSource.getRepository(AssetFile).findBy({
		status: AssetFileStatus.PENDING_DELETION
	})
	for (const file of filesToDelete) {
		await deleteFile(file.id)
	}

	const foldersToDelete = await dataSource.getRepository(AssetFolder).findBy({
		status: AssetFolderStatus.PENDING_DELETION,
	})
	for (const folder of foldersToDelete) {
		await deleteFolder(folder.id)
	}
}

export type UpsertFolderOptions = {
	externalId: string
	parentExternalId: string
	name: string
}

export async function upsertFolder(opts: UpsertFolderOptions): Promise<AssetFolder> {
	let folder = await dataSource.getRepository(AssetFolder).findOne({
		where: { externalId: opts.externalId },
		relations: { parent: { collections: true }, collections: true },
	})
	const alreadyExists = !!folder
	if (!folder) {
		folder = new AssetFolder()
		folder.externalId = opts.externalId
		folder.status = AssetFolderStatus.UP_TO_DATE
	}

	const folderNameChanged = folder.name !== opts.name
	folder.name = opts.name
	const previousParent = folder.parent
	if (folder.parent?.externalId !== opts.parentExternalId) {
		folder.parent = await dataSource.getRepository(AssetFolder).findOne({
			where: { externalId: opts.parentExternalId },
			relations: { collections: true },
		})
	}
	const parentChanged = previousParent?.id !== folder.parent?.id

	if (!alreadyExists || parentChanged) {
		folder.licenseId = folder.parent?.licenseId
		folder.assetTypeId = folder.parent?.assetTypeId
	}

	await dataSource.getRepository(AssetFolder).save(folder)
	if (folderNameChanged || parentChanged || !alreadyExists) {
		const jobs = [
			...(folder.collections?.map((c) => ({ data: { collectionId: c.id } })) ?? []),
			...(folder.parent?.collections?.map((c) => ({ data: { collectionId: c.id } })) ?? []),
			...(parentChanged && previousParent
				? previousParent.collections?.map((c) => ({ data: { collectionId: c.id } }))
				: []
			),
		]
		if (jobs.length > 0) {
			await collectionSynchronizationQueue.bulkPush(jobs)
		}
	}
	return folder
}

export async function deleteFolder(folderId: string): Promise<void> {
	const folder = await dataSource.getRepository(AssetFolder).findOne({
		where: { id: folderId },
		relations: ['children', 'files'],
	})
	for (const child of folder.children) {
		await deleteFolder(child.id)
	}
	for (const file of folder.files) {
		await deleteFile(file.id)
	}
	await dataSource.getRepository(Collection).delete({ assetFolderId: folder.id })
	await dataSource.getRepository(AssetFolder).remove(folder)
}

export type UpsertFileOptions = {
	externalId: string
	externalChecksum: string
	folderExternalId: string
	name: string
	size: number
	mimeType: string
}

export async function upsertFile(opts: UpsertFileOptions): Promise<AssetFile> {
	let file = await dataSource.getRepository(AssetFile).findOne({
		where: { externalId: opts.externalId },
		relations: { folder: { collections: true } },
	})
	if (!file) {
		file = new AssetFile()
		file.externalId = opts.externalId
		file.status = AssetFileStatus.CREATING
	}

	const previousFolder = file.folder
	file.name = opts.name
	file.size = opts.size.toString()
	file.folder = await dataSource.getRepository(AssetFolder).findOne({
		where: { externalId: opts.folderExternalId },
		relations: { collections: true },
	})
	file.licenseId = file.folder?.licenseId
	file.assetTypeId = file.folder?.assetTypeId
	file.mimeType = opts.mimeType
	file.externalChecksum = opts.externalChecksum
	if (file.externalChecksum !== opts.externalChecksum && file.status !== AssetFileStatus.CREATING) {
		file.status = AssetFileStatus.OUTDATED
	}
	await dataSource.getRepository(AssetFile).save(file)

	// requesting file content update if checksum is changed or file is creating
	if (file.externalChecksum !== opts.externalChecksum || file.status === AssetFileStatus.CREATING) {
		await assetUpdateContentQueue.push({ assetFileId: file.id })
	}

	const folderChanged = previousFolder?.id !== file.folder?.id
	// synchronize collections
	if (folderChanged || file.status === AssetFileStatus.CREATING) {
		if (folderChanged) {
			await dataSource.query(`DELETE FROM collection_files WHERE asset_file_id = $1`, [file.id])
		}

		await dataSource.query(`
			INSERT INTO collection_files (asset_file_id, collection_id)
			SELECT $1, id FROM collections
			WHERE asset_folder_id = $2
			ON CONFLICT DO NOTHING
		`, [file.id, file.folder?.id])
	}
	return file
}

export async function deleteFile(fileId: string): Promise<void> {
	const file = await dataSource.getRepository(AssetFile).findOneBy({ id: fileId })
	await dataSource.transaction(async (em) => {
		await em.getRepository(CollectionFile).delete({ assetFileId: file.id })
		await em.getRepository(AssetFile).remove(file)
		await assetsS3().removeObjects(assetsS3Bucket(), [file.originalStorageKey, file.thumbnailStorageKey])
	})
}

export async function assignProductsToAssetFiles() {
	const regexString = process.env.PRODUCT_MATCHING_REGEX
	if (!regexString) {
		console.error('PRODUCT_MATCHING_REGEX is not defined in the environment variables')
		return
	}
	const regex = new RegExp(regexString)
	const assetFiles = await dataSource.getRepository(AssetFile).find({
		relations: { assetType: true },
	})

	for (const assetFile of assetFiles) {
		const match = assetFile.name.match(regex)
		if (!match) {
			continue
		}

		const [, productKey, productView] = match
		const product = await dataSource.getRepository(Product).findOneBy({ productKey })
		if (!product) {
			continue
		}

		assetFile.product = product
		assetFile.productView = productView || null

		await dataSource.getRepository(AssetFile).save(assetFile)
	}
}
