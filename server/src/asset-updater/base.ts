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
import { In, IsNull, Not } from "typeorm"
import { dataSource, logger } from "../env"
import { AssetFile, AssetFileStatus } from "../entity/asset-file"
import { AssetFolder, AssetFolderStatus } from "../entity/asset-folder"
import { upsertFile, upsertFolder, UpsertFileOptions, UpsertFolderOptions } from "../services/asset"

export type AssetSourceIdentity = {
	// Permanent: every folder and file is stamped with it. Renaming it orphans
	// the rows unless the CLI moves them (rename-source).
	key: string
	// Optional name for the top-level folder, shown to users instead of the
	// cloud folder's own name. Free to change.
	label?: string
	// The pointed folder as written in the configuration, for the dashboard.
	root?: string
}

export type AssetPlan = {
	folders: UpsertFolderOptions[]
	files: UpsertFileOptions[]
}

export default class AssetUpdater {
	readonly key: string
	readonly label: string | undefined
	readonly root: string

	constructor(source: AssetSourceIdentity, readonly providerName: string) {
		this.key = source.key
		this.label = source.label
		this.root = source.root ?? ''
	}

	async initialize() {
		throw new Error('Unimplemented')
	}

	async fetchUpdates() {
		throw new Error('Unimplemented')
	}

	async fetchFileContent(file: AssetFile): Promise<string> {
		throw new Error('Unimplemented')
	}

	// Writes a listing plan for this source: folders parents-first, then files,
	// each on its own so one bad item never aborts the run. Anything of this
	// source that the listing no longer contains is marked for deletion, but
	// only when every item was written and only within this source.
	protected async applyPlan(plan: AssetPlan, write: <T>(fn: () => Promise<T>) => Promise<T> = (fn) => fn()) {
		if (plan.folders.length === 0 && plan.files.length === 0) {
			logger.warn(`${this.providerName} listing of source ${this.key} is empty, skipping sync to avoid deleting all its assets. Check the account, the permissions and the root.`)
			return
		}

		for (const folder of plan.folders) {
			folder.sourceKey = this.key
			if (folder.parentExternalId === '' && this.label) folder.name = this.label
		}
		for (const file of plan.files) file.sourceKey = this.key
		await this.refuseSharedTopLevelName(plan.folders)

		const syncFolderIds: string[] = []
		const syncFileIds: string[] = []
		let failed = 0

		for (const folder of plan.folders) {
			try {
				syncFolderIds.push((await write(() => upsertFolder(folder))).id)
			} catch (error) {
				failed += 1
				logger.error(`Error processing ${this.providerName} folder`, { source: this.key, error: error.message, stack: error.stack, entry: folder })
			}
		}

		for (const file of plan.files) {
			try {
				syncFileIds.push((await write(() => upsertFile(file))).id)
			} catch (error) {
				failed += 1
				logger.error(`Error processing ${this.providerName} file`, { source: this.key, error: error.message, stack: error.stack, entry: file })
			}
		}

		if (failed > 0) {
			throw new Error(`${failed} ${this.providerName} item(s) failed to sync (source ${this.key}), skipping the deletion pass`)
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

	// Two sources showing the same top-level folder name would be
	// indistinguishable in the library, so one of them needs a label.
	private async refuseSharedTopLevelName(folders: UpsertFolderOptions[]) {
		for (const folder of folders) {
			if (folder.parentExternalId !== '') continue
			const other = await dataSource.getRepository(AssetFolder).findOne({
				where: { name: folder.name, parentId: IsNull(), sourceKey: Not(this.key), status: AssetFolderStatus.UP_TO_DATE },
				select: { id: true, sourceKey: true },
			})
			if (other) {
				throw new Error(`Top-level folder "${folder.name}" of source ${this.key} has the same name as the top-level folder of source ${other.sourceKey || '(unassigned)'}, set a label on one of them`)
			}
		}
	}

	protected async getAllAssetFolderIds(): Promise<string[]> {
		const result = await dataSource.getRepository(AssetFolder)
			.createQueryBuilder('folder')
			.select('folder.id')
			.where('folder.source_key = :key', { key: this.key })
			.getRawMany()

		return result.map(row => row.folder_id)
	}

	protected async getAllAssetFileIds(): Promise<string[]> {
		const result = await dataSource.getRepository(AssetFile)
			.createQueryBuilder('file')
			.select('file.id')
			.where('file.source_key = :key', { key: this.key })
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
