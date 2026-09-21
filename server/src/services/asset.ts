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
import {loadEsm} from 'load-esm';
import ffmpeg from "fluent-ffmpeg"
import {exec} from "node:child_process"
import {mkdir, mkdtemp, rm} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"
import sharp from "sharp"
import { randomUUID } from 'node:crypto'
import {In} from "typeorm"
import {AssetFile, AssetFileStatus} from "../entity/asset-file"
import {AssetFolder, AssetFolderStatus} from "../entity/asset-folder"
import {AssetSource} from "../entity/asset-source"
import {CollectionFile} from "../entity/collection-file"
import {Product} from "../entity/product"
import {assetsS3, assetsS3Bucket, assetUpdaterFor, dataSource, logger} from "../env"
import {assetUpdateContentQueue, collectionSynchronizationQueue} from "../worker"
import {destroySynchronizedCollections, moveSynchronizedCollections, reparentSubtree} from "./collection"
import {commitStorage, releaseStorage, reserveStorage, StorageQuotaExceededError} from "./storage"
import {
	convertOfficeToPng,
	convertVectorToPng,
	FONT_EXTENSIONS,
	FONT_MIMETYPES,
	generateVideoThumbnail,
	GHOSTSCRIPT_EXTENSIONS,
	GHOSTSCRIPT_MIMETYPES,
	IMAGE_EXTENSIONS,
	IMAGE_MIMETYPES,
	isFileType,
	LIBREOFFICE_EXTENSIONS,
	LIBREOFFICE_MIMETYPES,
	processFontThumbnail,
	processImageThumbnail,
	VIDEO_EXTENSIONS,
	VIDEO_MIMETYPES
} from "./image-processor"

const fileTypeModule = loadEsm<typeof import('file-type')>('file-type')

let _tmpDir: string | null = null
export async function tmpDir() {
	if (!_tmpDir) {
		_tmpDir = await mkdtemp(join(tmpdir(), 'dam-asset'))
	}
	return _tmpDir
}

export async function tmpFile() {
	const dir = await tmpDir()
	await mkdir(dir, { recursive: true })
	return join(dir, randomUUID())
}

// Listing types a browser would execute if the object were opened directly from
// the assets bucket; when the content cannot be identified, these fall back to a
// download instead of being trusted.
const ACTIVE_CONTENT_MIMETYPES = new Set(['text/html', 'application/xhtml+xml', 'image/svg+xml', 'application/javascript', 'text/javascript', 'application/xml', 'text/xml'])

export function resolveMimeType(detected: { ext: string, mime: string } | null | undefined, listed: string | null | undefined): string {
	if (detected) return detected.ext === 'webp' ? 'image/webp' : detected.mime
	return listed && !ACTIVE_CONTENT_MIMETYPES.has(listed.toLowerCase()) ? listed : 'application/octet-stream'
}

export async function updateFileContent(file: AssetFile): Promise<void> {
	const size = parseInt(file.size, 10) || 0
	if (!(await reserveStorage(size))) {
		throw new StorageQuotaExceededError(file.id, size)
	}
	try {
		await uploadFileContent(file, size)
	} catch (error) {
		await releaseStorage(size)
		throw error
	}
}

async function uploadFileContent(file: AssetFile, size: number): Promise<void> {
	const contentPath = await assetUpdaterFor(file.sourceKey).fetchFileContent(file).catch((error) => {
		throw new Error(`Failed to fetch file content (asset file id: ${file.id}): ${error.message}`)
	})
	try {
		const { fileTypeFromFile } = await fileTypeModule
		const fileType = await fileTypeFromFile(contentPath).catch((error) => {
			logger.error(`Failed to detect file type (asset file id: ${file.id}): ${error.message}`)
			return null;
		})
		file.mimeType = resolveMimeType(fileType, file.mimeType)

		await assetsS3().fPutObject(assetsS3Bucket(), file.originalStorageKey, contentPath, {
			'Content-Type': file.mimeType,
		})

		let thumbnailPath: string | null = null
		try {
			thumbnailPath = await generateFileThumbnail(file, contentPath)
			if (thumbnailPath) {
				await assetsS3().fPutObject(assetsS3Bucket(), file.thumbnailStorageKey, thumbnailPath, {
					'Content-Type': 'image/webp',
				})
				if (!file.hasThumbnail) {
					file.hasThumbnail = true
				}
			} else if (file.hasThumbnail) {
				file.hasThumbnail = false
				await assetsS3().removeObjects(assetsS3Bucket(), [file.thumbnailStorageKey])
			}
		} catch (error) {
			logger.warn('asset.thumbnail-failed', { assetFileId: file.id, error: error.message })
		}

		try {
			const dimensions = await extractDimensions(file, contentPath)
			if (dimensions) {
				file.width = dimensions.width
				file.height = dimensions.height
			}
		} catch (error) {
			logger.warn('asset.dimensions-failed', { assetFileId: file.id, error: error.message })
		}

		file.status = AssetFileStatus.UP_TO_DATE
		await dataSource.getRepository(AssetFile).save(file)
		await commitStorage(size)

		if (thumbnailPath) {
			rm(thumbnailPath).catch(
				(error) => logger.error("Failed to delete thumbnail", { error: error.message }),
			)
		}
	} finally {
		rm(contentPath).catch((error) => logger.error("Failed to delete file", { error: error.message }))
	}
}

