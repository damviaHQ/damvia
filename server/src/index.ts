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
import { assetUpdaters, dataSource, logger } from "./env"
import { adoptUnassignedAssets, recordAssetSourceRun, registerAssetSources, staleAssetSourceKeys } from "./services/asset"
import { runEnrichmentPass } from "./services/enrichment"
import { cleanStaleTempDirectories } from "./services/storage"
import { startQueues } from "./worker"
import server from "./server"

async function startAssetUpdater() {
	const updaters = assetUpdaters()
	for (const updater of updaters) {
		await updater.initialize()
		logger.info('asset source initialized', { source: updater.key, provider: updater.providerName })
	}
	const fetchUpdates = async () => {
		for (const updater of updaters) {
			await recordAssetSourceRun(updater.key, 'started')
			await updater.fetchUpdates()
				.then(async () => {
					await recordAssetSourceRun(updater.key, 'succeeded')
					logger.info('assets updated successfully', { source: updater.key })
				})
				.catch(async (error) => {
					logger.error('failed to update assets', { source: updater.key, error })
					await recordAssetSourceRun(updater.key, { error: error?.message ?? String(error) })
				})
		}
		await dataSource.query(`
			INSERT INTO collection_files (asset_file_id, collection_id)
			SELECT asset_files.id, collections.id FROM asset_files
			INNER JOIN collections ON collections.asset_folder_id = asset_files.folder_id
			ON CONFLICT DO NOTHING
		`).catch((error) => logger.error('failed to link files to collections', { error }))
		await runEnrichmentPass().catch((error) => logger.error('failed to run enrichment pass', { error }))
		setTimeout(fetchUpdates, 5 * 60 * 1000)
	}
	fetchUpdates()
}

// Rows from before sources existed are adopted by a lone source. Rows of any
// other key that is not configured would be frozen for users, or duplicated
// once the same folder syncs under a new key, so the server refuses to start
// until the CLI has moved them (rename-source) or handed them to the deletion
// job (remove-source).
async function checkAssetSources(configured: string[]) {
	if (configured.length === 1) {
		const adopted = await adoptUnassignedAssets(configured[0])
		if (adopted.folders + adopted.files > 0) {
			logger.info('asset source adopted existing assets', { source: configured[0], ...adopted })
		}
	}
	await registerAssetSources(assetUpdaters().map((updater) => ({ key: updater.key, provider: updater.providerName, label: updater.label, root: updater.root })))
	const stale = await staleAssetSourceKeys(configured)
	if (stale.length > 0) {
		const keys = stale.map((key) => key === '' ? '""' : key).join(', ')
		throw new Error(`Assets belong to source keys that are not configured (${keys}). Run "npm run cli -- rename-source <old> <new>" if the source was renamed, or "npm run cli -- remove-source <key>" if it was removed, then start the server again.`)
	}
}

async function run() {
	await cleanStaleTempDirectories()
	await dataSource.initialize()
	await checkAssetSources(assetUpdaters().map((updater) => updater.key))
	startAssetUpdater().catch((error) => {
		logger.error('failed to start asset updater', { error })
		process.exit(1)
	})
	await startQueues({ enableWorker: process.env.ENABLE_WORKER === 'true' })
	const addr = await server.listen({
		host: '0.0.0.0',
		port: parseInt(process.env.PORT ?? '3000', 10),
	})
	logger.info('server listening', { addr })
}

run().catch((error) => {
	logger.error(error)
	process.exit(1)
})
