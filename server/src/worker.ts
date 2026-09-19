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
import { PgBoss, type WorkOptions } from "pg-boss"
import { AssetFile, AssetFileStatus } from "./entity/asset-file"
import { CollectionInvitation } from "./entity/collection-invitation"
import { Download, DownloadStatus } from "./entity/download"
import { User } from "./entity/user"
import {dataSource, logger} from "./env"
import { assignProductsToAssetFiles, processDeletion, updateFileContent } from "./services/asset"
import { synchronizeCollection } from "./services/collection"
import { pruneActivityEvents } from "./services/analytics"
import { measureStorageUsage, StorageQuotaExceededError } from "./services/storage"
import { integrityCheck as systemIntegrityCheck } from "./services/system"
import { createDownloadArchive, DownloadAccessError, processExpiredDownloads } from "./services/download"
import {
	sendDownloadReady,
	sendEmailVerificationEmail,
	sendInvitation,
	sendLogInEmail,
	sendRequestApprovalEmail,
	sendResetPasswordEmail,
	sendUserApprovedEmail
} from "./services/mailer"

const PGBOSS_SCHEMA = 'pgboss'
export const LEGACY_PGBOSS_SCHEMA = 'pgboss_legacy_v10'
// pg-boss 11 dropped the migrations from the v10 layout (schema version 24),
// so pg-boss 12 refuses to start against it. Anything below this version is
// retired at boot and its pending jobs are replayed into the fresh schema.
const FIRST_MIGRATABLE_PGBOSS_VERSION = 25

const queueInitializers: ((enableWorker: boolean) => Promise<any>)[] = []
const registeredQueues: { name: string, cron?: string }[] = []

// Only the worker process supervises queues and fires cron schedules; the API
// process and the CLI just send jobs. index.ts passes the same flag to
// startQueues() for the work() and schedule() registrations.
const enableWorker = process.env.ENABLE_WORKER === 'true'

export const boss = new PgBoss({
	connectionString: process.env.DATABASE_URL ?? 'postgresql://dam:dam@localhost/dam',
	schema: PGBOSS_SCHEMA,
	supervise: enableWorker,
	schedule: enableWorker,
})

boss.on('error', (error) => {
	logger.error('worker error', { error })
})

type CreateQueueOptions<T> = {
	name: string
	processor: (data: T) => any
	cron?: string
	workerOptions?: WorkOptions
}

export function createQueue<T>({ name, processor, cron, workerOptions }: CreateQueueOptions<T>) {
	registeredQueues.push({ name, cron })
	queueInitializers.push(async (enableWorker) => {
		await boss.createQueue(name)

		if (!enableWorker) {
			return
		}

		if (cron) {
			await boss.schedule(name, cron)
		}

		await boss.work<T>(name, workerOptions ?? {}, (jobs) =>
			Promise.all(jobs.map(async (job) =>
				processor(job.data).catch((error) => {
					logger.error('job', {
						status: 'failed',
						queue: job.name,
						jobId: job.id,
						error: error.message,
						stacktrace: error.stack,
					})
					throw error
				})
			))
		)
	})

	return {
		async push(data: T, opts?: { uniqueKey: string }) {
			await boss.send(name, data as object, {
				retryBackoff: true,
				singletonKey: opts?.uniqueKey,
			})
		},
		async bulkPush(jobs: { data: T, uniqueKey?: string }[]) {
			await boss.insert(name, jobs.map((job) => ({
				data: job.data as object,
				retryBackoff: true,
				singletonKey: job?.uniqueKey,
			})))
		},
	}
}

type SqlRunner = { query(sql: string, parameters?: unknown[]): Promise<any> }
type JobInserter = { insert(name: string, jobs: { data?: object, retryBackoff?: boolean, singletonKey?: string }[]): Promise<unknown> }

function isUndefinedTable(error: any): boolean {
	return (error?.code ?? error?.driverError?.code) === '42P01'
}

