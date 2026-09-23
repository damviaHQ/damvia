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
import { userCollectionFilesQuery } from './collection'
import { resolveDownloadSelection } from './download-selection'
import { buildRecordExport, recordExportColumns } from './download-record-export'
import { User } from '../entity/user'
import { TRPCError } from '@trpc/server'
import { ZipArchive } from 'archiver'
import ffmpeg from "fluent-ffmpeg"
import { randomUUID } from "node:crypto"
import { createWriteStream } from "node:fs"
import { finished } from "node:stream/promises"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as Throttle from 'promise-parallel-throttle'
import sharp from "sharp"
import { EntityManager, In, LessThan, Not } from "typeorm"
import { AssetFile } from "../entity/asset-file"
import { Collection } from "../entity/collection"
import { CollectionFile } from "../entity/collection-file"
import {
	Download,
	DownloadImageFormat,
	DownloadImageResolution,
	DownloadStatus,
	DownloadVideoFormat,
	DownloadVideoResolution
} from "../entity/download"
import { assetsS3, assetsS3Bucket, dataSource, logger } from "../env"

export type CreateDownloadArchiveOptions = {
	em: EntityManager
	download: Download
}

export class DownloadAccessError extends Error {
	constructor() {
		super('Download access is no longer available.')
		this.name = 'DownloadAccessError'
		Object.setPrototypeOf(this, DownloadAccessError.prototype)
	}
}

export async function createDownloadArchive({ em, download }: CreateDownloadArchiveOptions) {
	const user = await em.getRepository(User).findOneBy({ id: download.userId })
	if (!user?.approved || !user.emailVerified || !download.collectionFileIds.length) {
		throw new DownloadAccessError()
	}
	const collectionFiles = await userCollectionFilesQuery(user, em)
		.andWhere('collection_file.id IN (:...ids)', { ids: download.collectionFileIds }).getMany()
	if (collectionFiles.length !== new Set(download.collectionFileIds).size) {
		throw new DownloadAccessError()
	}
	let recordList: Buffer | null = null
	if (download.recordExport) {
		const saved = download.recordExport
		let selection: Awaited<ReturnType<typeof resolveDownloadSelection>>
		try {
			selection = await resolveDownloadSelection(em, user, saved.items, false)
			recordExportColumns(selection, saved.columns, saved.format)
		} catch (error) {
			if (error instanceof TRPCError && ['BAD_REQUEST', 'FORBIDDEN', 'NOT_FOUND'].includes(error.code)) throw new DownloadAccessError()
			throw error
		}
		const positions = new Map(selection.recordIds.map((id, index) => [id, index]))
		if (saved.recordIds.some(id => !positions.has(id))) throw new DownloadAccessError()
		selection.rows = saved.recordIds.map(id => selection.rows[positions.get(id)!])
		selection.recordIds = saved.recordIds
		recordList = await buildRecordExport(selection, saved.columns, saved.format)
	}

	const workingDirectory = await mkdtemp(join(tmpdir(), `dam-asset-${randomUUID()}`))
	try {
		if (collectionFiles.length === 1 && !recordList) {
			const collectionFile = collectionFiles[0]
			const outputFile = await transformFile({ workingDirectory, download, assetFile: collectionFile.assetFile })
			await assetsS3().fPutObject(assetsS3Bucket(), download.storageKey, outputFile, {
				"Content-Disposition": `attachment; filename="${formatFileName(download, collectionFile.assetFile, null)}"`,
			})
		} else {
			const archive = new ZipArchive({ zlib: { level: 0 } })
			const archiveFile = join(workingDirectory, 'archive.zip')
			const archiveOutput = createWriteStream(archiveFile)
			const archiveWritten = finished(archiveOutput)
			archive.pipe(archiveOutput)
			await Throttle.all(collectionFiles.map((collectionFile) => async () => {
				const outputFile = await transformFile({ workingDirectory, download, assetFile: collectionFile.assetFile })
				if (collectionFile.collection) await em.getTreeRepository(Collection).findAncestorsTree(collectionFile.collection)
				archive.file(outputFile, {
					name: `export/${formatFileName(download, collectionFile.assetFile, collectionFile.collection)}`,
				})
			}), { maxInProgress: 25 })
			if (recordList && download.recordExport) archive.append(recordList, { name: `record-list.${download.recordExport.format}` })
			await archive.finalize()
			await archiveWritten
			await assetsS3().fPutObject(assetsS3Bucket(), download.storageKey, archiveFile, {
				'Content-Type': 'application/zip',
				'Content-Disposition': 'attachment; filename="download.zip"',
			})
		}
	} finally {
		rm(workingDirectory, { recursive: true, force: true })
			.catch((error) => logger.error('failed to remove download tempdir', { error }))
	}

	download.status = DownloadStatus.READY
	await em.getRepository(Download).save(download)
}

