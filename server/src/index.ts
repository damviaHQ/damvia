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
import 'dotenv/config'
import "reflect-metadata"
import { assetUpdater, dataSource, logger } from "./env"
import { startWorker } from "./worker"
import server from "./server"

async function startAssetUpdater() {
	await assetUpdater().initialize()
	logger.info('asset updater initialized')
	const fetchUpdates = () =>
		assetUpdater().fetchUpdates()
			.then(async () => {
				await dataSource.query(`
					INSERT INTO collection_files (asset_file_id, collection_id)
					SELECT asset_files.id, collections.id FROM asset_files
					INNER JOIN collections ON collections.asset_folder_id = asset_files.folder_id
					ON CONFLICT DO NOTHING
				`)
				logger.info('assets updated successfully')
			})
			.catch((error) => logger.error('failed to update assets', { error }))
			.finally(() => setTimeout(fetchUpdates, 5 * 60 * 1000))
	fetchUpdates()
}

async function run() {
	startAssetUpdater().catch((error) => {
		logger.error('failed to start asset updater', { error })
		process.exit(1)
	})

	await dataSource.initialize()
	const addr = await server.listen({
		host: '0.0.0.0',
		port: parseInt(process.env.PORT ?? '3000', 10),
	})
	if (process.env.ENABLE_WORKER === 'true') {
		await startWorker()
	}
	logger.info('server listening', { addr })
}

run().catch((error) => {
	logger.error(error)
	process.exit(1)
})
