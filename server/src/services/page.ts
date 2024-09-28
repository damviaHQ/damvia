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
import { randomUUID } from "node:crypto"
import { EntityManager } from "typeorm"
import { Page } from "../entity/page"
import { PageBlock, PageBlockType } from "../entity/page-block"
import { User, UserRole } from "../entity/user"
import { mainS3, mainS3Bucket } from "../env"
import { userCollectionsQuery } from "./collection"

export type FindPageOptions = { em: EntityManager, user: User, pageId: string }

export async function findPage({ em, user, pageId }: FindPageOptions) {
	const page = await em.getRepository(Page).findOne({
		where: { id: pageId },
		relations: { blocks: true }
	})
	if (!page) {
		return null
	} else if (user.role === UserRole.ADMIN) {
		return page
	} else if (!page.collectionId) {
		return null
	}

	page.collection = await userCollectionsQuery(user)
		.andWhere('collection.id = :id', { id: page.collectionId })
		.getOne()
	if (!page.collection) {
		return null
	}
	return page
}

export type UpdateBlockDataOptions = { em: EntityManager, block: PageBlock, data?: any }

export async function updateBlockData(opts: UpdateBlockDataOptions) {
	if ([PageBlockType.IMAGE, PageBlockType.VIDEO].includes(opts.block.type)) {
		if (!opts.block.data) {
			opts.block.data = {}
		}
		if (!opts.block.data?.s3key) {
			opts.block.data.s3key = `blocks/${opts.block.pageId}/${randomUUID()}`
		}
		if (opts.block.type === PageBlockType.IMAGE) {
			opts.block.data.url = opts.data?.url
			opts.block.data.external = opts.data?.external
		}
	} else {
		opts.block.data = opts.data
	}
	await opts.em.getRepository(PageBlock).save(opts.block)
}

export type RemoveBlockOptions = { em: EntityManager, block: PageBlock }

export async function removeBlock(opts: RemoveBlockOptions) {
	await opts.em.getRepository(PageBlock).remove(opts.block)
	if ([PageBlockType.IMAGE, PageBlockType.VIDEO].includes(opts.block.type) && opts.block.data.s3key) {
		await mainS3().removeObjects(mainS3Bucket(), [opts.block.data.s3key])
	}
}
