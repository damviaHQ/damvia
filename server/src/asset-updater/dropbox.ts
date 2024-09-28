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
import { Dropbox, DropboxAuth, files } from 'dropbox'
import { writeFile } from "fs/promises"
import { lookup } from 'mime-types'
import path from 'path'
import { In, Not } from "typeorm"
import { AssetFile, AssetFileStatus } from "../entity/asset-file"
import { AssetFolder, AssetFolderStatus } from "../entity/asset-folder"
import { dataSource, logger } from "../env"
import { tmpFile, upsertFile, upsertFolder } from "../services/asset"
import AssetUpdater from "./base"

export default class DropboxAssetUpdater extends AssetUpdater {
  private client: Dropbox
  private auth: DropboxAuth

  constructor(
    private readonly appKey: string,
    private readonly appSecret: string,
    private readonly refreshToken: string,
  ) {
    super()
    this.auth = new DropboxAuth({
      clientId: this.appKey,
      clientSecret: this.appSecret,
      refreshToken: this.refreshToken,
    })
    this.client = new Dropbox({ auth: this.auth })
  }

  async initialize() {
    try {
      await this.auth.refreshAccessToken()
      logger.info('Dropbox token refreshed successfully')
    } catch (error) {
      logger.error('Failed to refresh Dropbox token', { error })
      throw error
    }
  }

  async fetchUpdates() {
    let cursor: string | undefined = undefined
    const syncFolderIds: string[] = []
    const syncFileIds: string[] = []

    try {
      do {
        const response = await this.client.filesListFolder({
          path: '',
          recursive: true,
          include_deleted: false,
          ...(cursor ? { cursor } : {}),
        })

        logger.info(`Fetched ${response.result.entries.length} entries from Dropbox`)

        for (const entry of response.result.entries) {
          if (entry.name.startsWith('.')) {
            continue
          }

          try {
            if ('id' in entry) {
              const asset = await this.upsertItem(entry)
              if (asset instanceof AssetFolder) {
                syncFolderIds.push(asset.id)
              } else if (asset instanceof AssetFile) {
                syncFileIds.push(asset.id)
              }
            }
          } catch (itemError) {
            logger.error('Error processing Dropbox item', {
              error: itemError.message,
              stack: itemError.stack,
              entry
            })
          }
        }

        cursor = response.result.has_more ? response.result.cursor : undefined
      } while (cursor)

      await dataSource.getRepository(AssetFolder).update(
        { id: Not(In(syncFolderIds)) },
        { status: AssetFolderStatus.PENDING_DELETION }
      )
      await dataSource.getRepository(AssetFile).update(
        { id: Not(In(syncFileIds)) },
        { status: AssetFileStatus.PENDING_DELETION }
      )
    } catch (error) {
      if (error.status === 401) {
        logger.warn('Dropbox token expired, attempting to refresh')
        await this.initialize()
        return this.fetchUpdates()
      }
      logger.error('Failed to update Dropbox assets', {
        error: error.message,
        stack: error.stack
      })
      throw error
    }
  }

  async fetchFileContent(file: AssetFile): Promise<string> {
    try {
      const response = await this.client.filesDownload({ path: file.externalId })
      const fileContent = (response.result as any).fileBinary
      const tempFilePath = await tmpFile()
      await writeFile(tempFilePath, fileContent)
      return tempFilePath
    } catch (error) {
      if (error.status === 401) {
        logger.warn('Dropbox token expired, attempting to refresh')
        await this.initialize()
        return this.fetchFileContent(file)
      }
      throw error
    }
  }

  private async upsertItem(entry: files.FileMetadataReference | files.FolderMetadataReference): Promise<AssetFolder | AssetFile> {
    if (entry['.tag'] === 'folder') {
      return this.upsertFolder(entry as files.FolderMetadataReference)
    } else {
      return this.upsertFile(entry as files.FileMetadataReference)
    }
  }

  private async upsertFolder(entry: files.FolderMetadataReference): Promise<AssetFolder> {
    const folderPath = entry.path_lower || ''
    const folderName = path.basename(folderPath)
    const parentPath = path.dirname(folderPath)

    let parentFolder: AssetFolder | null = null
    if (parentPath !== '/') {
      parentFolder = await this.ensureFolderExists(parentPath)
    }

    return upsertFolder({
      externalId: entry.id,
      parentExternalId: parentFolder?.externalId || '',
      name: folderName,
    })
  }

  private async upsertFile(entry: files.FileMetadataReference): Promise<AssetFile> {
    const fileName = entry.name
    const filePath = entry.path_lower || ''
    const folderPath = path.dirname(filePath)
    const folder = await this.ensureFolderExists(folderPath)

    return upsertFile({
      externalId: entry.id,
      externalChecksum: (entry as files.FileMetadata).content_hash,
      folderExternalId: folder.externalId,
      name: fileName,
      size: (entry as files.FileMetadata).size,
      mimeType: lookup(fileName) || 'application/octet-stream',
    })
  }

  private async ensureFolderExists(folderPath: string): Promise<AssetFolder> {
    const folderName = path.basename(folderPath)
    const parentPath = path.dirname(folderPath)

    let parentFolder: AssetFolder | null = null
    if (parentPath !== '/') {
      parentFolder = await this.ensureFolderExists(parentPath)
    }

    const existingFolder = await dataSource.getRepository(AssetFolder).findOne({
      where: {
        name: folderName,
        parent: parentFolder ? { id: parentFolder.id } : null
      },
    })

    if (existingFolder) {
      return existingFolder
    }

    return upsertFolder({
      externalId: `generated_${folderPath}`,
      parentExternalId: parentFolder?.externalId || '',
      name: folderName,
    })
  }
}