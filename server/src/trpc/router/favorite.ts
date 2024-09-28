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
import { CollectionFile } from "../../entity/collection-file"
import { ProductAttribute } from "../../entity/product-attribute"
import { UserFavorite } from "../../entity/user-favorite"
import { dataSource } from "../../env"
import { authMiddleware, publicProcedure, router, userApproved, userMember } from "../index"
import { formatCollectionFile } from "./collection"

export default router({
	list: publicProcedure
		.use(authMiddleware(userApproved, userMember))
		.query(async ({ ctx }) => {
			const favorites = await dataSource.getRepository(UserFavorite).find({
				where: { userId: ctx.user.id },
				relations: {
					collectionFile: {
						assetFile: {
							product: true,
						},
					},
				},
			})
			const productAttributes = await dataSource.getRepository(ProductAttribute).find()

			return Promise.all(favorites.map((favorite) => formatCollectionFile({
				file: favorite.collectionFile,
				productAttributes,
			})))
		}),
	add: publicProcedure
		.use(authMiddleware(userApproved, userMember))
		.input(z.object({ collectionFileId: z.string().uuid() }))
		.mutation(async ({ input, ctx }) => {
			const collectionFile = await dataSource.getRepository(CollectionFile).findOneBy({ id: input.collectionFileId })
			if (!collectionFile) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Collection file not found.' })
			}

			const favorite = new UserFavorite()
			favorite.user = ctx.user
			favorite.collectionFile = collectionFile
			await dataSource.getRepository(UserFavorite).save(favorite)
		}),
	remove: publicProcedure
		.use(authMiddleware(userApproved, userMember))
		.input(z.object({ collectionFileId: z.string().uuid() }))
		.mutation(async ({ input, ctx }) => {
			await dataSource.getRepository(UserFavorite).delete({
				userId: ctx.user.id,
				collectionFileId: input.collectionFileId
			})
		}),
})
