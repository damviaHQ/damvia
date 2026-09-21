import {AssetFile, AssetFileStatus } from "../entity/asset-file";
import {assetsS3, assetsS3Bucket, dataSource} from "../env";
import {assetUpdateContentQueue} from "../worker";
import {recomputeCollectionRollups} from "./collection";
import {removeOrphanObjects} from "./storage";

export async function integrityCheck() {
	const assetFiles = await dataSource.getRepository(AssetFile).find()
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
	console.log(`${assetFilesToSync.length} assets files found to sync`)
	assetFilesToSync.forEach((assetFile) => {
		assetFile.status = AssetFileStatus.OUTDATED
	})
	if (assetFilesToSync.length > 0) {
		await dataSource.getRepository(AssetFile).save(assetFilesToSync)
		await assetUpdateContentQueue.bulkPush(assetFilesToSync.map((assetFile) => ({
			data: {
				assetFileId: assetFile.id,
			},
		})))
	}
	console.log('Successfully updated assets files')

	console.log('Syncing folder counts and thumbnails')
	await recomputeCollectionRollups(dataSource.manager)

	await removeOrphanObjects()
}
