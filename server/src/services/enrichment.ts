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
import { runVariantStage, VariantStageResult } from "./variant-grouping"
import { refreshAllDynamicCollections } from "./product-collections"
import { runFamilyStage, FamilyStageResult } from "./record-families"
import { runReadinessStage, ReadinessStageResult } from "./record-readiness"

export type EnrichmentPassResult = {
	assetTypes: { paths: number, folders: number, files: number }
	entities: EntityStageResult
	metadata: { fields: number }
	variants: VariantStageResult
}

// Runs after every sync, before the next one. One pass at a time: the session
// lock makes a second caller wait, and the admin actions take the same lock
// inside their own transaction. Each stage commits on its own and is
// idempotent, so a crash is repaired by the next pass.
export async function runEnrichmentPass(trigger: 'sync' | 'admin' = 'sync', startedById: string | null = null): Promise<EnrichmentPassResult> {
	const runner = dataSource.createQueryRunner()
	await runner.connect()
	let runId: string | null = null
	try {
		await runner.query('SELECT pg_advisory_lock($1)', [ENRICHMENT_LOCK])
		const [run] = await runner.query('INSERT INTO enrichment_runs (trigger, started_by_id) VALUES ($1, $2) RETURNING id', [trigger, startedById])
		runId = run.id
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
		const variants = await stage('variants', (em) => runVariantStage(em))
		const families = await stage('families', (em) => runFamilyStage(em))
		const readiness = await stage('readiness', (em) => runReadinessStage(em))
		const productRules = await stage('product-rules', (em) => refreshAllDynamicCollections(em))
		const result = { assetTypes, entities, metadata, variants, families, readiness, productRules }
		await runner.query('UPDATE enrichment_runs SET finished_at = now(), stats = $2 WHERE id = $1', [runId, JSON.stringify(result)])
		await runner.query('DELETE FROM enrichment_runs WHERE id NOT IN (SELECT id FROM enrichment_runs ORDER BY started_at DESC LIMIT 50)')
		return result
	} catch (error) {
		if (runId) await runner.query('UPDATE enrichment_runs SET finished_at = now(), error = $2 WHERE id = $1', [runId, String(error?.message ?? error).slice(0, 2000)]).catch(() => {})
		throw error
	} finally {
		await runner.query('SELECT pg_advisory_unlock($1)', [ENRICHMENT_LOCK]).catch(() => {})
		await runner.release()
	}
}

// The family field changed, or records were written: the grouping is redone.
export async function rerunFamilyStage(changedFields?: string[]): Promise<FamilyStageResult> {
	return dataSource.transaction(async (em) => {
		await em.query('SELECT pg_advisory_xact_lock($1)', [ENRICHMENT_LOCK])
		return runFamilyStage(em, changedFields)
	})
}

// A readiness definition saved, or a record written, is scored at once rather
// than waiting for the next pass.
export async function rerunReadinessStage(recordIds?: string[]): Promise<ReadinessStageResult> {
	return dataSource.transaction(async (em) => {
		await em.query('SELECT pg_advisory_xact_lock($1)', [ENRICHMENT_LOCK])
		return runReadinessStage(em, recordIds)
	})
}

// Rules saved on a collection are applied at once; a record written elsewhere
// reaches its dynamic collections at the next pass.
export async function rerunProductRules() {
	return dataSource.transaction(async (em) => {
		await em.query('SELECT pg_advisory_xact_lock($1)', [ENRICHMENT_LOCK])
		return refreshAllDynamicCollections(em)
	})
}

// A pass holds the lock for its whole length; trying it tells whether one is
// running without waiting for it.
export async function isEnrichmentRunning(): Promise<boolean> {
	const runner = dataSource.createQueryRunner()
	await runner.connect()
	try {
		const [{ free }] = await runner.query('SELECT pg_try_advisory_lock($1) AS free', [ENRICHMENT_LOCK])
		if (free) await runner.query('SELECT pg_advisory_unlock($1)', [ENRICHMENT_LOCK])
		return !free
	} finally {
		await runner.release()
	}
}

// A grouping change (asset type switch, override, setting) re-runs the
// variant stage on its own.
export async function rerunVariantStage(): Promise<VariantStageResult> {
	return dataSource.transaction(async (em) => {
		await em.query('SELECT pg_advisory_xact_lock($1)', [ENRICHMENT_LOCK])
		return runVariantStage(em)
	})
}

// An admin change (attach, detach, steps saved) re-runs the entity stage
// straight away instead of waiting up to five minutes for the next sync.
export async function rerunEntityStage(): Promise<EntityStageResult> {
	return dataSource.transaction(async (em) => {
		await em.query('SELECT pg_advisory_xact_lock($1)', [ENRICHMENT_LOCK])
		return runEntityStage(em)
	})
}
