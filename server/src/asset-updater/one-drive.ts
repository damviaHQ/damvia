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
import { ClientSecretCredential } from '@azure/identity'
import { Client as GraphClient, PageCollection } from '@microsoft/microsoft-graph-client'
import {
	TokenCredentialAuthenticationProvider
} from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials'
import { DriveItem } from '@microsoft/microsoft-graph-types'
import { writeFile, rm as removeFile } from "node:fs/promises"
import { AssetFile } from "../entity/asset-file"
import { logger } from "../env"
import { tmpFile, upsertFile, upsertFolder } from "../services/asset"
import AssetUpdater from "./base"
import { planDriveItems } from "./one-drive-items"

export default class OneDriveAssetUpdater extends AssetUpdater {
	private readonly credential: ClientSecretCredential
	private readonly authProvider: TokenCredentialAuthenticationProvider
	private readonly graphClient: GraphClient
	private rootId: string | null = null

	constructor(
		private readonly tenantId: string,
		private readonly clientId: string,
		private readonly clientSecret: string,
		private readonly user: string,
		private readonly drive: string,
	) {
		super()
		this.credential = new ClientSecretCredential(this.tenantId, this.clientId, this.clientSecret)
		this.authProvider = new TokenCredentialAuthenticationProvider(this.credential, {
			scopes: ['https://graph.microsoft.com/.default'],
		})
		this.graphClient = GraphClient.initWithMiddleware({ authProvider: this.authProvider })
	}

	async initialize() {
		const root = await this.graphClient.api(`/users/${this.user}/drive/${this.drive}`).get() as DriveItem
		if (!root.id) throw new Error('OneDrive drive root without id')
		this.rootId = root.id
		logger.info('OneDrive drive', {
			user: this.user,
			drive: this.drive,
			rootId: root.id,
			rootName: root.name,
			childCount: root.folder?.childCount,
		})
	}

	async fetchUpdates() {
		if (!this.rootId) await this.initialize()
		const rootId = this.rootId!

		const items: DriveItem[] = []
		let nextLink: string | undefined = `/users/${this.user}/drive/${this.drive}/delta`
		while (nextLink) {
			const res = await this.graphClient.api(nextLink).get() as PageCollection
			items.push(...(res.value as DriveItem[]))
			nextLink = res['@odata.nextLink']
		}
		logger.info(`Fetched ${items.length} entries from OneDrive`)

		const plan = planDriveItems(items, rootId)
		if (plan.folders.length === 0 && plan.files.length === 0) {
			logger.warn('OneDrive listing is empty, skipping sync to avoid deleting all assets. Check ONEDRIVE_USER, ONEDRIVE_DRIVE and the application permissions.')
			return
		}

		const syncFolderIds: string[] = []
		const syncFileIds: string[] = []
		let failed = 0

		for (const folder of plan.folders) {
			try {
				syncFolderIds.push((await upsertFolder(folder)).id)
			} catch (error) {
				failed += 1
				logger.error('Error processing OneDrive folder', { error: error.message, stack: error.stack, entry: folder })
			}
		}

		for (const file of plan.files) {
			try {
				syncFileIds.push((await upsertFile(file)).id)
			} catch (error) {
				failed += 1
				logger.error('Error processing OneDrive file', { error: error.message, stack: error.stack, entry: file })
			}
		}

		if (failed > 0) {
			throw new Error(`${failed} OneDrive item(s) failed to sync, skipping the deletion pass`)
		}

		const [allAssetFolderIds, allAssetFileIds] = await Promise.all([
			this.getAllAssetFolderIds(),
			this.getAllAssetFileIds()
		])

		const assetFolderIdsToDelete = this.arrayDifference(allAssetFolderIds, syncFolderIds)
		const assetFileIdsToDelete = this.arrayDifference(allAssetFileIds, syncFileIds)

		await Promise.all([
			this.deleteAssetFoldersInBatches(assetFolderIdsToDelete),
			this.deleteAssetFilesInBatches(assetFileIdsToDelete)
		])
	}

	async fetchFileContent(file: AssetFile): Promise<string> {
		const originalFilePath = await tmpFile()
		try {
			const stream = await this.graphClient.api(`/users/${this.user}/drive/items/${file.externalId}/content`).getStream()
			await writeFile(originalFilePath, stream)
			return originalFilePath
		} catch (error) {
			await removeFile(originalFilePath, { force: true })
			throw error
		}
	}
}
