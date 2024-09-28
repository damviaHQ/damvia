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
import { IsNull } from "typeorm"
import { z } from "zod"
import { Page } from "../../entity/page"
import { PageBlock, PageBlockType } from "../../entity/page-block"
import { dataSource, mainS3, mainS3Bucket } from "../../env"
import { userCollectionsQuery } from "../../services/collection"
import { findPage, removeBlock, updateBlockData } from "../../services/page"
import { authMiddleware, publicProcedure, router, userAdmin, userApproved } from "../index"

export async function formatPage(page: Page) {
	return {
		id: page.id,
		name: page.name,
		blocks: page.blocks ? await Promise.all(page.blocks.map(formatPageBlock)) : undefined,
	}
}

export async function formatPageBlock(block: PageBlock) {
	const data = block.data
	if ([PageBlockType.IMAGE, PageBlockType.VIDEO].includes(block.type) && data.s3key) {
		data.presignedUrl = await mainS3().presignedGetObject(mainS3Bucket(), data.s3key)
	}

	return {
		id: block.id,
		type: block.type,
		pageId: block.pageId,
		column: block.column,
		row: block.row,
		width: block.width,
		data,
	}
}

export default router({
	list: publicProcedure
		.use(authMiddleware(userAdmin))
		.query(async () => {
			const pages = await dataSource.getRepository(Page).find({
				where: { collectionId: IsNull() },
				relations: { blocks: true },
			})
			return Promise.all(pages.map(formatPage))
		}),
	findById: publicProcedure
		.use(authMiddleware(userApproved))
		.input(z.string().uuid())
		.query(async ({ input }) => {
			const page = await dataSource.getRepository(Page).findOne({
				where: { id: input, collectionId: IsNull() },
				relations: { blocks: true },
			})
			if (!page) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Page not found.' })
			}
			return formatPage(page)
		}),
	create: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(z.object({
			name: z.string(),
		}))
		.mutation(async ({ input }) => {
			const page = new Page()
			page.name = input.name
			await dataSource.getRepository(Page).save(page)
			return formatPage(page)
		}),
	createForCollection: publicProcedure
		.use(authMiddleware(userApproved))
		.input(z.object({
			collectionId: z.string().uuid(),
		}))
		.mutation(async ({ input, ctx }) => {
			const collection = await userCollectionsQuery(ctx.user)
				.andWhere('collection.id = :id', { id: input.collectionId })
				.getOne()
			if (!collection) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Collection not found.' })
			} else if (!collection.canEdit(ctx.user)) {
				throw new TRPCError({ code: 'FORBIDDEN', message: 'This collection cannot be edited.' })
			}

			const page = new Page()
			page.collectionId = collection.id
			await dataSource.transaction(async (em) => {
				await em.save(page)
				await em.save([
					new PageBlock({ pageId: page.id, type: PageBlockType.COLLECTIONS, width: 1, column: 0, row: 0 }),
					new PageBlock({ pageId: page.id, type: PageBlockType.FILES, width: 1, column: 0, row: 1 }),
				])
			})
			return formatPage(page)
		}),
	update: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(z.object({
			pageId: z.string().uuid(),
			name: z.string().nullable(),
		}))
		.mutation(async ({ input }) => {
			const page = await dataSource.getRepository(Page).findOne({
				where: { id: input.pageId, collectionId: IsNull() },
				relations: { blocks: true },
			})

			if (!page) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Page not found.' })
			}

			if (input.name) {
				page.name = input.name
			}

			await dataSource.getRepository(Page).save(page)
			return formatPage(page)
		}),
	remove: publicProcedure
		.use(authMiddleware(userApproved))
		.input(z.object({
			pageId: z.string().uuid(),
		}))
		.mutation(async ({ input, ctx }) => {
			const page = await findPage({ em: dataSource.createEntityManager(), user: ctx.user, pageId: input.pageId })
			if (!page) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Page not found.' })
			} else if (!page.canEdit(ctx.user)) {
				throw new TRPCError({ code: 'FORBIDDEN', message: 'This page cannot be edited.' })
			}

			await dataSource.getRepository(Page).remove(page)
			return formatPage(page)
		}),
	addBlock: publicProcedure
		.use(authMiddleware(userApproved))
		.input(z.object({
			pageId: z.string().uuid(),
			type: z.nativeEnum(PageBlockType),
			width: z.number(),
			column: z.number(),
			row: z.number(),
			data: z.any().optional().nullable(),
		}))
		.mutation(async ({ input, ctx }) => {
			const page = await findPage({ em: dataSource.createEntityManager(), user: ctx.user, pageId: input.pageId })
			if (!page) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Page not found.' })
			} else if (!page.canEdit(ctx.user)) {
				throw new TRPCError({ code: 'FORBIDDEN', message: 'This page cannot be edited.' })
			}

			const block = new PageBlock()
			block.page = page
			block.type = PageBlockType[input.type.toUpperCase()]
			block.width = input.width
			block.column = input.column
			block.row = input.row
			await dataSource.transaction(async (em) => {
				await em.getRepository(PageBlock).save(block)
				await updateBlockData({ em, block, data: input.data })
			})
			return formatPageBlock(block)
		}),
	removeBlock: publicProcedure
		.use(authMiddleware(userApproved))
		.input(z.object({
			pageId: z.string().uuid(),
			blockId: z.string().uuid(),
		}))
		.mutation(async ({ input, ctx }) => {
			const page = await findPage({ em: dataSource.createEntityManager(), user: ctx.user, pageId: input.pageId })
			if (!page) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Page not found.' })
			} else if (!page.canEdit(ctx.user)) {
				throw new TRPCError({ code: 'FORBIDDEN', message: 'This page cannot be edited.' })
			}

			const block = page.blocks.find((block) => block.id === input.blockId)
			if (!block) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Block not found.' })
			}

			await dataSource.transaction((em) => removeBlock({ em, block }))
			return formatPageBlock(block)
		}),
	updateLayout: publicProcedure
		.use(authMiddleware(userApproved))
		.input(z.object({
			pageId: z.string().uuid(),
			blocks: z.array(z.object({
				id: z.string().uuid(),
				width: z.number(),
				column: z.number(),
				row: z.number(),
			}))
		}))
		.mutation(async ({ input, ctx }) => {
			const page = await findPage({ em: dataSource.createEntityManager(), user: ctx.user, pageId: input.pageId })
			if (!page) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Page not found.' })
			} else if (!page.canEdit(ctx.user)) {
				throw new TRPCError({ code: 'FORBIDDEN', message: 'This page cannot be edited.' })
			}

			const updatedBlocks = page.blocks.filter((block) => {
				const update = input.blocks.find((current) => current.id === block.id)
				if (!update) {
					return false
				}

				block.width = update.width
				block.column = update.column
				block.row = update.row
				return true
			})
			await dataSource.getRepository(PageBlock).save(updatedBlocks)
			return Promise.all(page.blocks.map(formatPageBlock))
		}),
	updateBlockData: publicProcedure
		.use(authMiddleware(userApproved))
		.input(z.object({
			pageId: z.string().uuid(),
			blockId: z.string().uuid(),
			data: z.any().optional().nullable(),
		}))
		.mutation(async ({ input, ctx }) => {
			const page = await findPage({ em: dataSource.createEntityManager(), user: ctx.user, pageId: input.pageId })
			if (!page) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Page not found.' })
			} else if (!page.canEdit(ctx.user)) {
				throw new TRPCError({ code: 'FORBIDDEN', message: 'This page cannot be edited.' })
			}

			const block = page.blocks.find((block) => block.id === input.blockId)
			if (!block) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Block not found.' })
			}

			await dataSource.transaction((em) => updateBlockData({ em, block, data: input.data }))
			return formatPageBlock(block)
		}),
	presignedUploadUrl: publicProcedure
		.use(authMiddleware(userApproved))
		.input(z.object({
			pageId: z.string().uuid(),
			blockId: z.string().uuid(),
		}))
		.query(async ({ input, ctx }) => {
			const page = await findPage({ em: dataSource.createEntityManager(), user: ctx.user, pageId: input.pageId })
			if (!page) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Page not found.' })
			} else if (!page.canEdit(ctx.user)) {
				throw new TRPCError({ code: 'FORBIDDEN', message: 'This page cannot be edited.' })
			}

			const block = page.blocks.find((block) => block.id === input.blockId)
			if (!block) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Block not found.' })
			} else if (![PageBlockType.IMAGE, PageBlockType.VIDEO].includes(block.type)) {
				throw new TRPCError({ code: 'BAD_REQUEST', message: 'Unsupported block type.' })
			}
			return mainS3().presignedPutObject(mainS3Bucket(), block.data.s3key, 24 * 60 * 60)
		}),
})
