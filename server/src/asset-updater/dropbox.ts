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
import { Dropbox, DropboxAuth } from 'dropbox'
import { rm as removeFile, writeFile } from "node:fs/promises"
import { AssetFile } from "../entity/asset-file"
import { logger } from "../env"
import { tmpFile, upsertFile, upsertFolder } from "../services/asset"
import AssetUpdater from "./base"
import { DropboxEntry, DropboxRoot, planDropboxEntries, WHOLE_DROPBOX_ROOT } from "./dropbox-entries"

const isUnauthorized = (error: any) => error?.status === 401

async function retryOnDeadlock<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
	for (let attempt = 1; ; attempt++) {
		try {
			return await fn()
		} catch (error) {
			if (attempt >= attempts || !String(error?.message).includes('deadlock detected')) throw error
			await new Promise((resolve) => setTimeout(resolve, 500 * attempt))
		}
	}
}

export default class DropboxAssetUpdater extends AssetUpdater {
	private client: Dropbox
	private auth: DropboxAuth
	private readonly rootPath: string

	constructor(
		private readonly appKey: string,
		private readonly appSecret: string,
		private readonly refreshToken: string,
		private readonly useTeamRoot = false,
		rootPath = '',
	) {
		super()
		this.auth = new DropboxAuth({
			clientId: this.appKey,
			clientSecret: this.appSecret,
			refreshToken: this.refreshToken,
		})
		this.client = new Dropbox({ auth: this.auth })
		const trimmed = rootPath.trim().replace(/\/+$/, '')
		this.rootPath = trimmed === '' || trimmed === '/' ? '' : (trimmed.startsWith('/') ? trimmed : `/${trimmed}`)
	}

	async initialize() {
		try {
			await this.auth.refreshAccessToken()
			logger.info('Dropbox token refreshed successfully')
		} catch (error) {
			logger.error('Failed to refresh Dropbox token', { error })
			throw error
		}

		const account = await this.client.usersGetCurrentAccount()
		const rootInfo = account.result.root_info
		logger.info('Dropbox account', {
			email: account.result.email,
			rootType: rootInfo['.tag'],
			rootNamespaceId: rootInfo.root_namespace_id,
			homeNamespaceId: rootInfo.home_namespace_id,
			rootPath: this.rootPath || '/',
		})

		if (this.useTeamRoot && rootInfo.root_namespace_id !== rootInfo.home_namespace_id) {
			this.client = new Dropbox({
				auth: this.auth,
				pathRoot: JSON.stringify({ '.tag': 'root', root: rootInfo.root_namespace_id }),
			})
			logger.info('Dropbox listing team root namespace')
		}
	}

	// One token refresh per call: a second 401 is a real credential problem.
	private async withFreshToken<T>(fn: () => Promise<T>): Promise<T> {
		try {
			return await fn()
		} catch (error) {
			if (!isUnauthorized(error)) throw error
			logger.warn('Dropbox token expired, refreshing once')
			await this.initialize()
			return fn()
		}
	}

	private async listAll(): Promise<DropboxEntry[]> {
		const entries: DropboxEntry[] = []
		let response = await this.withFreshToken(() => this.client.filesListFolder({ path: this.rootPath, recursive: true, include_deleted: false }))
		entries.push(...(response.result.entries as DropboxEntry[]))
		while (response.result.has_more) {
			const cursor = response.result.cursor
			response = await this.withFreshToken(() => this.client.filesListFolderContinue({ cursor }))
			entries.push(...(response.result.entries as DropboxEntry[]))
		}
		return entries
	}

	private async rootFolder(): Promise<DropboxRoot> {
		if (!this.rootPath) return WHOLE_DROPBOX_ROOT
		const meta = await this.withFreshToken(() => this.client.filesGetMetadata({ path: this.rootPath }))
		const folder = meta.result as DropboxEntry
		if (folder['.tag'] !== 'folder' || !folder.id || !folder.path_lower) throw new Error(`DROPBOX_ROOT_PATH ${this.rootPath} is not a folder`)
		return { id: folder.id, name: folder.name, path_lower: folder.path_lower }
	}

	async fetchUpdates() {
		const [entries, root] = await Promise.all([this.listAll(), this.rootFolder()])
		logger.info(`Fetched ${entries.length} entries from Dropbox`)

		const plan = planDropboxEntries(entries, root)
		if (plan.folders.length === 0 && plan.files.length === 0) {
			logger.warn('Dropbox listing is empty, skipping sync to avoid deleting all assets. Check the app permission type, the account, DROPBOX_USE_TEAM_ROOT and DROPBOX_ROOT_PATH.')
			return
		}

		const syncFolderIds: string[] = []
		const syncFileIds: string[] = []
		let failed = 0

		for (const folder of plan.folders) {
			try {
				syncFolderIds.push((await retryOnDeadlock(() => upsertFolder(folder))).id)
			} catch (error) {
				failed += 1
				logger.error('Error processing Dropbox folder', { error: error.message, stack: error.stack, entry: folder })
			}
		}

		for (const file of plan.files) {
			try {
				syncFileIds.push((await retryOnDeadlock(() => upsertFile(file))).id)
			} catch (error) {
				failed += 1
				logger.error('Error processing Dropbox file', { error: error.message, stack: error.stack, entry: file })
			}
		}

		if (failed > 0) {
			throw new Error(`${failed} Dropbox item(s) failed to sync, skipping the deletion pass`)
		}

		const [allAssetFolderIds, allAssetFileIds] = await Promise.all([
			this.getAllAssetFolderIds(),
			this.getAllAssetFileIds()
		])

		await Promise.all([
			this.deleteAssetFoldersInBatches(this.arrayDifference(allAssetFolderIds, syncFolderIds)),
			this.deleteAssetFilesInBatches(this.arrayDifference(allAssetFileIds, syncFileIds))
		])
	}

	async fetchFileContent(file: AssetFile): Promise<string> {
		const tempFilePath = await tmpFile()
		try {
			const response = await this.withFreshToken(() => this.client.filesDownload({ path: file.externalId }))
			await writeFile(tempFilePath, (response.result as any).fileBinary)
			return tempFilePath
		} catch (error) {
			await removeFile(tempFilePath, { force: true })
			throw error
		}
	}
}
