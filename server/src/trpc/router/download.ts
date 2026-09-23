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
import { TRPCError } from "@trpc/server"
import { In, MoreThanOrEqual } from "typeorm"
import { z } from "zod"
import { ActivityEvent, ActivityEventType } from "../../entity/activity-event"
import {
	Download,
	DownloadImageFormat,
	DownloadImageResolution,
	DownloadStatus,
	DownloadType,
	DownloadVideoFormat,
	DownloadVideoResolution
} from "../../entity/download"
import {apiURL, dataSource} from "../../env"
import { userCollectionFilesQuery } from "../../services/collection"
import { createDownloadArchive } from "../../services/download"
import { downloadCreateArchiveQueue } from "../../worker"
import { authMiddleware, publicProcedure, router, userApproved } from "../index"

import { resolveDownloadSelection } from "../../services/download-selection"
import { buildRecordExport, recordExportColumns } from "../../services/download-record-export"

export async function formatDownload(download: Download) {
	let url: string | null = null
	if (download.status === DownloadStatus.READY) {
		const downloadURL = new URL(apiURL())
		downloadURL.pathname = `/v1/downloads/${download.id}`
		url = downloadURL.toString()
	}

	return {
		id: download.id,
		status: download.status,
		fileCount: download.collectionFileIds.length,
		recordCount: download.recordExport?.recordIds.length ?? 0,
		downloadType: download.type,
		url,
		expiresAt: download.expiresAt,
		createdAt: download.createdAt,
		updatedAt: download.updatedAt,
	}
}

export default router({
  exportRecords: publicProcedure
    .use(authMiddleware(userApproved))
    .input(z.object({
      items: z.array(z.object({ id: z.uuid(), type: z.enum(['collection', 'file', 'record']) })).min(1).max(10000),
      columns: z.string().array().min(1).max(500),
      format: z.enum(['csv', 'xlsx']),
    }))
    .mutation(async ({ input, ctx }) => {
      const selection = await resolveDownloadSelection(dataSource.manager, ctx.user, input.items, false)
      const content = await buildRecordExport(selection, input.columns, input.format)
      return { filename: `records.${input.format}`, mimeType: input.format === 'csv' ? 'text/csv;charset=utf-8' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', content: content.toString('base64') }
    }),
	list: publicProcedure
		.use(authMiddleware(userApproved))
		.query(async ({ ctx }) => {
			const oneMonthAgo = new Date()
			oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1)

			const downloads = await dataSource.getRepository(Download).find({
				where: [
					{
						userId: ctx.user.id,
						status: In([DownloadStatus.READY, DownloadStatus.PREPARING, DownloadStatus.FAILED]),
					},
					{
						userId: ctx.user.id,
						status: DownloadStatus.EXPIRED,
						updatedAt: MoreThanOrEqual(oneMonthAgo),
					},
				],
				order: { createdAt: 'desc' },
			})
			return Promise.all(downloads.map(formatDownload))
		}),
	create: publicProcedure
		.use(authMiddleware(userApproved))
		.input(
			z.object({
				collectionFileIds: z.uuid().array().min(1),
				recordExport: z.object({
					items: z.array(z.object({ id: z.uuid(), type: z.enum(['collection', 'file', 'record']) })).min(1).max(10000),
					columns: z.string().array().min(1).max(500),
					format: z.enum(['csv', 'xlsx']),
				}).optional(),
				imageFormat: z.enum(DownloadImageFormat),
				imageResolution: z.enum(DownloadImageResolution),
				videoFormat: z.enum(DownloadVideoFormat),
				videoResolution: z.enum(DownloadVideoResolution),
				downloadType: z.enum(DownloadType),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			const collectionFiles = await userCollectionFilesQuery(ctx.user)
				.andWhere({ id: In(input.collectionFileIds) })
				.getMany()

			if (!collectionFiles.length) throw new TRPCError({ code: 'BAD_REQUEST', message: 'No files are available to download.' })
			const totalSize = collectionFiles.reduce((total, file) => total + parseInt(file.assetFile.size, 10), 0)
			if (totalSize >= 10_000_000_000) { // 10GB
				throw new TRPCError({ code: 'FORBIDDEN', message: "You cannot download more than 10GB." })
			}
			const selectedRecords = input.recordExport
				? await resolveDownloadSelection(dataSource.manager, ctx.user, input.recordExport.items, false)
				: null
			if (selectedRecords && input.recordExport) recordExportColumns(selectedRecords, input.recordExport.columns, input.recordExport.format)

			const download = new Download()
			download.status = DownloadStatus.PREPARING
			download.user = ctx.user
			download.type = input.downloadType
			download.collectionFileIds = collectionFiles.map((file) => file.id)
			download.recordExport = input.recordExport && selectedRecords ? {
				items: input.recordExport.items,
				columns: [...new Set(input.recordExport.columns)],
				format: input.recordExport.format,
				recordIds: selectedRecords.recordIds,
			} : null
			download.imageFormat = input.imageFormat
			download.imageResolution = input.imageResolution
			download.videoFormat = input.videoFormat
			download.videoResolution = input.videoResolution
			download.expiresAt = new Date(Date.now() + (1000 * 60 * 60 * 24 * 7))
			await dataSource.transaction(async (em) => {
				await em.getRepository(Download).save(download)
				await em.getRepository(ActivityEvent).insert(collectionFiles.map((file) => ({
					userId: ctx.user.id,
					type: ActivityEventType.ASSET_DOWNLOAD,
					assetFileId: file.assetFileId,
					collectionId: file.collectionId,
					metadata: { downloadId: download.id, downloadType: download.type },
				})))
				if (download.type === DownloadType.DIRECT) {
					return createDownloadArchive({ em, download })
				}
				return downloadCreateArchiveQueue.push({ downloadId: download.id })
			})
			return formatDownload(download)
		}),
})
