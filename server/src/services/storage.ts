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
import { Client as MinioClient } from "minio"
import { readdir, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { In } from "typeorm"
import { AssetFile, AssetFileStatus } from "../entity/asset-file"
import { Download, DownloadStatus } from "../entity/download"
import { StorageUsage } from "../entity/storage-usage"
import { assetsS3, assetsS3Bucket, dataSource, diskUsage, logger, mainS3, mainS3Bucket, serverAlertEmails, storageQuota } from "../env"
import { assetUpdateContentQueue } from "../worker"
import { sendDiskAlert, sendStorageAlert } from "./mailer"

const ALERT_LEVELS = [80, 90, 95, 100]
const ORPHAN_MINIMUM_AGE = 24 * 60 * 60 * 1000
const STALE_TEMP_AGE = 6 * 60 * 60 * 1000
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export class StorageQuotaExceededError extends Error {
	assetFileId: string
	size: number

	constructor(assetFileId: string, size: number) {
		super(`Storage quota exceeded (asset file id: ${assetFileId}, size: ${size}).`)
		this.name = 'StorageQuotaExceededError'
		this.assetFileId = assetFileId
		this.size = size
		Object.setPrototypeOf(this, StorageQuotaExceededError.prototype)
	}
}

type StoredObject = {
	name: string
	size: number
	lastModified: Date
}

function listBucket(client: MinioClient, bucket: string, prefix: string): Promise<StoredObject[]> {
	return new Promise((resolve, reject) => {
		const objects: StoredObject[] = []
		client.listObjects(bucket, prefix, true)
			.on('data', (item) => {
				if (item.name) {
					objects.push({ name: item.name, size: item.size, lastModified: item.lastModified })
				}
			})
			.on('error', reject)
			.on('end', () => resolve(objects))
	})
}

function sumBucket(client: MinioClient, bucket: string): Promise<number> {
	return new Promise((resolve, reject) => {
		let total = 0
		client.listObjects(bucket, '', true)
			.on('data', (item) => {
				total += item.size ?? 0
			})
			.on('error', reject)
			.on('end', () => resolve(total))
	})
}

export function formatBytes(bytes: number): string {
	const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
	let value = bytes
	let unit = 0
	while (value >= 1000 && unit < units.length - 1) {
		value /= 1000
		unit += 1
	}
	return `${unit === 0 ? value : value.toFixed(1)} ${units[unit]}`
}

export async function measureStorageUsage(): Promise<{ usedBytes: number, retriedAssets: number }> {
	const [assetsBytes, mainBytes] = await Promise.all([
		sumBucket(assetsS3(), assetsS3Bucket()),
		sumBucket(mainS3(), mainS3Bucket()),
	])
	const usedBytes = assetsBytes + mainBytes
	const repository = dataSource.getRepository(StorageUsage)
	const previous = await repository.findOneByOrFail({ id: 1 })
	await dataSource.query(`
		UPDATE storage_usage
		SET used_bytes = $1, measured_at = now(),
			reserved_bytes = CASE
				WHEN EXISTS (SELECT 1 FROM pgboss.job WHERE name = 'asset/update-content' AND state = 'active')
				THEN reserved_bytes ELSE 0 END
		WHERE id = 1
	`, [usedBytes])

	const disk = await diskUsage()
	const diskPercent = (disk.totalBytes - disk.freeBytes) / disk.totalBytes * 100
	const diskLevel = ALERT_LEVELS.filter((threshold) => diskPercent >= threshold).pop() ?? 0
	if (diskLevel > previous.diskAlertLevel) {
		const [, claimed] = await dataSource.query(`UPDATE storage_usage SET disk_alert_level = $1 WHERE id = 1 AND disk_alert_level < $1`, [diskLevel])
		if (claimed) {
			const sent = await sendDiskAlert(diskLevel, { ...disk, percent: diskPercent }).catch(async (error) => {
				await dataSource.query(`UPDATE storage_usage SET disk_alert_level = $1 WHERE id = 1 AND disk_alert_level = $2`, [previous.diskAlertLevel, diskLevel])
				throw error
			})
			if (!sent) {
				await dataSource.query(`UPDATE storage_usage SET disk_alert_level = $1 WHERE id = 1 AND disk_alert_level = $2`, [previous.diskAlertLevel, diskLevel])
			}
		}
	} else if (diskPercent < previous.diskAlertLevel - 2) {
		await repository.update({ id: 1 }, { diskAlertLevel: diskLevel })
	}

	const quota = storageQuota()
	let retriedAssets = 0
	if (previous.quotaReachedAt && (quota === null || usedBytes < quota)) {
		const [, resumed] = await dataSource.query(`UPDATE storage_usage SET quota_reached_at = NULL WHERE id = 1 AND quota_reached_at IS NOT NULL`)
		if (resumed) {
			retriedAssets = await retryPendingAssets()
			logger.info('storage.quota-recovered', { usedBytes, quotaBytes: quota, retriedAssets })
		}
	}

	if (quota === null) {
		await repository.update({ id: 1 }, { alertLevel: 0 })
		logger.info('storage.measured', { usedBytes, diskFreeBytes: disk.freeBytes, diskTotalBytes: disk.totalBytes })
		return { usedBytes, retriedAssets }
	}

	const percent = usedBytes / quota * 100
	const level = ALERT_LEVELS.filter((threshold) => percent >= threshold).pop() ?? 0
	if (level > previous.alertLevel) {
		const [, claimed] = await dataSource.query(`UPDATE storage_usage SET alert_level = $1 WHERE id = 1 AND alert_level < $1`, [level])
		if (claimed) {
			const sent = await sendStorageAlert(level, { usedBytes, quotaBytes: quota, percent }).catch(async (error) => {
				await dataSource.query(`UPDATE storage_usage SET alert_level = $1 WHERE id = 1 AND alert_level = $2`, [previous.alertLevel, level])
				throw error
			})
			if (!sent) {
				await dataSource.query(`UPDATE storage_usage SET alert_level = $1 WHERE id = 1 AND alert_level = $2`, [previous.alertLevel, level])
			}
		}
	} else if (percent < previous.alertLevel - 2) {
		await repository.update({ id: 1 }, { alertLevel: level })
	}

	logger.info('storage.measured', { usedBytes, quotaBytes: quota, percent: Math.round(percent), diskFreeBytes: disk.freeBytes, diskTotalBytes: disk.totalBytes })
	return { usedBytes, retriedAssets }
}

export async function reserveStorage(bytes: number): Promise<boolean> {
	const quota = storageQuota()
	if (quota === null) {
		return true
	}
	const [, reserved] = await dataSource.query(`
		UPDATE storage_usage SET reserved_bytes = reserved_bytes + $1
		WHERE id = 1 AND used_bytes + reserved_bytes + $1 <= $2
	`, [bytes, quota])
	if (!reserved) {
		await dataSource.query(`UPDATE storage_usage SET quota_reached_at = coalesce(quota_reached_at, now()) WHERE id = 1`)
		return false
	}
	return true
}

export async function commitStorage(bytes: number): Promise<void> {
	await dataSource.query(`
		UPDATE storage_usage SET used_bytes = used_bytes + $1, reserved_bytes = GREATEST(reserved_bytes - $1, 0)
		WHERE id = 1
	`, [bytes])
}

export async function releaseStorage(bytes: number): Promise<void> {
	if (storageQuota() === null) {
		return
	}
	await dataSource.query(`UPDATE storage_usage SET reserved_bytes = GREATEST(reserved_bytes - $1, 0) WHERE id = 1`, [bytes])
}

export async function retryPendingAssets(): Promise<number> {
	const files = await dataSource.getRepository(AssetFile).find({
		select: { id: true },
		where: { status: In([AssetFileStatus.CREATING, AssetFileStatus.OUTDATED]) },
	})
	if (files.length > 0) {
		await assetUpdateContentQueue.bulkPush(files.map((file) => ({ data: { assetFileId: file.id } })))
	}
	return files.length
}

export async function getStorageStatus(viewerEmail: string) {
	const usage = await dataSource.getRepository(StorageUsage).findOneByOrFail({ id: 1 })
	const quotaBytes = storageQuota()
	const usedBytes = Number(usage.usedBytes)
	let disk = null
	if (serverAlertEmails().includes(viewerEmail.toLowerCase())) {
		disk = {
			...await diskUsage(),
			blockedFiles: usage.quotaReachedAt
				? await dataSource.getRepository(AssetFile).countBy({ status: In([AssetFileStatus.CREATING, AssetFileStatus.OUTDATED]) })
				: 0,
			orphanObjects: usage.orphanObjects,
			orphanBytes: Number(usage.orphanBytes),
			orphansRemovedAt: usage.orphansRemovedAt,
		}
	}
	return {
		usedBytes,
		quotaBytes,
		percent: quotaBytes === null ? null : usedBytes / quotaBytes * 100,
		measuredAt: usage.measuredAt,
		alertLevel: usage.alertLevel,
		quotaReachedAt: usage.quotaReachedAt,
		serverContactEmails: serverAlertEmails(),
		disk,
	}
}

async function existingIds(table: 'asset_files' | 'downloads', ids: string[]): Promise<Map<string, string | null>> {
	const found = new Map<string, string | null>()
	for (let index = 0; index < ids.length; index += 5000) {
		const chunk = ids.slice(index, index + 5000)
		const rows: { id: string, status: string | null }[] = table === 'downloads'
			? await dataSource.query(`SELECT id, status FROM downloads WHERE id = ANY($1::uuid[])`, [chunk])
			: await dataSource.query(`SELECT id, NULL AS status FROM asset_files WHERE id = ANY($1::uuid[])`, [chunk])
		rows.forEach((row) => found.set(row.id, row.status))
	}
	return found
}

export async function removeOrphanObjects(): Promise<{ count: number, bytes: number }> {
	const oldEnough = Date.now() - ORPHAN_MINIMUM_AGE
	const [assetObjects, downloadObjects] = await Promise.all([
		listBucket(assetsS3(), assetsS3Bucket(), 'asset-file/'),
		listBucket(assetsS3(), assetsS3Bucket(), 'downloads/'),
	])

	const assetIdOf = (name: string) => name.slice('asset-file/'.length).replace(/-thumbnail$/, '')
	const assetIds = Array.from(new Set(assetObjects.map((object) => assetIdOf(object.name)).filter((id) => UUID_PATTERN.test(id))))
	const downloadIds = Array.from(new Set(downloadObjects.map((object) => object.name.slice('downloads/'.length)).filter((id) => UUID_PATTERN.test(id))))
	const [assetRows, downloadRows] = await Promise.all([existingIds('asset_files', assetIds), existingIds('downloads', downloadIds)])

	const orphans: StoredObject[] = []
	assetObjects.forEach((object) => {
		const id = assetIdOf(object.name)
		if (UUID_PATTERN.test(id) && object.lastModified.getTime() < oldEnough && !assetRows.has(id)) {
			orphans.push(object)
		}
	})
	downloadObjects.forEach((object) => {
		const id = object.name.slice('downloads/'.length)
		const status = downloadRows.get(id)
		const gone = status === undefined || status === DownloadStatus.EXPIRED || status === DownloadStatus.FAILED
		if (UUID_PATTERN.test(id) && object.lastModified.getTime() < oldEnough && gone) {
			orphans.push(object)
		}
	})

	const bytes = orphans.reduce((total, object) => total + object.size, 0)
	if (orphans.length > 0) {
		await assetsS3().removeObjects(assetsS3Bucket(), orphans.map((object) => object.name))
	}
	await dataSource.getRepository(StorageUsage).update({ id: 1 }, {
		orphanObjects: orphans.length,
		orphanBytes: bytes.toString(),
		orphansRemovedAt: new Date(),
	})
	logger.info('storage.orphans-removed', { count: orphans.length, bytes })
	return { count: orphans.length, bytes }
}

export async function cleanStaleTempDirectories(): Promise<void> {
	const oldEnough = Date.now() - STALE_TEMP_AGE
	const entries = await readdir(tmpdir()).catch((error) => {
		logger.warn('storage.temp-cleanup-failed', { error: error.message })
		return [] as string[]
	})
	for (const entry of entries) {
		if (!entry.startsWith('dam-asset')) {
			continue
		}
		const path = join(tmpdir(), entry)
		try {
			const details = await stat(path)
			if (details.isDirectory() && details.mtimeMs < oldEnough) {
				await rm(path, { recursive: true, force: true })
				logger.info('storage.temp-removed', { path })
			}
		} catch (error) {
			logger.warn('storage.temp-cleanup-failed', { path, error: error.message })
		}
	}
}
