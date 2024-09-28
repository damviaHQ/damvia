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
import {
	Download,
	DownloadImageFormat,
	DownloadImageResolution,
	DownloadStatus,
	DownloadType,
	DownloadVideoFormat,
	DownloadVideoResolution
} from "../../entity/download"
import { assetsS3, assetsS3Bucket, dataSource } from "../../env"
import { userCollectionFilesQuery } from "../../services/collection"
import { createDownloadArchive } from "../../services/download"
import { downloadCreateArchiveQueue } from "../../worker"
import { authMiddleware, publicProcedure, router, userApproved } from "../index"

export async function formatDownload(download: Download) {
	return {
		id: download.id,
		status: download.status,
		fileCount: download.collectionFileIds.length,
		downloadType: download.type,
		url: download.status === DownloadStatus.READY
			? await assetsS3().presignedGetObject(assetsS3Bucket(), download.storageKey) : null,
		expiresAt: download.expiresAt,
		createdAt: download.createdAt,
		updatedAt: download.updatedAt,
	}
}

export default router({
	list: publicProcedure
		.use(authMiddleware(userApproved))
		.query(async ({ ctx }) => {
			const oneMonthAgo = new Date()
			oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1)

			const downloads = await dataSource.getRepository(Download).find({
				where: [
					{
						userId: ctx.user.id,
						status: In([DownloadStatus.READY, DownloadStatus.PREPARING]),
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
				collectionFileIds: z.string().uuid().array(),
				imageFormat: z.nativeEnum(DownloadImageFormat),
				imageResolution: z.nativeEnum(DownloadImageResolution),
				videoFormat: z.nativeEnum(DownloadVideoFormat),
				videoResolution: z.nativeEnum(DownloadVideoResolution),
				downloadType: z.nativeEnum(DownloadType),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			const collectionFiles = await userCollectionFilesQuery(ctx.user)
				.andWhere({ id: In(input.collectionFileIds) })
				.getMany()

			const totalSize = collectionFiles.reduce((total, file) => total + parseInt(file.assetFile.size, 10), 0)
			if (totalSize >= 10_000_000_000) { // 10GB
				throw new TRPCError({ code: 'FORBIDDEN', message: "You cannot download more than 10GB." })
			}

			const download = new Download()
			download.status = DownloadStatus.PREPARING
			download.user = ctx.user
			download.type = input.downloadType
			download.collectionFileIds = collectionFiles.map((file) => file.id)
			download.imageFormat = input.imageFormat
			download.imageResolution = input.imageResolution
			download.videoFormat = input.videoFormat
			download.videoResolution = input.videoResolution
			download.expiresAt = new Date(Date.now() + (1000 * 60 * 60 * 24 * 7))
			await dataSource.transaction(async (em) => {
				if (download.type === DownloadType.DIRECT) {
					await em.getRepository(Download).save(download)
					return createDownloadArchive({ em, download })
				}
				await em.getRepository(Download).save(download)
				return downloadCreateArchiveQueue.push({ downloadId: download.id })
			})
			return formatDownload(download)
		}),
})