// Returns the installed pg-boss schema version, or null when pg-boss has never
// run against this database (no version table).
export async function installedPgBossVersion(db: SqlRunner = dataSource): Promise<number | null> {
	try {
		const rows = await db.query(`SELECT version FROM ${PGBOSS_SCHEMA}.version LIMIT 1`)
		return rows.length ? Number(rows[0].version) : null
	} catch (error) {
		if (isUndefinedTable(error)) return null
		throw error
	}
}

// Renames a pg-boss schema that pg-boss 12 cannot migrate so start() creates a
// fresh one. Returns true when a schema was retired. The old schema is kept for
// inspection; the upgrading guide tells operators when to drop it.
export async function retireLegacyPgBossSchema(db: SqlRunner = dataSource): Promise<boolean> {
	const version = await installedPgBossVersion(db)
	if (version === null || version >= FIRST_MIGRATABLE_PGBOSS_VERSION) return false
	const taken = await db.query(`SELECT 1 FROM pg_namespace WHERE nspname = $1`, [LEGACY_PGBOSS_SCHEMA])
	if (taken.length) {
		throw new Error(`The ${PGBOSS_SCHEMA} schema is at pg-boss version ${version}, which this release cannot migrate, and ${LEGACY_PGBOSS_SCHEMA} already exists. Drop or rename ${LEGACY_PGBOSS_SCHEMA}, then start the server again.`)
	}
	await db.query(`ALTER SCHEMA ${PGBOSS_SCHEMA} RENAME TO ${LEGACY_PGBOSS_SCHEMA}`)
	logger.warn('pg-boss schema retired', { version, renamedTo: LEGACY_PGBOSS_SCHEMA })
	return true
}

// Re-enqueues the jobs that were still waiting in a retired schema. Cron
// queues are skipped: schedule() registers them again on the next tick.
export async function replayLegacyPgBossJobs(queueNames: string[], target: JobInserter = boss, db: SqlRunner = dataSource): Promise<Record<string, number>> {
	const rows: { name: string, data: object | null, singleton_key: string | null }[] = await db.query(
		`SELECT name, data, singleton_key FROM ${LEGACY_PGBOSS_SCHEMA}.job WHERE state IN ('created', 'retry') AND name = ANY($1) ORDER BY created_on`,
		[queueNames],
	)
	const counts: Record<string, number> = {}
	for (const name of queueNames) {
		const jobs = rows.filter((row) => row.name === name)
		if (!jobs.length) continue
		await target.insert(name, jobs.map((job) => ({ data: job.data ?? undefined, retryBackoff: true, singletonKey: job.singleton_key ?? undefined })))
		counts[name] = jobs.length
	}
	return counts
}

export async function startQueues({ enableWorker }: { enableWorker: boolean }) {
	const retired = await retireLegacyPgBossSchema()
	await boss.start()
	for (const initializer of queueInitializers) {
		await initializer(enableWorker)
	}
	if (retired) {
		const replayed = await replayLegacyPgBossJobs(registeredQueues.filter((queue) => !queue.cron).map((queue) => queue.name))
		logger.warn('pg-boss legacy jobs replayed', { replayed, keptSchema: LEGACY_PGBOSS_SCHEMA, note: 'Drop the legacy schema once the upgrade is verified.' })
	}
}

export const mailerEmailVerificationQueue = createQueue<{ userId: string }>({
	name: 'mailer/email-verification',
	processor: (data) =>
		dataSource.getRepository(User).findOneBy({ id: data.userId })
			.then(sendEmailVerificationEmail),
})

export const mailerLogInQueue = createQueue<{ userId: string }>({
	name: 'mailer/log-in',
	processor: (data) =>
		dataSource.getRepository(User).findOneBy({ id: data.userId })
			.then(sendLogInEmail)
})

export const mailerResetPasswordQueue = createQueue<{ userId: string, token: string }>({
	name: 'mailer/password-reset',
	processor: (data) =>
		dataSource.getRepository(User).findOneByOrFail({ id: data.userId })
			.then((user) => sendResetPasswordEmail(user, data.token))
})

