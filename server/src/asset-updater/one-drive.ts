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
import { tmpFile } from "../services/asset"
import AssetUpdater, { AssetSourceIdentity } from "./base"
import { planDriveItems } from "./one-drive-items"

export default class OneDriveAssetUpdater extends AssetUpdater {
	private readonly credential: ClientSecretCredential
	private readonly authProvider: TokenCredentialAuthenticationProvider
	private readonly graphClient: GraphClient

	constructor(
		source: AssetSourceIdentity,
		private readonly tenantId: string,
		private readonly clientId: string,
		private readonly clientSecret: string,
		private readonly user: string,
		private readonly drive: string,
	) {
		super(source, 'OneDrive')
		this.credential = new ClientSecretCredential(this.tenantId, this.clientId, this.clientSecret)
		this.authProvider = new TokenCredentialAuthenticationProvider(this.credential, {
			scopes: ['https://graph.microsoft.com/.default'],
		})
		this.graphClient = GraphClient.initWithMiddleware({ authProvider: this.authProvider })
	}

	async initialize() {
		try {
			const root = await this.graphClient.api(`/users/${this.user}/drive/${this.drive}`).get() as DriveItem
			logger.info('OneDrive drive', {
				user: this.user,
				drive: this.drive,
				rootId: root.id,
				rootName: root.name,
				childCount: root.folder?.childCount,
			})
		} catch (error) {
			logger.error('OneDrive drive check failed, the sync will retry every run', { error: error.message })
		}
	}

	async fetchUpdates() {
		const items: DriveItem[] = []
		let nextLink: string | undefined = `/users/${this.user}/drive/${this.drive}/delta`
		while (nextLink) {
			const res = await this.graphClient.api(nextLink).get() as PageCollection
			items.push(...(res.value as DriveItem[]))
			nextLink = res['@odata.nextLink']
		}
		logger.info(`Fetched ${items.length} entries from OneDrive`, { source: this.key })

		const plan = planDriveItems(items)
		items.length = 0
		await this.applyPlan(plan)
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
