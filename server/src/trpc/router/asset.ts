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
import { In } from "typeorm"
import { z } from "zod"
import { AssetFile } from "../../entity/asset-file"
import { AssetFolder } from "../../entity/asset-folder"
import { assetsS3, assetsS3Bucket, dataSource } from "../../env"
import { authMiddleware, publicProcedure, router, userAdmin, userApproved } from "../index"

export async function formatAssetFolder(assetFolder: AssetFolder) {
	return {
		id: assetFolder.id,
		name: assetFolder.name,
		assetTypeId: assetFolder.assetTypeId,
		licenseId: assetFolder.licenseId,
		children: assetFolder.children?.length ? await Promise.all(assetFolder.children.map(formatAssetFolder)) : undefined,
		files: assetFolder.files?.length ? await Promise.all(assetFolder.files.map(formatAssetFile)) : undefined,
		parent: assetFolder.parent ? await formatAssetFolder(assetFolder.parent) : undefined,
	}
}

export async function formatAssetFile(file: AssetFile) {
	return {
		id: file.id,
		name: file.name,
		mimeType: file.mimeType,
		assetTypeId: file.assetTypeId,
		productView: file.productView,
		productId: file.productId,
		licenseId: file.licenseId,
		thumbnailURL: file.hasThumbnail ? await assetsS3().presignedGetObject(assetsS3Bucket(), file.thumbnailStorageKey) : null,
		fileURL: await assetsS3().presignedGetObject(assetsS3Bucket(), file.originalStorageKey),
	}
}

export default router({
	tree: publicProcedure
		.use(authMiddleware(userAdmin))
		.query(async () => {
			const tree = await dataSource.getTreeRepository(AssetFolder).findTrees()
			return Promise.all(tree.map(formatAssetFolder))
		}),
	listProductViews: publicProcedure
		.use(authMiddleware(userApproved))
		.query(async () => {
			const query = await dataSource.getRepository(AssetFile)
				.createQueryBuilder('asset_file')
				.select('asset_file.product_view')
				.addGroupBy('asset_file.product_view')
				.where('asset_file.product_view IS NOT NULL')
				.getRawMany()
			return query.map((value) => value.product_view) as string[]
		}),
	findById: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(z.string().uuid())
		.query(async ({ input }) => {
			const assetFolder = await dataSource.getRepository(AssetFolder).findOne({
				where: { id: input },
				relations: { children: true, files: true },
			})
			if (!assetFolder) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Asset folder not found.' })
			}
			await dataSource.getTreeRepository(AssetFolder).findAncestorsTree(assetFolder)
			return formatAssetFolder(assetFolder)
		}),
	update: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(z.object({
			id: z.string().uuid(),
			assetTypeId: z.string().uuid().nullable().optional(),
			licenseId: z.string().uuid().nullable().optional(),
		}))
		.mutation(async ({ input }) => {
			const assetFolder = await dataSource.getRepository(AssetFolder).findOneBy({ id: input.id })
			if (!assetFolder) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Asset folder not found.' })
			}

			const descendants = await dataSource.getTreeRepository(AssetFolder).findDescendants(assetFolder)
			const folderIdsToUpdate = [assetFolder.id, ...descendants.map((descendant) => descendant.id)]
			await dataSource.transaction(async (em) => {
				await em.getRepository(AssetFolder).update(
					{ id: In(folderIdsToUpdate) },
					{ assetTypeId: input.assetTypeId, licenseId: input.licenseId },
				)
				await em.getRepository(AssetFile).update(
					{ folderId: In(folderIdsToUpdate) },
					{ assetTypeId: input.assetTypeId, licenseId: input.licenseId },
				)
			})
		}),
})