// Cloud storage names end up in a Content-Disposition header and in archive
// entry paths; Google Drive allows slashes, quotes and control characters in them.
export function safePathComponent(name: string): string {
	const cleaned = name.replace(/[\/\\"\u0000-\u001f\u007f]/g, '_').trim()
	return cleaned === '' || cleaned === '.' || cleaned === '..' ? '_' : cleaned
}

export function formatFileName(download: Download, assetFile: AssetFile, collection: Collection | null) {
	let filename = safePathComponent(assetFile.name)
	if (assetFile.mimeType.startsWith('image/') && download.imageFormat !== DownloadImageFormat.ORIGINAL) {
		const filenameParts = filename.split('.').slice(0, -1)
		filename = filenameParts.length > 0
			? `${filenameParts.join('.')}.${download.imageFormat}`
			: `${filename}.${download.imageFormat}`
	} else if (assetFile.mimeType.startsWith('video/') && download.videoFormat !== DownloadVideoFormat.ORIGINAL) {
		const filenameParts = filename.split('.').slice(0, -1)
		filename = filenameParts.length > 0
			? `${filenameParts.join('.')}.${download.videoFormat}`
			: `${filename}.${download.videoFormat}`
	}

	const path = [filename]
	for (let current = collection; current; current = current.parent) {
		path.push(safePathComponent(current.name))
	}
	return path.reverse().join('/')
}

export type TransformFileOptions = {
	workingDirectory: string
	download: Download
	assetFile: AssetFile
}

export async function transformFile({ workingDirectory, download, assetFile }: TransformFileOptions): Promise<string> {
	const sourcePath = join(workingDirectory, randomUUID())
	await assetsS3().fGetObject(assetsS3Bucket(), assetFile.originalStorageKey, sourcePath)
	if (assetFile.mimeType.startsWith('image/') && download.imageFormat !== DownloadImageFormat.ORIGINAL) {
		const destinationPath = `${sourcePath}.${download.imageFormat}`
		await transformImage({
			source: sourcePath,
			destination: destinationPath,
			format: download.imageFormat,
			resolution: download.imageResolution
		})
		return destinationPath
	} else if (assetFile.mimeType.startsWith('video/') && download.videoFormat !== DownloadVideoFormat.ORIGINAL) {
		const destinationPath = `${sourcePath}.${download.videoFormat}`
		await transformVideo({
			source: sourcePath,
			destination: destinationPath,
			format: download.videoFormat,
			resolution: download.videoResolution,
		})
		return destinationPath
	}
	return sourcePath
}

export type TransformImageOptions = {
	format: DownloadImageFormat
	resolution: DownloadImageResolution
	source: string
	destination: string
}

export async function transformImage({ format, resolution, source, destination }: TransformImageOptions) {
	let cmd = sharp(source)
	const quality = { [DownloadImageResolution.HIGH]: 100, [DownloadImageResolution.MEDIUM]: 70, [DownloadImageResolution.LOW]: 40 }[resolution]
	if (format === DownloadImageFormat.JPG) {
		cmd = cmd.jpeg({ quality })
	} else if (format === DownloadImageFormat.WEBP) {
		cmd = cmd.webp({ quality })
	} else if (format === DownloadImageFormat.PNG) {
		cmd = cmd.png({ quality })
	}
	await cmd.toFile(destination)
}

export type TransformVideoOptions = {
	format: DownloadVideoFormat
	resolution: DownloadVideoResolution
	source: string
	destination: string
}

export async function transformVideo({ format, resolution, source, destination }: TransformVideoOptions) {
	await new Promise((resolve, reject) => {
		ffmpeg(source)
			.videoCodec({ [DownloadVideoFormat.MP4]: 'libx264', [DownloadVideoFormat.WEBM]: 'libvpx' }[format])
			.size({
				[DownloadVideoResolution.HIGH]: '7680x?',
				[DownloadVideoResolution.MEDIUM]: '1920x?',
				[DownloadVideoResolution.LOW]: '720x?',
			}[resolution])
			.output(destination)
			.on('end', resolve)
			.on('error', reject)
			.run()
	})
}

export async function processExpiredDownloads() {
	const toProcess = await dataSource.getRepository(Download).findBy({
		status: Not(DownloadStatus.EXPIRED),
		expiresAt: LessThan(new Date())
	})
	for (const download of toProcess) {
		await assetsS3().removeObjects(assetsS3Bucket(), [download.storageKey])
		download.status = DownloadStatus.EXPIRED
		await dataSource.getRepository(Download).save(download)
	}
}

export type RemoveDownloadsOptions = {
	em: EntityManager
	downloads: Download[]
}

export async function removeDownloads({ em, downloads }: RemoveDownloadsOptions) {
	await assetsS3().removeObjects(assetsS3Bucket(), downloads.map((download) => download.storageKey))
	await em.getRepository(Download).remove(downloads)
}
