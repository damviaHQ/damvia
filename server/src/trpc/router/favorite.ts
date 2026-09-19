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
import { userCollectionFilesQuery, userCollectionsQuery } from '../../services/collection'
import { TRPCError } from "@trpc/server"
import { z } from "zod"
import { ActivityEvent, ActivityEventType } from "../../entity/activity-event"
import { ProductAttribute } from "../../entity/product-attribute"
import { UserCollectionFavorite } from "../../entity/user-collection-favorite"
import { UserFavorite } from "../../entity/user-favorite"
import { dataSource } from "../../env"
import { authMiddleware, publicProcedure, router, userApproved, userMember } from "../index"
import { formatCollectionFile, formatCollection } from "./collection"

export default router({
    listCollections: publicProcedure
        .use(authMiddleware(userApproved, userMember))
        .query(async ({ ctx }) => {
            const collections = await userCollectionsQuery(ctx.user)
                .innerJoin(UserCollectionFavorite, 'favorite', 'favorite.collection_id = collection.id AND favorite.user_id = :favoriteUserId', { favoriteUserId: ctx.user.id })
                .orderBy('collection.name', 'ASC')
                .addOrderBy('collection.id', 'ASC')
                .getMany()
            return Promise.all(collections.map(collection => formatCollection({ collection, user: ctx.user })))
        }),
    addCollection: publicProcedure
        .use(authMiddleware(userApproved, userMember))
        .input(z.object({ collectionId: z.uuid() }))
        .mutation(async ({ input, ctx }) => {
            const collection = await userCollectionsQuery(ctx.user)
                .andWhere('collection.id = :collectionId', { collectionId: input.collectionId })
                .getOne()
            if (!collection) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Collection not found.' })
            }
            await dataSource.getRepository(UserCollectionFavorite).createQueryBuilder()
                .insert().values({ userId: ctx.user.id, collectionId: collection.id }).orIgnore().execute()
        }),
    removeCollection: publicProcedure
        .use(authMiddleware(userApproved, userMember))
        .input(z.object({ collectionId: z.uuid() }))
        .mutation(async ({ input, ctx }) => {
            await dataSource.getRepository(UserCollectionFavorite).delete({
                userId: ctx.user.id,
                collectionId: input.collectionId,
            })
        }),
	list: publicProcedure
		.use(authMiddleware(userApproved, userMember))
		.query(async ({ ctx }) => {
			const files = await userCollectionFilesQuery(ctx.user)
				.innerJoin(UserFavorite, 'favorite', 'favorite.collection_file_id = collection_file.id AND favorite.user_id = :favoriteUserId', { favoriteUserId: ctx.user.id })
				.getMany()
			const productAttributes = await dataSource.getRepository(ProductAttribute).find()

			return Promise.all(files.map((file) => formatCollectionFile({
				file,
				productAttributes,
			})))
		}),
	add: publicProcedure
		.use(authMiddleware(userApproved, userMember))
		.input(z.object({ collectionFileId: z.uuid() }))
		.mutation(async ({ input, ctx }) => {
			const collectionFile = await userCollectionFilesQuery(ctx.user).andWhere('collection_file.id = :fileId', { fileId: input.collectionFileId }).getOne()
			if (!collectionFile) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Collection file not found.' })
			}

			const favorite = new UserFavorite()
			favorite.user = ctx.user
			favorite.collectionFile = collectionFile
			await dataSource.getRepository(UserFavorite).save(favorite)
			await dataSource.getRepository(ActivityEvent).insert({ userId: ctx.user.id, type: ActivityEventType.FAVORITE, assetFileId: collectionFile.assetFileId, collectionId: collectionFile.collectionId })
		}),
	remove: publicProcedure
		.use(authMiddleware(userApproved, userMember))
		.input(z.object({ collectionFileId: z.uuid() }))
		.mutation(async ({ input, ctx }) => {
			await dataSource.getRepository(UserFavorite).delete({
				userId: ctx.user.id,
				collectionFileId: input.collectionFileId
			})
		}),
})
