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
import PgBoss from "pg-boss"
import { AssetFile } from "./entity/asset-file"
import { CollectionInvitation } from "./entity/collection-invitation"
import { Download } from "./entity/download"
import { User } from "./entity/user"
import { dataSource, logger } from "./env"
import { assignProductsToAssetFiles, processDeletion, updateFileContent } from "./services/asset"
import { synchronizeCollection } from "./services/collection"
import { createDownloadArchive, processExpiredDownloads } from "./services/download"
import {
	sendDownloadReady,
	sendEmailVerificationEmail,
	sendInvitation,
	sendLogInEmail,
	sendRequestApprovalEmail,
	sendResetPasswordEmail,
	sendUserApprovedEmail
} from "./services/mailer"

const workerInitializers: (() => Promise<any>)[] = []

const boss = new PgBoss(process.env.DATABASE_URL ?? 'postgresql://dam:dam@localhost/dam')

boss.on('error', (error) => {
	logger.error('worker error', { error })
})

type CreateQueueOptions<T> = {
	name: string
	processor: (data: T) => any
	cron?: string
	workerOptions?: PgBoss.WorkOptions
}

export function createQueue<T>({ name, processor, cron, workerOptions }: CreateQueueOptions<T>) {
	workerInitializers.push(async () => {
		if (cron) {
			await boss.schedule(name, cron)
		}
		await boss.work<T>(name, workerOptions ?? { newJobCheckInterval: 100 }, async (job) => {
			try {
				await processor(job.data)
			} catch (error) {
				logger.error('job', {
					status: 'failed',
					queue: job.name,
					jobId: job.id,
					error: error.message,
					stacktrace: error.stacktrace,
				})
				throw error
			}
		})
	})

	return {
		async push(data: T, opts?: { uniqueKey: string }) {
			await boss.send({
				name,
				data: data as any,
				options: {
					retryBackoff: true,
					singletonKey: opts?.uniqueKey,
				},
			})
		},
		async bulkPush(jobs: { data: T, uniqueKey?: string }[]) {
			await boss.insert(jobs.map((job) => ({
				name,
				data: job.data as object,
				retryBackoff: true,
				singletonKey: job?.uniqueKey,
			})))
		},
	}
}

export async function startWorker() {
	await boss.start()
	await Promise.all(workerInitializers.map((initializer) => initializer()))
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

export const mailerResetPasswordQueue = createQueue<{ userId: string }>({
	name: 'mailer/password-reset',
	processor: (data) =>
		dataSource.getRepository(User).findOneBy({ id: data.userId })
			.then(sendResetPasswordEmail)
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
				if (content) {
					await updateFileContent(content)
				}
			}),
	workerOptions: { teamSize: 10, teamConcurrency: 20 },
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
	workerOptions: { teamSize: 10, teamConcurrency: 20 },
})

export const downloadCreateArchiveQueue = createQueue<{ downloadId: string }>({
	name: 'download/create-archive',
	processor: (data) => dataSource.transaction(async (em) => {
		const download = await em.getRepository(Download).findOneBy({ id: data.downloadId })
		if (!download) {
			return
		}

		await createDownloadArchive({ em, download })
		await mailerDownloadReadyQueue.push({ downloadId: download.id })
	}),
	workerOptions: { teamSize: 1, teamConcurrency: 5 },
})

export const downloadProcessExpiredQueue = createQueue<void>({
	name: 'download/process-expired',
	processor: () => processExpiredDownloads(),
	cron: '* * * * *',
})
