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
import { In, Not } from "typeorm"
import { z } from "zod"
import { Collection } from "../../entity/collection"
import { MenuItem, MenuItemType } from "../../entity/menu-item"
import { Page } from "../../entity/page"
import { dataSource } from "../../env"
import { userCollectionsQuery } from "../../services/collection"
import { authMiddleware, publicProcedure, router, userAdmin, userApproved } from "../index"

export function formatMenuItem(menuItem: MenuItem) {
	return {
		id: menuItem.id,
		parentId: menuItem.parentId,
		position: menuItem.position,
		type: menuItem.type,
		collectionId: menuItem.collectionId,
		collectionPath: menuItem.collection?.parentCollectionIds ?? undefined,
		collectionName: menuItem.collection?.name ?? undefined,
		pageId: menuItem.pageId,
		pageName: menuItem.page?.name ?? undefined,
		data: menuItem.data,
		home: menuItem.home,
		synchronized: menuItem.collection?.synchronized ?? false,
	}
}

type BuildMenuItemTreeOptions = {
	menuItems: MenuItem[]
	userCollectionIds: string[]
	parentId?: string | null
}

export function buildMenuItemTree({ menuItems, userCollectionIds, parentId = null }: BuildMenuItemTreeOptions) {
	return menuItems
		.filter((current) =>
			current.parentId === parentId &&
			(current.type !== MenuItemType.COLLECTION || userCollectionIds.includes(current.collectionId))
		)
		.map((current) => {
			const children = buildMenuItemTree({ menuItems, userCollectionIds, parentId: current.id })
			return {
				...formatMenuItem(current),
				children: children.length ? children : undefined,
			}
		})
}

export default router({
	list: publicProcedure
		.use(authMiddleware(userApproved))
		.query(async ({ ctx }) => {
			const menuItems = await dataSource.getRepository(MenuItem).find({
				relations: {
					collection: true, // Ensure collection is loaded
					page: true,
				},
			})
			const userCollections = await userCollectionsQuery(ctx.user)
				.select('collection.id').getMany()
			const userCollectionIds = userCollections.map(row => row.id)
			return buildMenuItemTree({ menuItems, userCollectionIds })
		}),
	create: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(z.object({
			type: z.nativeEnum(MenuItemType),
			parentId: z.string().uuid().nullable().optional(),
			collectionId: z.string().uuid().nullable().optional(),
			pageId: z.string().uuid().nullable().optional(),
			data: z.any(),
		}))
		.mutation(async ({ input }) => {
			const menuItem = new MenuItem()
			const menuItems = [menuItem]
			menuItem.type = input.type
			if (input.parentId) {
				const parent = await dataSource.getRepository(MenuItem).findOneBy({ id: input.parentId })
				if (!parent) {
					throw new TRPCError({ code: 'NOT_FOUND', message: 'Parent item not found.' })
				}
				menuItem.parentId = parent.id
				menuItem.parent = parent
			}
			menuItem.position = await dataSource.getRepository(MenuItem).countBy({ parentId: menuItem.parentId ?? null })

			if (input.type === MenuItemType.COLLECTION) {
				const collection = await dataSource.getRepository(Collection).findOneBy({ id: input.collectionId })
				if (!collection) {
					throw new TRPCError({ code: 'NOT_FOUND', message: 'Collection not found.' })
				}
				menuItem.collectionId = collection.id
				menuItem.collection = collection
				if (input.data?.sync) {
					const tree = await dataSource.getTreeRepository(Collection).findDescendantsTree(collection)
					const addChildren = (menuItem: MenuItem, collection: Collection) =>
						menuItem.children = collection.children.map((collection, index) => {
							const newItem = new MenuItem()
							newItem.type = MenuItemType.COLLECTION
							newItem.position = index
							newItem.data = { sync: true }
							newItem.parentId = menuItem.id
							newItem.collectionId = collection.id
							menuItems.push(newItem)
							addChildren(newItem, collection)
							return newItem
						})
					addChildren(menuItem, tree)
				}
			} else if (input.type === MenuItemType.PAGE) {
				const page = await dataSource.getRepository(Page).findOneBy({ id: input.pageId })
				if (!page) {
					throw new TRPCError({ code: 'NOT_FOUND', message: 'Page not found.' })
				}
				menuItem.pageId = page.id
				menuItem.page = page
			} else {
				menuItem.data = input.data
				menuItem.collectionId = null
			}

			await dataSource.getRepository(MenuItem).save(menuItems)
			return formatMenuItem(menuItem)
		}),
	update: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(z.object({
			id: z.string().uuid(),
			type: z.nativeEnum(MenuItemType),
			collectionId: z.string().uuid().nullable().optional(),
			pageId: z.string().uuid().nullable().optional(),
			data: z.any(),
		}))
		.mutation(async ({ input }) => {
			const menuItem = await dataSource.getRepository(MenuItem).findOneBy({ id: input.id })
			if (!menuItem) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Item not found.' })
			}

			if (input.type !== MenuItemType.COLLECTION) {
				menuItem.data = input.data
				menuItem.collectionId = null
			}

			await dataSource.getRepository(MenuItem).save(menuItem)
			return formatMenuItem(menuItem)
		}),
	setHome: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(z.object({
			id: z.string().uuid(),
		}))
		.mutation(async ({ input }) => {
			await dataSource.transaction(async (em) => {
				await em.getRepository(MenuItem).update({ id: Not(input.id) }, { home: false })
				await em.getRepository(MenuItem).update({ id: input.id }, { home: true })
			})
		}),
	remove: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(z.object({
			id: z.string().uuid(),
		}))
		.mutation(async ({ input }) => {
			const menuItem = await dataSource.getTreeRepository(MenuItem).findOneBy({ id: input.id })
			if (!menuItem) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Parent item not found.' })
			}

			await dataSource.getRepository(MenuItem).remove(menuItem)
			return formatMenuItem(menuItem)
		}),
	updatePositions: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(z.object({
			itemsPosition: z.record(z.number()),
		}))
		.mutation(async ({ input }) => {
			const menuItems = await dataSource.getRepository(MenuItem).findBy({
				id: In(Object.keys(input.itemsPosition)),
			})
			menuItems.forEach((item) => item.position = input.itemsPosition[item.id])
			await dataSource.getRepository(MenuItem).save(menuItems)
		}),
})