export const mailerRequestApprovalQueue = createQueue<{ requesterId: string }>({
	name: 'email/request-approval',
	processor: (data) =>
		dataSource.getRepository(User).findOneBy({ id: data.requesterId })
			.then(sendRequestApprovalEmail)
})

export const mailerUserApprovedEmailQueue = createQueue<{ userId: string }>({
	name: 'email/user-approved',
	processor: (data) =>
		dataSource.getRepository(User).findOneBy({ id: data.userId })
			.then(sendUserApprovedEmail)
})

export const mailerDownloadReadyQueue = createQueue<{ downloadId: string }>({
	name: 'mailer/download-ready',
	processor: (data) =>
		dataSource.getRepository(Download).findOneBy({ id: data.downloadId })
			.then(sendDownloadReady)
})

export const mailerInvitationQueue = createQueue<{ invitationId: string }>({
	name: 'mailer/invitation',
	processor: (data) =>
		dataSource.getRepository(CollectionInvitation)
			.findOne({ where: { id: data.invitationId }, relations: { collection: true, user: true } })
			.then(sendInvitation)
})

export const assetUpdateContentQueue = createQueue<{ assetFileId: string }>({
	name: 'asset/update-content',
	processor: (data) =>
		dataSource.getRepository(AssetFile).findOneBy({ id: data.assetFileId })
			.then(async (content) => {
				if (!content || ![AssetFileStatus.CREATING, AssetFileStatus.OUTDATED].includes(content.status)) {
					return
				}
				await updateFileContent(content)
			})
			.catch((error) => {
				if (!(error instanceof StorageQuotaExceededError)) {
					throw error
				}
				logger.warn('storage.quota-exceeded', { assetFileId: error.assetFileId, size: error.size })
			}),
	workerOptions: { batchSize: 10 },
})

export const assetProcessDeletionQueue = createQueue<void>({
	name: 'asset/process-deletion',
	processor: () => processDeletion(),
	cron: '* * * * *',
})

export const assetAssignProductsToAssetFilesQueue = createQueue<void>({
	name: 'asset/assign-products-to-asset-files',
	processor: () => assignProductsToAssetFiles(),
	cron: '*/5 * * * *',
})

export const collectionSynchronizationQueue = createQueue<{ collectionId: string }>({
	name: 'collection/synchronization',
	processor: (data) => dataSource.transaction((em) => synchronizeCollection(em, data.collectionId)),
	workerOptions: { batchSize: 1 },
})

export const downloadCreateArchiveQueue = createQueue<{ downloadId: string }>({
	name: 'download/create-archive',
	processor: (data) => dataSource.transaction(async (em) => {
		const download = await em.getRepository(Download).findOneBy({ id: data.downloadId })
		if (!download || download.status !== DownloadStatus.PREPARING) {
			return
		}

		await createDownloadArchive({ em, download })
		await mailerDownloadReadyQueue.push({ downloadId: download.id })
	}).catch(async (error) => {
		if (!(error instanceof DownloadAccessError)) {
			throw error
		}
		// Persist the terminal state after the archive transaction has rolled back.
		const result = await dataSource.getRepository(Download).update(
			{ id: data.downloadId, status: DownloadStatus.PREPARING },
			{ status: DownloadStatus.FAILED },
		)
		if (result.affected) {
			logger.warn('download.access-denied', { downloadId: data.downloadId, status: DownloadStatus.FAILED })
		}
	}),
	workerOptions: { batchSize: 1 },
})

export const downloadProcessExpiredQueue = createQueue<void>({
	name: 'download/process-expired',
	processor: () => processExpiredDownloads(),
	cron: '* * * * *',
})

export const systemIntegrityCheckQueue = createQueue<void>({
	name: 'system/integrity-check',
	processor: systemIntegrityCheck,
	cron: '0 5 * * *',
})

export const storageMeasureUsageQueue = createQueue<void>({
	name: 'storage/measure-usage',
	processor: () => measureStorageUsage(),
	cron: '*/30 * * * *',
})

export const activityPruneEventsQueue = createQueue<void>({
	name: 'activity/prune-events',
	processor: () => pruneActivityEvents(),
	cron: '30 4 * * *',
})
