import {AssetFile, AssetFileStatus } from "../entity/asset-file";
import {assetsS3, assetsS3Bucket, dataSource} from "../env";
import {assetUpdateContentQueue} from "../worker";

export async function integrityCheck() {
	const assetFiles = await dataSource.getRepository(AssetFile).find({
		where: {
			status: AssetFileStatus.UP_TO_DATE,
		},
	})
	const assetFilesByStorageKeyToSync = Object.fromEntries(assetFiles.map((file) => [file.originalStorageKey, file]))
	await new Promise((resolve, reject) => {
		assetsS3().listObjects(assetsS3Bucket(), 'asset-file/')
			.on('data', (item) => {
				if (parseInt(assetFilesByStorageKeyToSync[item.name]?.size, 0) === item.size) {
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
		await dataSource.transaction(async (em) => {
			await em.getRepository(AssetFile).save(assetFilesToSync)
			await assetUpdateContentQueue.bulkPush(assetFilesToSync.map((assetFile) => ({
				data: {
					assetFileId: assetFile.id,
				},
			})))
		})
	}
	console.log('Successfully updated assets files')

	console.log('Syncing folder thumbnails')
	await dataSource.query(`
      UPDATE collections
      SET sample_file_ids = coalesce((
				SELECT ARRAY_AGG(subquery.id)
				FROM (
					SELECT collection_files.id
					FROM collection_files
					INNER JOIN collections collection_file_collection ON collections.id::text = ANY(string_to_array(collection_file_collection.mpath, '.'))
					INNER JOIN asset_files ON collection_files.asset_file_id = asset_files.id AND asset_files.has_thumbnail
					WHERE collection_files.collection_id = collections.id
					ORDER BY array_position(string_to_array(collections.mpath, '.'), collection_files.collection_id::text) NULLS LAST, collection_files.created_at
					LIMIT 4
				) AS subquery
	 		), ARRAY[]::uuid[])
		`)
}
