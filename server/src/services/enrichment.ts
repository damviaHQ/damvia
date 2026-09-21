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
import { dataSource, logger } from "../env"
import { applyFolderAssetTypes, ENRICHMENT_LOCK, refreshFolderPaths, resolveAllFolders } from "./asset-type-rules"

// Runs after every sync, before the next one. One pass at a time: a second
// caller waits on the advisory lock. Each stage is idempotent, so a crash is
// repaired by the next pass.
export async function runEnrichmentPass(): Promise<{ paths: number, folders: number, files: number }> {
	const started = Date.now()
	const result = await dataSource.transaction(async (em) => {
		await em.query('SELECT pg_advisory_xact_lock($1)', [ENRICHMENT_LOCK])
		const paths = await refreshFolderPaths(em)
		const { resolution } = await resolveAllFolders(em)
		const applied = await applyFolderAssetTypes(em, resolution.changes)
		return { paths, ...applied }
	})
	logger.info('enrichment.asset-types', { ...result, durationMs: Date.now() - started })
	return result
}
