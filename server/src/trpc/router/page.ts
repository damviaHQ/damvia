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
import { User } from "../../entity/user"
import { dataSource } from "../../env"
import { blockInputSchema, BlockType, emptyBlockData, uploadKeysOf } from "../../page-blocks/schema"
import { sanitizeBlockHtml } from "../../page-blocks/sanitize"
import { userCollectionsQuery } from "../../services/collection"
import {
	collectPageGarbage,
	createBlockUpload,
	finalizeBlockUpload,
	findPage,
	loadEditablePage,
	removePageObjects,
	resolvePageAssets,
	savePage,
} from "../../services/page"
import { authMiddleware, publicProcedure, router, userAdmin, userApproved } from "../index"

export async function formatPage(page: Page, user?: User) {
	const blocks = [...(page.blocks ?? [])].sort((a, b) => a.position - b.position)
	return {
		id: page.id,
		name: page.name,
		blocks: page.blocks ? blocks.map(formatPageBlock) : undefined,
		// Legacy rows never went through the sanitizer, so assets and text are
		// both resolved for the reader rather than trusted from the database.
		assets: page.blocks && user ? await resolvePageAssets(user, blocks) : undefined,
	}
}

export function formatPageBlock(block: PageBlock) {
	return {
		id: block.id,
		type: block.type as BlockType,
		pageId: block.pageId,
		position: block.position,
		size: block.size,
		data: block.type === PageBlockType.TEXT
			? { ...block.data, html: sanitizeBlockHtml((block.data as { html: string })?.html) }
			: block.data,
	}
}

const uploadKind = z.enum(['image', 'video'])

export default router({
	list: publicProcedure
		.use(authMiddleware(userAdmin))
		.query(async () => {
			const pages = await dataSource.getRepository(Page).find({
				where: { collectionId: IsNull() },
				relations: { blocks: true },
			})
			return Promise.all(pages.map((page) => formatPage(page)))
		}),
	findById: publicProcedure
		.use(authMiddleware(userApproved))
		.input(z.uuid())
		.query(async ({ input, ctx }) => {
			const page = await dataSource.getRepository(Page).findOne({
				where: { id: input, collectionId: IsNull() },
				relations: { blocks: true },
			})
			if (!page) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Page not found.' })
			}
			return formatPage(page, ctx.user)
		}),
	create: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(z.object({
			name: z.string(),
		}))
		.mutation(async ({ input, ctx }) => {
			const page = new Page()
			page.name = input.name
			page.blocks = []
			await dataSource.getRepository(Page).save(page)
			return formatPage(page, ctx.user)
		}),
	createForCollection: publicProcedure
		.use(authMiddleware(userApproved))
		.input(z.object({
			collectionId: z.uuid(),
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
				// Kept on the entity so the caller gets the blocks it just created.
				page.blocks = await em.save([
					new PageBlock({ pageId: page.id, type: PageBlockType.COLLECTIONS, position: 0, size: 'full', data: emptyBlockData('collections') }),
					new PageBlock({ pageId: page.id, type: PageBlockType.FILES, position: 1, size: 'full', data: emptyBlockData('files') }),
				])
			})
			return formatPage(page, ctx.user)
		}),
	update: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(z.object({
			pageId: z.uuid(),
			name: z.string().nullable(),
		}))
		.mutation(async ({ input, ctx }) => {
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
			return formatPage(page, ctx.user)
		}),
	remove: publicProcedure
		.use(authMiddleware(userApproved))
		.input(z.object({
			pageId: z.uuid(),
		}))
		.mutation(async ({ input, ctx }) => {
			const page = await loadEditablePage({ em: dataSource.createEntityManager(), user: ctx.user, pageId: input.pageId })
			const formatted = await formatPage(page, ctx.user)
			await dataSource.getRepository(Page).remove(page)
			// The rows cascade with the page; their objects never would.
			await removePageObjects(input.pageId)
			return formatted
		}),
	// One mutation for the whole page: the editor saves what the author sees.
	save: publicProcedure
		.use(authMiddleware(userApproved))
		.input(z.object({
			pageId: z.uuid(),
			blocks: z.array(blockInputSchema).max(100),
		}))
		.mutation(async ({ input, ctx }) => {
			const page = await loadEditablePage({ em: dataSource.createEntityManager(), user: ctx.user, pageId: input.pageId })
			const blocks = await dataSource.transaction((em) => savePage({ em, page, blocks: input.blocks }))
			// Only once the new payloads are committed can the old ones be dropped.
			await collectPageGarbage(page.id, blocks.flatMap((block) => uploadKeysOf(block.data)))
			return formatPage(page, ctx.user)
		}),
	createUpload: publicProcedure
		.use(authMiddleware(userApproved))
		.input(z.object({
			pageId: z.uuid(),
			kind: uploadKind,
			contentType: z.string().max(100),
		}))
		.mutation(async ({ input, ctx }) => {
			await loadEditablePage({ em: dataSource.createEntityManager(), user: ctx.user, pageId: input.pageId })
			return createBlockUpload(input)
		}),
	finalizeUpload: publicProcedure
		.use(authMiddleware(userApproved))
		.input(z.object({
			pageId: z.uuid(),
			uploadId: z.uuid(),
			kind: uploadKind,
		}))
		.mutation(async ({ input, ctx }) => {
			await loadEditablePage({ em: dataSource.createEntityManager(), user: ctx.user, pageId: input.pageId })
			const { s3key } = await finalizeBlockUpload(input)
			const assets = await resolvePageAssets(ctx.user, [{ data: { media: { source: 'upload', s3key } } } as PageBlock])
			return { s3key, url: assets.uploads[s3key] }
		}),
})

export { findPage }
