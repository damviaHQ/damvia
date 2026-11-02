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
import { Readable } from "node:stream"
import sharp from "sharp"
import { ActivityEvent, ActivityEventType } from "../entity/activity-event"
import { User } from "../entity/user"
import { assetsS3, assetsS3Bucket, dataSource, logger } from "../env"
import { userCollectionFilesQuery } from "../services/collection"

// The pictures an assistant looks at: the previews the library already
// shows, never the originals. Looking at a preview grants nothing and needs
// no licence acceptance, as in the web interface; access follows the same
// rules as the preview there, licence dates and regions included.

export const MAX_SEPARATE_IMAGES = 10
export const MAX_SHEET_IMAGES = 16
const SHEET_CELL = 256
const SHEET_COLUMNS = 4

export type Preview = { fileId: string, name: string, image: Buffer | null }

async function readThumbnail(key: string): Promise<Buffer | null> {
	try {
		const stream = await assetsS3().getObject(assetsS3Bucket(), key) as Readable
		const chunks: Buffer[] = []
		for await (const chunk of stream) chunks.push(Buffer.from(chunk))
		return Buffer.concat(chunks)
	} catch (error) {
		logger.warn('mcp.preview-missing', { key, code: (error as { code?: string }).code })
		return null
	}
}

// The previews of the files the person may open, in the order asked. A file
// they cannot open is left out, as if it did not exist.
export async function previewsFor(user: User, collectionFileIds: string[], size: number): Promise<Preview[]> {
	const ids = [...new Set(collectionFileIds)]
	if (!ids.length) return []
	const files = await userCollectionFilesQuery(user).andWhere('collection_file.id IN (:...ids)', { ids }).getMany()
	const byId = new Map(files.map((file) => [file.id, file]))
	const previews: Preview[] = []
	for (const id of ids) {
		const file = byId.get(id)
		if (!file) continue
		const raw = file.assetFile.hasThumbnail ? await readThumbnail(file.assetFile.thumbnailStorageKey) : null
		const image = raw ? await sharp(raw).rotate().resize(size, size, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer().catch(() => null) : null
		previews.push({ fileId: id, name: file.assetFile.name, image })
	}
	if (files.length) {
		await dataSource.getRepository(ActivityEvent).insert(files.map((file) => ({
			userId: user.id, type: ActivityEventType.ASSET_VIEW, assetFileId: file.assetFileId, collectionId: file.collectionId, metadata: { channel: 'mcp' },
		})))
	}
	return previews
}

// One picture holding up to 16 numbered previews, so an assistant can sort
// many candidates for the cost of one image.
export async function contactSheet(previews: Preview[]): Promise<Buffer> {
	const rows = Math.max(1, Math.ceil(previews.length / SHEET_COLUMNS))
	const cells = await Promise.all(previews.map(async (preview, index) => {
		const left = (index % SHEET_COLUMNS) * SHEET_CELL
		const top = Math.floor(index / SHEET_COLUMNS) * SHEET_CELL
		const picture = preview.image
			? await sharp(preview.image).resize(SHEET_CELL - 8, SHEET_CELL - 8, { fit: 'contain', background: '#ffffff' }).toBuffer()
			: await sharp({ create: { width: SHEET_CELL - 8, height: SHEET_CELL - 8, channels: 3, background: '#e5e7eb' } }).png().toBuffer()
		const label = Buffer.from(`<svg width="40" height="28"><rect width="40" height="28" fill="#00052f"/><text x="20" y="20" font-family="sans-serif" font-size="18" fill="#ffffff" text-anchor="middle">${index + 1}</text></svg>`)
		return [
			{ input: picture, left: left + 4, top: top + 4 },
			{ input: label, left: left + 4, top: top + 4 },
		]
	}))
	return sharp({ create: { width: SHEET_COLUMNS * SHEET_CELL, height: rows * SHEET_CELL, channels: 3, background: '#ffffff' } })
		.composite(cells.flat())
		.jpeg({ quality: 80 })
		.toBuffer()
}
