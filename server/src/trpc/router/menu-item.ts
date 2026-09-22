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
import { In, Not, IsNull } from "typeorm"
import { z } from "zod"
import { Collection } from "../../entity/collection"
import { MenuItem, MenuItemType } from "../../entity/menu-item"
import { Page } from "../../entity/page"
import { UserRole } from "../../entity/user"
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
	// An administrator keeps an empty section, which is the only way to fill a
	// section that was just created. A reader is spared the heading.
	keepEmptySections?: boolean
}

export function buildMenuItemTree({ menuItems, userCollectionIds, parentId = null, keepEmptySections = false }: BuildMenuItemTreeOptions) {
	return menuItems
		.filter((current) => current.parentId === parentId)
		.map((current) => {
			const children = buildMenuItemTree({ menuItems, userCollectionIds, parentId: current.id, keepEmptySections })
			const isCurrentVisible = current.type === MenuItemType.SECTION
				? keepEmptySections || children.length > 0
				: current.type !== MenuItemType.COLLECTION || userCollectionIds.includes(current.collectionId ?? '')
			if (isCurrentVisible || children.length > 0) {
				return {
					...formatMenuItem(current),
					children: children.length ? children : undefined,
					hasAccess: isCurrentVisible,
				}
			}

			return null
		})
		.filter(Boolean)
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
			return buildMenuItemTree({ menuItems, userCollectionIds, keepEmptySections: ctx.user.role === UserRole.ADMIN })
		}),
	create: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(z.object({
			type: z.enum(MenuItemType),
			parentId: z.uuid().nullable().optional(),
			collectionId: z.uuid().nullable().optional(),
			pageId: z.uuid().nullable().optional(),
			data: z.any(),
		}))
		.mutation(async ({ input }) => {
			const menuItem = new MenuItem()
			menuItem.type = input.type
			// A section is a heading in the sidebar: it holds other items and
			// never sits inside one.
			if (input.type === MenuItemType.SECTION && input.parentId) {
				throw new TRPCError({ code: 'BAD_REQUEST', message: 'A section cannot be placed inside another item.' })
			}
			if (input.parentId) {
				const parent = await dataSource.getRepository(MenuItem).findOneBy({ id: input.parentId })
				if (!parent) {
					throw new TRPCError({ code: 'NOT_FOUND', message: 'Parent item not found.' })
				}
				menuItem.parentId = parent.id
				menuItem.parent = parent
			}
			menuItem.position = await dataSource.getRepository(MenuItem).countBy({ parentId: menuItem.parentId ?? IsNull() })

			let syncTree: Collection | null = null
			if (input.type === MenuItemType.COLLECTION) {
				const collection = input.collectionId ? await dataSource.getRepository(Collection).findOneBy({ id: input.collectionId }) : null
				if (!collection) {
					throw new TRPCError({ code: 'NOT_FOUND', message: 'Collection not found.' })
				}
				menuItem.collectionId = collection.id
				menuItem.collection = collection
				menuItem.data = input.data
				if (input.data?.sync) {
					syncTree = await dataSource.getTreeRepository(Collection).findDescendantsTree(collection)
				}
			} else if (input.type === MenuItemType.PAGE) {
				const page = input.pageId ? await dataSource.getRepository(Page).findOneBy({ id: input.pageId }) : null
				if (!page) {
					throw new TRPCError({ code: 'NOT_FOUND', message: 'Page not found.' })
				}
				menuItem.pageId = page.id
				menuItem.page = page
			} else {
				menuItem.data = input.data
				menuItem.collectionId = null
			}

			await dataSource.transaction(async (em) => {
				await em.getRepository(MenuItem).save(menuItem)
				// Items are stored one at a time: the path of an item is derived
				// from a parent that is already in the database.
				const addChildren = async (parent: MenuItem, collection: Collection) => {
					for (const [index, child] of collection.children.entries()) {
						const newItem = new MenuItem()
						newItem.type = MenuItemType.COLLECTION
						newItem.position = index
						newItem.data = { sync: true }
						newItem.parentId = parent.id
						newItem.parent = parent
						newItem.collectionId = child.id
						await em.getRepository(MenuItem).save(newItem)
						await addChildren(newItem, child)
					}
				}
				if (syncTree) {
					await addChildren(menuItem, syncTree)
				}
			})
			return formatMenuItem(menuItem)
		}),
	update: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(z.object({
			id: z.uuid(),
			type: z.enum(MenuItemType),
			collectionId: z.uuid().nullable().optional(),
			pageId: z.uuid().nullable().optional(),
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
			id: z.uuid(),
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
			id: z.uuid(),
		}))
		.mutation(async ({ input }) => {
			const menuItem = await dataSource.getTreeRepository(MenuItem).findOneBy({ id: input.id })
			if (!menuItem) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Parent item not found.' })
			}
			// Everything under an item goes with it. A section holds the whole
			// menu, so emptying it is asked for rather than done silently.
			if (menuItem.type === MenuItemType.SECTION) {
				const children = await dataSource.getRepository(MenuItem).countBy({ parentId: menuItem.id })
				if (children > 0) {
					throw new TRPCError({ code: 'BAD_REQUEST', message: 'Move the entries of this section elsewhere before removing it.' })
				}
			}

			await dataSource.getRepository(MenuItem).remove(menuItem)
			return formatMenuItem(menuItem)
		}),
	updatePositions: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(z.object({
			itemsPosition: z.record(z.string(), z.number()),
		}))
		.mutation(async ({ input }) => {
			const menuItems = await dataSource.getRepository(MenuItem).findBy({
				id: In(Object.keys(input.itemsPosition)),
			})
			menuItems.forEach((item) => item.position = input.itemsPosition[item.id])
			await dataSource.getRepository(MenuItem).save(menuItems)
		}),
})