export async function generateFileThumbnail(file: AssetFile, contentPath: string): Promise<string | null> {
	const isVideo = isFileType(file, VIDEO_EXTENSIONS, VIDEO_MIMETYPES);
	const isImage = isFileType(file, IMAGE_EXTENSIONS, IMAGE_MIMETYPES);
	const isVector = isFileType(file, GHOSTSCRIPT_EXTENSIONS, GHOSTSCRIPT_MIMETYPES);
	const isOfficeDoc = isFileType(file, LIBREOFFICE_EXTENSIONS, LIBREOFFICE_MIMETYPES);
	const isFont = isFileType(file, FONT_EXTENSIONS, FONT_MIMETYPES);

	let pngPath: string | null = null;
	let thumbnailPath: string | null = null;

	try {
		if (isVideo) {
			pngPath = await generateVideoThumbnail(file, contentPath, tmpFile, tmpDir);
		} else if (isImage) {
			return await processImageThumbnail(file, contentPath, tmpFile);
		} else if (isFont) {
			return await processFontThumbnail(file, contentPath, tmpFile);
		} else if (isOfficeDoc) {
			pngPath = await convertOfficeToPng(file, contentPath, tmpFile, tmpDir);
		} else if (isVector) {
			pngPath = await convertVectorToPng(file, contentPath, tmpFile);
		}

		if (pngPath) {
			thumbnailPath = await tmpFile();

			await sharp(pngPath)
				.resize({ height: 1280 })
				.toFormat('webp')
				.toFile(thumbnailPath);

			rm(pngPath, { force: true }).catch(() => {});
			return thumbnailPath;
		}

		return null;
	} catch (error) {
		return null;
	}
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
	} else if (file.mimeType.startsWith('image/') ||
	           file.mimeType === 'application/photoshop' ||
	           file.mimeType === 'application/psd' ||
	           file.name.toLowerCase().endsWith('.psd')) {

		const isPsd = file.mimeType === 'image/vnd.adobe.photoshop' ||
		             file.mimeType === 'application/photoshop' ||
		             file.mimeType === 'application/psd' ||
		             file.mimeType === 'image/psd' ||
		             file.name.toLowerCase().endsWith('.psd');

		if (isPsd) {
			try {
				return new Promise((resolve, reject) => {
					const cmd = `magick identify -format "%[width]x%[height]" "${contentPath}"`;
					exec(cmd, (error, stdout) => {
						if (error) {
							resolve(null);
							return;
						}

						const dimensions = stdout.trim().split('x');
						if (dimensions.length === 2) {
							const width = parseInt(dimensions[0], 10);
							const height = parseInt(dimensions[1], 10);
							if (!isNaN(width) && !isNaN(height)) {
								resolve({ width, height });
								return;
							}
						}
						resolve(null);
					});
				});
			} catch (error) {
				return null;
			}
		}

		try {
			const isTiff = file.mimeType === 'image/tiff' ||
						  file.name.toLowerCase().endsWith('.tiff') ||
						  file.name.toLowerCase().endsWith('.tif');

			if (isTiff || parseInt(file.size, 10) > 50 * 1024 * 1024) {
				const meta = await sharp(contentPath, {
					limitInputPixels: 0,
					pages: 1
				}).metadata();
				return meta.width && meta.height ? { width: meta.width, height: meta.height } : null;
			} else {
				const meta = await sharp(contentPath).metadata();
				return meta.width && meta.height ? { width: meta.width, height: meta.height } : null;
			}
		} catch (error) {
			return null;
		}
	} else if (isFileType(file, FONT_EXTENSIONS, FONT_MIMETYPES)) {
		return { width: 1920, height: 1280 };
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

// Rows written before sources existed carry an empty key. When exactly one
// source is configured they belong to it, so stamp them before its first sweep.
export async function adoptUnassignedAssets(sourceKey: string): Promise<{ folders: number, files: number }> {
	const folders = await dataSource.getRepository(AssetFolder).update({ sourceKey: '' }, { sourceKey })
	const files = await dataSource.getRepository(AssetFile).update({ sourceKey: '' }, { sourceKey })
	return { folders: folders.affected ?? 0, files: files.affected ?? 0 }
}

// Keys of rows that no configured source owns, ignoring rows already handed
// to the deletion job. The server refuses to start while any exist, so users
// never see a frozen or duplicated library.
export async function staleAssetSourceKeys(configured: string[]): Promise<string[]> {
	const rows = await dataSource.query(`
		SELECT source_key FROM asset_folders WHERE status <> $1 AND NOT (source_key = ANY($2))
		UNION SELECT source_key FROM asset_files WHERE status <> $1 AND NOT (source_key = ANY($2))
		ORDER BY 1
	`, ['pending_deletion', configured])
	return rows.map((row: { source_key: string }) => row.source_key)
}

// The configured sources, as the dashboard shows them, with their last run
// and the state of their rows.
export type AssetSourceStatus = {
	key: string
	provider: string
	label: string | null
	root: string
	name: string
	folderId: string | null
	folders: number
	files: { up_to_date: number, creating: number, outdated: number, pending_deletion: number }
	lastRunStartedAt: Date | null
	lastRunFinishedAt: Date | null
	lastSuccessAt: Date | null
	lastError: string | null
	state: 'never' | 'running' | 'ok' | 'failed'
}

export async function registerAssetSources(sources: { key: string, provider: string, label?: string, root: string }[]): Promise<void> {
	await dataSource.transaction(async (em) => {
		for (const source of sources) {
			await em.query(`
				INSERT INTO asset_sources (key, provider, label, root) VALUES ($1, $2, $3, $4)
				ON CONFLICT (key) DO UPDATE SET provider = EXCLUDED.provider, label = EXCLUDED.label, root = EXCLUDED.root
			`, [source.key, source.provider, source.label ?? null, source.root])
		}
		await em.query('DELETE FROM asset_sources WHERE NOT (key = ANY($1))', [sources.map((source) => source.key)])
	})
}

export async function recordAssetSourceRun(key: string, outcome: 'started' | 'succeeded' | { error: string }): Promise<void> {
	const repository = dataSource.getRepository(AssetSource)
	if (outcome === 'started') {
		await repository.update({ key }, { lastRunStartedAt: new Date() })
	} else if (outcome === 'succeeded') {
		const now = new Date()
		await repository.update({ key }, { lastRunFinishedAt: now, lastSuccessAt: now, lastError: null })
	} else {
		await repository.update({ key }, { lastRunFinishedAt: new Date(), lastError: outcome.error.slice(0, 1000) })
	}
}

export async function assetSourceStatuses(): Promise<AssetSourceStatus[]> {
	const rows = await dataSource.query(`
		SELECT s.key, s.provider, s.label, s.root,
			s.last_run_started_at, s.last_run_finished_at, s.last_success_at, s.last_error,
			top.id AS folder_id, top.name AS folder_name,
			(SELECT count(*) FROM asset_folders f WHERE f.source_key = s.key AND f.status = 'up_to_date')::int AS folders,
			(SELECT count(*) FROM asset_files f WHERE f.source_key = s.key AND f.status = 'up_to_date')::int AS up_to_date,
			(SELECT count(*) FROM asset_files f WHERE f.source_key = s.key AND f.status = 'creating')::int AS creating,
			(SELECT count(*) FROM asset_files f WHERE f.source_key = s.key AND f.status = 'outdated')::int AS outdated,
			(SELECT count(*) FROM asset_files f WHERE f.source_key = s.key AND f.status = 'pending_deletion')::int AS pending_deletion
		FROM asset_sources s
		LEFT JOIN LATERAL (
			SELECT id, name FROM asset_folders f WHERE f.source_key = s.key AND f.parent_id IS NULL AND f.status = 'up_to_date' ORDER BY name LIMIT 1
		) top ON true
		ORDER BY s.key
	`)
	return rows.map((row: any) => ({
		key: row.key,
		provider: row.provider,
		label: row.label,
		root: row.root,
		name: row.label ?? row.folder_name ?? row.key,
		folderId: row.folder_id,
		folders: row.folders,
		files: { up_to_date: row.up_to_date, creating: row.creating, outdated: row.outdated, pending_deletion: row.pending_deletion },
		lastRunStartedAt: row.last_run_started_at,
		lastRunFinishedAt: row.last_run_finished_at,
		lastSuccessAt: row.last_success_at,
		lastError: row.last_error,
		state: !row.last_run_started_at ? 'never'
			: !row.last_run_finished_at || row.last_run_started_at > row.last_run_finished_at ? 'running'
			: row.last_error ? 'failed' : 'ok',
	}))
}

export type AssetSourceSummary = { sourceKey: string, folders: number, files: number, pendingDeletion: number, topLevel: string[] }

// One line per key found in the database, for the operator who has to decide
// between rename-source and remove-source.
export async function summarizeAssetSources(): Promise<AssetSourceSummary[]> {
	const rows = await dataSource.query(`
		SELECT keys.source_key,
			(SELECT count(*) FROM asset_folders f WHERE f.source_key = keys.source_key)::int AS folders,
			(SELECT count(*) FROM asset_files f WHERE f.source_key = keys.source_key)::int AS files,
			(SELECT count(*) FROM asset_files f WHERE f.source_key = keys.source_key AND f.status = 'pending_deletion')::int
				+ (SELECT count(*) FROM asset_folders f WHERE f.source_key = keys.source_key AND f.status = 'pending_deletion')::int AS pending_deletion,
			(SELECT coalesce(array_agg(f.name ORDER BY f.name), '{}') FROM asset_folders f WHERE f.source_key = keys.source_key AND f.parent_id IS NULL) AS top_level
		FROM (SELECT source_key FROM asset_folders UNION SELECT source_key FROM asset_files) keys
		ORDER BY keys.source_key
	`)
	return rows.map((row: any) => ({ sourceKey: row.source_key, folders: row.folders, files: row.files, pendingDeletion: row.pending_deletion, topLevel: row.top_level }))
}

export async function listAssetSourceKeys(): Promise<string[]> {
	const rows = await dataSource.query('SELECT source_key FROM asset_folders UNION SELECT source_key FROM asset_files')
	return rows.map((row: { source_key: string }) => row.source_key)
}

export async function renameAssetSource(from: string, to: string): Promise<{ folders: number, files: number }> {
	const folders = await dataSource.getRepository(AssetFolder).update({ sourceKey: from }, { sourceKey: to })
	const files = await dataSource.getRepository(AssetFile).update({ sourceKey: from }, { sourceKey: to })
	return { folders: folders.affected ?? 0, files: files.affected ?? 0 }
}

// Hands every row of a source to the deletion job, which removes the files,
// their objects, the folders and the collections mirrored on them.
export async function removeAssetSource(sourceKey: string): Promise<{ folders: number, files: number }> {
	const folders = await dataSource.getRepository(AssetFolder).update({ sourceKey }, { status: AssetFolderStatus.PENDING_DELETION })
	const files = await dataSource.getRepository(AssetFile).update({ sourceKey }, { status: AssetFileStatus.PENDING_DELETION })
	return { folders: folders.affected ?? 0, files: files.affected ?? 0 }
}

export type UpsertFolderOptions = {
	externalId: string
	parentExternalId: string
	name: string
	sourceKey?: string
}

export async function upsertFolder(opts: UpsertFolderOptions): Promise<AssetFolder> {
	const sourceKey = opts.sourceKey ?? ''
	const { folder, jobs } = await dataSource.transaction(async (em) => {
		let folder = await em.getRepository(AssetFolder).findOne({
			where: { sourceKey, externalId: opts.externalId },
			relations: { parent: { collections: true }, collections: true },
		})
		const alreadyExists = !!folder
		if (!folder) {
			folder = new AssetFolder()
			folder.externalId = opts.externalId
			folder.sourceKey = sourceKey
			folder.status = AssetFolderStatus.UP_TO_DATE
		}

		const folderNameChanged = folder.name !== opts.name
		folder.name = opts.name
		const previousParent = folder.parent
		let parent = folder.parent
		if (folder.parent?.externalId !== opts.parentExternalId) {
			parent = await em.getRepository(AssetFolder).findOne({
				where: { sourceKey, externalId: opts.parentExternalId },
				relations: { collections: true },
			})
			// A child listed before its parent must not land at the root; the
			// next pass finds the parent.
			if (!parent && opts.parentExternalId !== '' && alreadyExists) {
				parent = previousParent
			}
		}
		const parentChanged = previousParent?.id !== parent?.id

		if (!alreadyExists || parentChanged) {
			folder.licenseId = parent?.licenseId ?? null
			if (folder.assetTypeSource !== 'manual') {
				folder.assetTypeId = parent?.assetTypeId ?? null
			}
		}
		if (!alreadyExists) {
			folder.parent = parent
		}

		await em.getRepository(AssetFolder).save(folder)
		if (alreadyExists && parentChanged) {
			await reparentSubtree(em, { table: 'asset_folders', nodeId: folder.id, newParentId: parent?.id ?? null })
			folder.parent = parent
			folder.parentId = parent?.id ?? null
			await moveSynchronizedCollections(em, { folderId: folder.id, newParentFolderId: parent?.id ?? null })
		}
		const jobs = folderNameChanged || parentChanged || !alreadyExists ? [
			...(folder.collections?.map((c) => ({ data: { collectionId: c.id } })) ?? []),
			...(parent?.collections?.map((c) => ({ data: { collectionId: c.id } })) ?? []),
			...(parentChanged && previousParent
				? previousParent.collections?.map((c) => ({ data: { collectionId: c.id } }))
				: []
			),
		] : []
		return { folder, jobs }
	})
	if (jobs.length > 0) {
		await collectionSynchronizationQueue.bulkPush(jobs)
	}
	return folder
}

export async function deleteFolder(folderId: string): Promise<void> {
	const folders: { id: string }[] = await dataSource.query(`
		WITH RECURSIVE tree AS (
			SELECT id FROM asset_folders WHERE id = $1
			UNION ALL
			SELECT asset_folders.id FROM asset_folders INNER JOIN tree ON asset_folders.parent_id = tree.id
		)
		SELECT id FROM tree
	`, [folderId])
	if (folders.length === 0) return
	const folderIds = folders.map((current) => current.id)
	const files = await dataSource.getRepository(AssetFile).findBy({ folderId: In(folderIds) })
	for (const file of files) {
		await deleteFile(file.id)
	}
	const cleanup = await dataSource.transaction(async (em) => {
		const cleanup = await destroySynchronizedCollections(em, folderIds)
		await em.getRepository(AssetFolder).delete({ id: In(folderIds) })
		return cleanup
	})
	await cleanup()
}

export type UpsertFileOptions = {
	externalId: string
	externalChecksum: string
	folderExternalId: string
	name: string
	size: number
	mimeType: string
	sourceKey?: string
}

export async function upsertFile(opts: UpsertFileOptions): Promise<AssetFile> {
	const sourceKey = opts.sourceKey ?? ''
	let file = await dataSource.getRepository(AssetFile).findOne({
		where: { sourceKey, externalId: opts.externalId },
		relations: { folder: { collections: true } },
	})
	if (!file) {
		file = new AssetFile()
		file.externalId = opts.externalId
		file.sourceKey = sourceKey
		file.status = AssetFileStatus.CREATING
	}

	const previousFolder = file.folder
	file.name = opts.name
	file.size = opts.size.toString()
	const folder = await dataSource.getRepository(AssetFolder).findOne({
		where: { sourceKey, externalId: opts.folderExternalId },
		relations: { collections: true },
	})
	if (!folder) throw new Error(`Folder ${opts.folderExternalId} not found`)
	file.folder = folder
	file.licenseId = folder.licenseId
	file.assetTypeId = folder.assetTypeId
	file.mimeType = opts.mimeType
	const checksumChanged = file.externalChecksum !== opts.externalChecksum
	file.externalChecksum = opts.externalChecksum
	if (checksumChanged && file.status === AssetFileStatus.UP_TO_DATE) {
		file.status = AssetFileStatus.OUTDATED
	}
	await dataSource.getRepository(AssetFile).save(file)

	if (checksumChanged || file.status === AssetFileStatus.CREATING) {
		await assetUpdateContentQueue.push({ assetFileId: file.id })
	}

	const folderChanged = previousFolder?.id !== file.folder?.id
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
	if (!file) return
	const storageKeys = [file.originalStorageKey, file.thumbnailStorageKey]
	await dataSource.transaction(async (em) => {
		await em.getRepository(CollectionFile).delete({ assetFileId: file.id })
		await em.getRepository(AssetFile).remove(file)
		await assetsS3().removeObjects(assetsS3Bucket(), storageKeys)
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
		assetFile.product = product
		assetFile.productView = productView || null

		await dataSource.getRepository(AssetFile).save(assetFile)
	}
}
