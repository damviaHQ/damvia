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
import { In } from "typeorm"
import { dataSource } from "../env"
import { AssetFile, AssetFileStatus } from "../entity/asset-file"
import { AssetFolder, AssetFolderStatus } from "../entity/asset-folder"

export default class AssetUpdater {
	async initialize() {
		throw new Error('Unimplemented')
	}

	async fetchUpdates() {
		throw new Error('Unimplemented')
	}

	async fetchFileContent(file: AssetFile): Promise<string> {
		throw new Error('Unimplemented')
	}

	protected async getAllAssetFolderIds(): Promise<string[]> {
		const result = await dataSource.getRepository(AssetFolder)
			.createQueryBuilder('folder')
			.select('folder.id')
			.getRawMany()

		return result.map(row => row.folder_id)
	}

	protected async getAllAssetFileIds(): Promise<string[]> {
		const result = await dataSource.getRepository(AssetFile)
			.createQueryBuilder('file')
			.select('file.id')
			.getRawMany()

		return result.map(row => row.file_id)
	}

	protected arrayDifference(allIds: string[], keepIds: string[]): string[] {
		const keepSet = new Set(keepIds)
		return allIds.filter(id => !keepSet.has(id))
	}

	protected async deleteAssetFoldersInBatches(idsToDelete: string[], batchSize: number = 1000): Promise<void> {
		for (let i = 0; i < idsToDelete.length; i += batchSize) {
			const batch = idsToDelete.slice(i, i + batchSize)
			await dataSource.getRepository(AssetFolder).update(
				{ id: In(batch) },
				{ status: AssetFolderStatus.PENDING_DELETION }
			)
		}
	}

	protected async deleteAssetFilesInBatches(idsToDelete: string[], batchSize: number = 1000): Promise<void> {
		for (let i = 0; i < idsToDelete.length; i += batchSize) {
			const batch = idsToDelete.slice(i, i + batchSize)
			await dataSource.getRepository(AssetFile).update(
				{ id: In(batch) },
				{ status: AssetFileStatus.PENDING_DELETION }
			)
		}
	}
}
