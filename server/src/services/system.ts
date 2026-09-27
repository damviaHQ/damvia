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
import {In, Not} from "typeorm";
import {AssetFile, AssetFileStatus } from "../entity/asset-file";
import {assetsS3, assetsS3Bucket, dataSource, logger} from "../env";
import {assetUpdateContentQueue} from "../worker";
import {recomputeCollectionRollups} from "./collection";
import {removeOrphanObjects} from "./storage";

export async function integrityCheck() {
	// Files waiting for deletion must not be revived, and only the columns the comparison needs are loaded.
	const assetFiles = await dataSource.getRepository(AssetFile).find({
		select: { id: true, size: true, status: true },
		where: { status: Not(AssetFileStatus.PENDING_DELETION) },
	})
	const assetFilesByStorageKeyToSync = Object.fromEntries(assetFiles.map((file) => [file.originalStorageKey, file]))
	await new Promise((resolve, reject) => {
		assetsS3().listObjects(assetsS3Bucket(), 'asset-file/')
			.on('data', (item) => {
				if (!item.name) return
				const assetFile = assetFilesByStorageKeyToSync[item.name]
				if (assetFile && parseInt(assetFile.size, 10) === item.size && assetFile.status === AssetFileStatus.UP_TO_DATE) {
					delete assetFilesByStorageKeyToSync[item.name];
				}
			})
			.on('error', reject)
			.on('end', resolve)
	})

	const assetFilesToSync = Object.values(assetFilesByStorageKeyToSync)
	logger.info('integrity.files-to-sync', { count: assetFilesToSync.length })
	for (let i = 0; i < assetFilesToSync.length; i += 1000) {
		const ids = assetFilesToSync.slice(i, i + 1000).map((assetFile) => assetFile.id)
		await dataSource.getRepository(AssetFile).update(
			{ id: In(ids), status: Not(AssetFileStatus.PENDING_DELETION) },
			{ status: AssetFileStatus.OUTDATED },
		)
		await assetUpdateContentQueue.bulkPush(ids.map((assetFileId) => ({ data: { assetFileId } })))
	}

	logger.info('integrity.rollups')
	await recomputeCollectionRollups(dataSource.manager)

	await removeOrphanObjects()
}
