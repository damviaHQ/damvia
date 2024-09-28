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
import { z } from "zod"
import { AssetFile } from "../../entity/asset-file"
import { AssetFolder } from "../../entity/asset-folder"
import { AssetType } from "../../entity/asset-type"
import { dataSource } from "../../env"
import { authMiddleware, publicProcedure, router, userAdmin, userApproved } from "../index"

export function formatAssetType(type: AssetType) {
	return {
		id: type.id,
		name: type.name,
		description: type.description,
		isRelatedToProducts: type.isRelatedToProducts,
		includeInSearchByDefault: type.includeInSearchByDefault,
		defaultDisplay: type.defaultDisplay,
		listDisplayItems: type.listDisplayItems,
	}
}

export default router({
	list: publicProcedure
		.use(authMiddleware(userApproved))
		.query(async () => {
			const assetTypes = await dataSource.getRepository(AssetType).find({ order: { createdAt: 'DESC' } })
			return assetTypes.map(formatAssetType)
		}),
	create: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(
			z.object({
				name: z.string().min(1).max(30),
				description: z.string().max(255).optional(),
				isRelatedToProducts: z.boolean().optional(),
				includeInSearchByDefault: z.boolean().optional(),
				defaultDisplay: z.union([z.literal('list'), z.literal('grid')]),
				listDisplayItems: z.string().array(),
			}),
		)
		.mutation(async ({ input }) => {
			const assetType = new AssetType()
			assetType.name = input.name
			assetType.description = input.description
			assetType.isRelatedToProducts = input.isRelatedToProducts
			assetType.includeInSearchByDefault = input.includeInSearchByDefault
			assetType.defaultDisplay = input.defaultDisplay
			assetType.listDisplayItems = input.listDisplayItems
			await dataSource.getRepository(AssetType).save(assetType)
			return formatAssetType(assetType)
		}),
	update: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(
			z.object({
				id: z.string().uuid(),
				name: z.string().min(1).max(30),
				description: z.string().max(255).optional(),
				isRelatedToProducts: z.boolean().optional(),
				includeInSearchByDefault: z.boolean().optional(),
				defaultDisplay: z.union([z.literal('list'), z.literal('grid')]),
				listDisplayItems: z.string().array(),
			})
		)
		.mutation(async ({ input }) => {
			const assetType = await dataSource.getRepository(AssetType).findOneBy({ id: input.id })
			if (!assetType) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Asset type not found.' })
			}

			assetType.name = input.name
			assetType.description = input.description
			assetType.isRelatedToProducts = input.isRelatedToProducts
			assetType.includeInSearchByDefault = input.includeInSearchByDefault
			assetType.defaultDisplay = input.defaultDisplay
			assetType.listDisplayItems = input.listDisplayItems
			await dataSource.getRepository(AssetType).save(assetType)
			return formatAssetType(assetType)
		}),
	remove: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(z.string().uuid())
		.mutation(async ({ input }) => {
			const assetType = await dataSource.getRepository(AssetType).findOneBy({ id: input })
			if (!assetType) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Asset type not found.' })
			}

			await dataSource.getRepository(AssetFolder).update({ assetTypeId: assetType.id }, { assetTypeId: null })
			await dataSource.getRepository(AssetFile).update({ assetTypeId: assetType.id }, { assetTypeId: null })
			await dataSource.getRepository(AssetType).remove(assetType)
		}),
})
