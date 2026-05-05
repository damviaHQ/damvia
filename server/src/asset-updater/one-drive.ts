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
import { AssetFolder } from "../entity/asset-folder"
import { tmpFile, upsertFile, upsertFolder } from "../services/asset"
import AssetUpdater from "./base"

export default class OneDriveAssetUpdater extends AssetUpdater {
	private readonly credential: ClientSecretCredential
	private readonly authProvider: TokenCredentialAuthenticationProvider
	private readonly graphClient: GraphClient

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

	async initialize() { }

	async fetchUpdates() {
		let nextLink = `/users/${this.user}/drive/${this.drive}/delta`
		const syncFolderIds: string[] = []
		const syncFileIds: string[] = []
		while (nextLink) {
			const res = await this.graphClient.api(nextLink).get() as PageCollection
			for (const item of res.value as DriveItem[]) {
				if (item.name.startsWith('.') || item.size === 0) {
					continue
				}

				const asset = await this.upsertItem(item)
				if (asset instanceof AssetFolder) {
					syncFolderIds.push(asset.id)
				} else if (asset instanceof AssetFile) {
					syncFileIds.push(asset.id)
				}
			}
			nextLink = res['@odata.nextLink']
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
			await removeFile(originalFilePath)
			throw error
		}
	}

	private async upsertItem(item: DriveItem): Promise<AssetFolder | AssetFile> {
		if (item.folder !== undefined) {
			return upsertFolder({
				externalId: item.id,
				parentExternalId: item.parentReference.id,
				name: item.name,
			})
		}

		return upsertFile({
			externalId: item.id,
			externalChecksum: item.eTag,
			folderExternalId: item.parentReference.id,
			name: item.name,
			size: item.size,
			mimeType: item.file.mimeType,
		})
	}
}
