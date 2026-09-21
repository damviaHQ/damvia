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
import { EntityManager } from "typeorm"
import { dataSource, logger } from "../env"
import { applyFolderAssetTypes, ENRICHMENT_LOCK, refreshFolderPaths, resolveAllFolders } from "./asset-type-rules"
import { EntityStageResult, runEntityStage } from "./entity-resolution"
import { refreshMetadataFieldCounts } from "./file-metadata"

export type EnrichmentPassResult = {
	assetTypes: { paths: number, folders: number, files: number }
	entities: EntityStageResult
	metadata: { fields: number }
}

// Runs after every sync, before the next one. One pass at a time: the session
// lock makes a second caller wait, and the admin actions take the same lock
// inside their own transaction. Each stage commits on its own and is
// idempotent, so a crash is repaired by the next pass.
export async function runEnrichmentPass(): Promise<EnrichmentPassResult> {
	const runner = dataSource.createQueryRunner()
	await runner.connect()
	try {
		await runner.query('SELECT pg_advisory_lock($1)', [ENRICHMENT_LOCK])
		const stage = async <T>(name: string, work: (em: EntityManager) => Promise<T>): Promise<T> => {
			const started = Date.now()
			await runner.startTransaction()
			try {
				const result = await work(runner.manager)
				await runner.commitTransaction()
				logger.info(`enrichment.${name}`, { ...result, durationMs: Date.now() - started })
				return result
			} catch (error) {
				await runner.rollbackTransaction()
				throw error
			}
		}
		const assetTypes = await stage('asset-types', async (em) => {
			const paths = await refreshFolderPaths(em)
			const { resolution } = await resolveAllFolders(em)
			return { paths, ...await applyFolderAssetTypes(em, resolution.changes) }
		})
		const entities = await stage('entities', (em) => runEntityStage(em))
		const metadata = await stage('metadata', (em) => refreshMetadataFieldCounts(em))
		return { assetTypes, entities, metadata }
	} finally {
		await runner.query('SELECT pg_advisory_unlock($1)', [ENRICHMENT_LOCK]).catch(() => {})
		await runner.release()
	}
}

// An admin change (attach, detach, steps saved) re-runs the entity stage
// straight away instead of waiting up to five minutes for the next sync.
export async function rerunEntityStage(): Promise<EntityStageResult> {
	return dataSource.transaction(async (em) => {
		await em.query('SELECT pg_advisory_xact_lock($1)', [ENRICHMENT_LOCK])
		return runEntityStage(em)
	})
}
