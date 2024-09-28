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
import { Brackets, EntityManager, SelectQueryBuilder } from "typeorm"
import { Collection } from "../entity/collection"
import { CollectionFile } from "../entity/collection-file"
import { MenuItem, MenuItemType } from "../entity/menu-item"
import { User, UserRole } from "../entity/user"
import { dataSource, mainS3, mainS3Bucket } from "../env"
import { collectionSynchronizationQueue } from "../worker"

export function userCollectionsQuery(user: User): SelectQueryBuilder<Collection> {
	let query = dataSource.getRepository(Collection)
		.createQueryBuilder('collection')
		.leftJoinAndMapOne(
			'collection.assetFolder',
			'collection.assetFolder',
			'asset_folder',
			'asset_folder.id = collection.asset_folder_id',
		)
		.leftJoinAndMapOne(
			'asset_folder.license',
			'asset_folder.license',
			'license',
			'license.id = asset_folder.license_id',
		)
		.where(new Brackets((q) => {
			q = q.where("collection.owner_id = :userId", { userId: user.id })
			if (user.role === UserRole.ADMIN) {
				q = q.orWhere("collection.public IS TRUE")
			} else if (user.role !== UserRole.GUEST) {
				q = q.orWhere(
					"(collection.public IS TRUE AND collection.draft IS FALSE) AND (asset_folder.license_id IS NULL OR (:regionId = ANY(license.allowed_region_ids) AND license.usage_from <= now() AND license.usage_to >= now()))",
					{ regionId: user.regionId },
				)
			}
			q.orWhere("(SELECT COUNT(*) FROM collection_invitations WHERE collection_invitations.user_id = :userId AND collection_invitations.collection_id::text = ANY(string_to_array(collection.mpath, '.')) AND collection_invitations.expires_at > now()) > 0")
			return q
		}))
	return query
}

export function userCollectionFilesQuery(user: User): SelectQueryBuilder<CollectionFile> {
	let query = dataSource.getRepository(CollectionFile)
		.createQueryBuilder('collection_file')
		.innerJoinAndMapOne(
			'collection_file.collection',
			'collection_file.collection',
			'collection',
			'collection.id = collection_file.collection_id',
		)
		.innerJoinAndMapOne(
			'collection_file.assetFile',
			'collection_file.assetFile',
			'asset_file',
			'asset_file.id = collection_file.asset_file_id',
		)
		.leftJoinAndMapOne(
			'asset_file.license',
			'asset_file.license',
			'license',
			'license.id = asset_file.license_id',
		)
		.leftJoinAndMapOne(
			'asset_file.assetType',
			'asset_file.assetType',
			'asset_type',
			'asset_type.id = asset_file.asset_type_id',
		)
		.leftJoinAndMapOne(
			'asset_file.product',
			'asset_file.product',
			'product',
			'product.id = asset_file.product_id',
		)
		.where(new Brackets((q) => {
			q = q.where("collection.owner_id = :userId", { userId: user.id })
			if (user.role === UserRole.ADMIN) {
				q = q.orWhere("collection.public IS TRUE")
			} else if (user.role !== UserRole.GUEST) {
				q = q.orWhere(
					"(collection.public IS TRUE AND collection.draft IS FALSE) AND (asset_file.license_id IS NULL OR (:regionId = ANY(license.allowed_region_ids) AND license.usage_from <= now() AND license.usage_to >= now()))",
					{ regionId: user.regionId }
				)
			}
			q.orWhere("(SELECT COUNT(*) FROM collection_invitations WHERE collection_invitations.user_id = :userId AND collection_invitations.collection_id::text = ANY(string_to_array(collection.mpath, '.')) AND collection_invitations.expires_at > now()) > 0")
			return q
		}))
	return query
}

export async function syncCollectionMenuItems(em: EntityManager, collection: Collection, recursive = false) {
	if (!collection.children) {
		collection.children = await em.getRepository(Collection).findBy({ parentId: collection.id })
	}

	if (!collection.public) {
		await em.getRepository(MenuItem).delete({ collectionId: collection.id })
		return []
	}

	if (!collection.parentId) {
		const count = await em.getRepository(MenuItem).countBy({ collectionId: collection.id, parentId: null })
		if (count > 0) {
			return []
		}
	}

	const menuItems = collection.parentId ? await em.getRepository(MenuItem).find({
		where: { collectionId: collection.parentId },
		relations: { children: true },
	}) : []
	const newMenuItem = (parentId: string, position: number) => {
		const menuItem = new MenuItem()
		menuItem.type = MenuItemType.COLLECTION
		menuItem.parentId = parentId
		menuItem.data = { sync: true }
		menuItem.position = position
		menuItem.collectionId = collection.id
		return menuItem
	}
	const menuItemsToCreate = menuItems
		.filter((item) => item.data?.sync && !item.children.some((current) => current.collectionId === collection.id))
		.map((item) => newMenuItem(item.id, item.children.length))

	if (!collection.parentId) {
		menuItemsToCreate.push(newMenuItem(null, menuItems.length))
	}

	if (menuItemsToCreate.length) {
		await em.getRepository(MenuItem).save(menuItemsToCreate)
	}
	if (recursive) {
		for (const child of collection.children) {
			const subItemsCreated = await syncCollectionMenuItems(em, child, recursive)
			menuItemsToCreate.push(...subItemsCreated)
		}
	}
	return menuItemsToCreate
}

