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
import { auth, drive, drive_v3 } from '@googleapis/drive'
import { createWriteStream } from "node:fs"
import { rm as removeFile } from "node:fs/promises"
import { pipeline } from "node:stream/promises"
import { AssetFile } from "../entity/asset-file"
import { logger } from "../env"
import { tmpFile } from "../services/asset"
import AssetUpdater, { AssetSourceIdentity } from "./base"
import { DriveFileEntry, DriveRoot, FOLDER_MIME, planDriveFiles } from "./google-drive-items"

const FIELDS = 'id,name,mimeType,parents,size,md5Checksum,trashed'

export type GoogleDriveCredentials = { client_email: string, private_key: string }

export function parseServiceAccount(encoded: string): GoogleDriveCredentials {
	const raw = encoded.trim().startsWith('{') ? encoded : Buffer.from(encoded, 'base64').toString('utf-8')
	const parsed = JSON.parse(raw)
	if (typeof parsed.client_email !== 'string' || typeof parsed.private_key !== 'string') {
		throw new Error('GOOGLE_DRIVE_SERVICE_ACCOUNT must be the JSON key of a service account (client_email, private_key)')
	}
	return { client_email: parsed.client_email, private_key: parsed.private_key }
}

export default class GoogleDriveAssetUpdater extends AssetUpdater {
	private drive: drive_v3.Drive

	constructor(
		source: AssetSourceIdentity,
		credentials: GoogleDriveCredentials,
		private readonly folderId: string,
		impersonate?: string,
	) {
		super(source, 'Google Drive')
		const jwt = new auth.JWT({
			email: credentials.client_email,
			key: credentials.private_key,
			scopes: ['https://www.googleapis.com/auth/drive.readonly'],
			subject: impersonate || undefined,
		})
		this.drive = drive({ version: 'v3', auth: jwt })
	}

	async initialize() {
		try {
			const root = await this.rootFolder()
			logger.info('Google Drive folder', { folderId: root.id, name: root.name })
		} catch (error) {
			logger.error('Google Drive folder check failed, the sync will retry every run', { error: error.message })
		}
	}

	private async rootFolder(): Promise<DriveRoot> {
		const res = await this.drive.files.get({ fileId: this.folderId, fields: 'id,name,mimeType', supportsAllDrives: true })
		if (res.data.mimeType !== FOLDER_MIME || !res.data.id) {
			throw new Error(`GOOGLE_DRIVE_FOLDER_ID ${this.folderId} is not a folder`)
		}
		return { id: res.data.id, name: res.data.name ?? 'Drive' }
	}

	// Breadth-first listing from the pointed folder, one paginated query per folder.
	private async listAll(root: DriveRoot): Promise<DriveFileEntry[]> {
		const entries: DriveFileEntry[] = []
		const queue = [root.id]
		while (queue.length > 0) {
			const parentId = queue.shift()!
			let pageToken: string | undefined
			do {
				const res = await this.drive.files.list({
					q: `'${parentId.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}' in parents and trashed = false`,
					fields: `nextPageToken, files(${FIELDS})`,
					pageSize: 1000,
					pageToken,
					supportsAllDrives: true,
					includeItemsFromAllDrives: true,
				})
				for (const entry of res.data.files ?? []) {
					entries.push(entry)
					if (entry.mimeType === FOLDER_MIME && entry.id && entry.name && !entry.name.startsWith('.')) queue.push(entry.id)
				}
				pageToken = res.data.nextPageToken ?? undefined
			} while (pageToken)
		}
		return entries
	}

	async fetchUpdates() {
		const root = await this.rootFolder()
		const entries = await this.listAll(root)
		logger.info(`Fetched ${entries.length} entries from Google Drive`, { source: this.key })

		const plan = planDriveFiles(entries, root)
		entries.length = 0
		await this.applyPlan(plan)
	}

	async fetchFileContent(file: AssetFile): Promise<string> {
		const tempFilePath = await tmpFile()
		try {
			const res = await this.drive.files.get(
				{ fileId: file.externalId, alt: 'media', supportsAllDrives: true },
				{ responseType: 'stream' },
			)
			await pipeline(res.data as NodeJS.ReadableStream, createWriteStream(tempFilePath))
			return tempFilePath
		} catch (error) {
			await removeFile(tempFilePath, { force: true })
			throw error
		}
	}
}