export async function synchronizeCollection(em: EntityManager, collectionId: string) {
	const collection = await em.getRepository(Collection).findOne({
		where: { id: collectionId },
		relations: {
			assetFolder: { children: true },
		},
	})
	if (!collection) {
		return
	}

	collection.name = collection.assetFolder.name
	await em.getRepository(Collection).save(collection)
	await syncCollectionMenuItems(em, collection)

	// upsert collection files
	await em.query(`
		WITH inserted_rows AS (
			INSERT INTO collection_files(asset_file_id, collection_id)
			SELECT id, $1 FROM asset_files
			WHERE folder_id = $2
			ON CONFLICT (asset_file_id, collection_id) DO UPDATE SET updated_at = now()
			RETURNING id
		)
		DELETE FROM collection_files
		WHERE collection_id = $1
		AND id NOT IN (SELECT id FROM inserted_rows)
	`, [collection.id, collection.assetFolderId])

	// upsert child collections
	const childCollectionRows = await em.query(`
		WITH
			inserted_rows AS (
				INSERT INTO collections(id, name, public, draft, asset_folder_id, parent_id, created_at, updated_at, mpath, owner_id)
				SELECT sub_collection_id, name, $2, $3, id, $1, now(), now(), $4 || sub_collection_id || '.', $5
				FROM (SELECT *, uuid_generate_v4() AS sub_collection_id FROM asset_folders WHERE parent_id = $6) AS asset_folders
				ON CONFLICT (parent_id, name) DO UPDATE SET updated_at = now()
				RETURNING id
			),
			deleted_rows AS (
				DELETE FROM collections
				WHERE parent_id = $1
				AND id NOT IN (SELECT id FROM inserted_rows)
				RETURNING id
			)
		SELECT id FROM inserted_rows
	`, [collection.id, collection.public, collection.draft, collection.path, collection.ownerId, collection.assetFolderId])

	if (childCollectionRows.length > 0) {
		const jobs = childCollectionRows.map((row) => ({
			data: { collectionId: row.id },
		}))
		await collectionSynchronizationQueue.bulkPush(jobs)
	}
}

export async function removeCollection(em: EntityManager, collectionId: string) {
	const collection = await em.getRepository(Collection).findOneBy({ id: collectionId })
	await em.getRepository(Collection).delete({ id: collectionId })
	if (collection.hasThumbnail) {
		await mainS3().removeObjects(mainS3Bucket(), [collection.thumbnailStorageKey])
	}
}

export type DuplicateCollectionOptions = {
	em: EntityManager,
	source: Collection
	destination: Collection
}

export async function duplicateCollection({ em, source, destination }: DuplicateCollectionOptions) {
	return em
		.transaction(async (em) => {
			const duplicate = new Collection()
			duplicate.name = source.name
			duplicate.description = source.description
			duplicate.parent = destination
			duplicate.public = destination.public
			duplicate.draft = destination.draft
			duplicate.ownerId = destination.ownerId
			await em.getRepository(Collection).save(duplicate)

			const files = await em.getRepository(CollectionFile).findBy({ collectionId: source.id })
			await duplicateFiles({ em, files, destination: duplicate })

			const children = await em.getRepository(Collection).findBy({ parentId: source.id })
			for (const current of children) {
				await duplicateCollection({ em, source: current, destination: duplicate })
			}
		})
		.catch((error) => {
			if (/^Key \(parent_id, name\)=\(.+\) already exists.$/.test(error.detail)) {
				return
			}
			throw error
		})
}

export type DuplicateFilesOptions = {
	em: EntityManager,
	files: CollectionFile[]
	destination: Collection
}

export async function duplicateFiles({ em, files, destination }: DuplicateFilesOptions) {
	for (const current of files) {
		await em
			.transaction(async (em) => {
				const file = new CollectionFile()
				file.collection = destination
				file.assetFileId = current.assetFileId
				await em.getRepository(CollectionFile).save(file)
			})
			.catch((error) => {
				if (/^Key \(collection_id, asset_file_id\)=\(.+\) already exists.$/.test(error.detail)) {
					return
				}
				throw error
			})
	}
}
