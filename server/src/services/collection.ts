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
import { Brackets, EntityManager, SelectQueryBuilder, In, IsNull } from "typeorm"
import { Collection } from "../entity/collection"
import { CollectionFile } from "../entity/collection-file"
import { Page } from "../entity/page"
import { MenuItem, MenuItemType } from "../entity/menu-item"
import { User, UserRole } from "../entity/user"
import { dataSource, logger, mainS3, mainS3Bucket } from "../env"
import { collectionSynchronizationQueue } from "../worker"

import { removePageObjects } from "./page-storage"

export function userCollectionsQuery(user: User, em: EntityManager = dataSource.manager): SelectQueryBuilder<Collection> {
	let query = em.getRepository(Collection)
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
					"(collection.public IS TRUE AND collection.draft IS FALSE) AND (coalesce(array_length(collection.limited_to_group_ids, 1), 0) = 0)",
				)
			}
			q.orWhere('((SELECT array_agg(group_id::text) FROM user_groups WHERE user_id = :userId) && "collection"."limited_to_group_ids")')
			q.orWhere("(SELECT COUNT(*) FROM collection_invitations WHERE collection_invitations.user_id = :userId AND collection_invitations.collection_id::text = ANY(string_to_array(collection.mpath, '.')) AND collection_invitations.expires_at > now()) > 0")
			return q
		}))
	if (user.role !== UserRole.ADMIN) {
		query.andWhere("(collection.draft IS FALSE OR collection.owner_id = :userId)", { userId: user.id })
		query.andWhere("(asset_folder.license_id IS NULL OR (:regionId = ANY(license.allowed_region_ids) AND (license.usage_from IS NULL OR license.usage_from <= CURRENT_DATE) AND (license.usage_to IS NULL OR license.usage_to >= CURRENT_DATE)))", { regionId: user.regionId })
	}
	return query
}

export function userCollectionFilesQuery(user: User, em: EntityManager = dataSource.manager): SelectQueryBuilder<CollectionFile> {
	let query = em.getRepository(CollectionFile)
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
					"(collection.public IS TRUE AND collection.draft IS FALSE) AND (coalesce(array_length(collection.limited_to_group_ids, 1), 0) = 0)",
				)
			}
			q.orWhere('((SELECT array_agg(group_id::text) FROM user_groups WHERE user_id = :userId) && "collection"."limited_to_group_ids")')
			q.orWhere("(SELECT COUNT(*) FROM collection_invitations WHERE collection_invitations.user_id = :userId AND collection_invitations.collection_id::text = ANY(string_to_array(collection.mpath, '.')) AND collection_invitations.expires_at > now()) > 0")
			return q
		}))
	if (user.role !== UserRole.ADMIN) {
		query.andWhere("(collection.draft IS FALSE OR collection.owner_id = :userId)", { userId: user.id })
		query.andWhere("(asset_file.license_id IS NULL OR (:regionId = ANY(license.allowed_region_ids) AND (license.usage_from IS NULL OR license.usage_from <= CURRENT_DATE) AND (license.usage_to IS NULL OR license.usage_to >= CURRENT_DATE)))", { regionId: user.regionId })
	}
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
		const count = await em.getRepository(MenuItem).countBy({ collectionId: collection.id, parentId: IsNull() })
		if (count > 0) {
			return []
		}
	}

	const menuItems = collection.parentId ? await em.getRepository(MenuItem).find({
		where: { collectionId: collection.parentId },
		relations: { children: true },
	}) : []
	const newMenuItem = (parent: MenuItem | null, position: number) => {
		const menuItem = new MenuItem()
		menuItem.type = MenuItemType.COLLECTION
		menuItem.parentId = parent?.id ?? null
		menuItem.parent = parent
		menuItem.data = { sync: true }
		menuItem.position = position
		menuItem.collectionId = collection.id
		return menuItem
	}
	const menuItemsToCreate = menuItems
		.filter((item) => item.data?.sync && !item.children.some((current) => current.collectionId === collection.id))
		.map((item) => newMenuItem(item, item.children.length))

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

export type ReparentSubtreeOptions = {
	table: 'collections' | 'menu_items' | 'asset_folders'
	nodeId: string
	newParentId: string | null
}

// Moves a node and its whole subtree under another parent by rewriting the
// materialized paths in one statement. TypeORM's save() cannot be trusted for
// this; every tree move in the code base goes through here.
export async function reparentSubtree(em: EntityManager, { table, nodeId, newParentId }: ReparentSubtreeOptions) {
	const [node] = await em.query(`SELECT mpath, parent_id FROM ${table} WHERE id = $1`, [nodeId])
	if (!node?.mpath) {
		throw new Error(`${table} ${nodeId} has no path`)
	}
	let parentPath = ''
	if (newParentId) {
		const [parent] = await em.query(`SELECT mpath FROM ${table} WHERE id = $1`, [newParentId])
		if (!parent?.mpath) {
			throw new Error(`${table} ${newParentId} has no path`)
		}
		if (parent.mpath.startsWith(node.mpath)) {
			throw new Error(`${table} ${nodeId} cannot move inside itself`)
		}
		parentPath = parent.mpath
	}
	const newPath = `${parentPath}${nodeId}.`
	if (newPath === node.mpath && (node.parent_id ?? null) === newParentId) {
		return
	}
	await em.query(`
		UPDATE ${table}
		SET mpath = $3 || substring(mpath from length($2) + 1),
			parent_id = CASE WHEN id = $1 THEN $4::uuid ELSE parent_id END,
			updated_at = now()
		WHERE left(mpath, length($2)) = $2 AND mpath LIKE $2 || '%'
	`, [nodeId, node.mpath, newPath, newParentId])
}

// A restricted parent hands its group restriction to everything below it. The
// database does that through two triggers, one on parent_id and one on the group
// column, and a path rewrite fires neither of them for the descendants of the
// moved node, so the subtree is aligned here. A parent with no restriction
// leaves the subtree alone: the collection keeps the groups it chose.
async function inheritGroupsInSubtree(em: EntityManager, path: string, parent: Collection) {
	if (!parent.limitedToGroupIds.length) {
		return
	}
	await em.query(`
		UPDATE collections SET limited_to_group_ids = $2, can_edit_limited_to_group_ids = false
		WHERE mpath LIKE $1 || '%'
	`, [path, parent.limitedToGroupIds])
}

// Full recompute of the counters the triggers maintain, for the given
// collections or for all of them. Path rewrites and rescues leave the
// triggers behind, so callers pass every ancestor chain they touched.
export async function recomputeCollectionRollups(em: EntityManager, collectionIds?: string[]) {
	if (collectionIds && collectionIds.length === 0) {
		return
	}
	// The count walks each file's ancestor ids, as the triggers do; matching
	// every collection's path against every other is quadratic, which the
	// nightly unscoped call cannot afford.
	await em.query(`
		UPDATE collections c
		SET number_of_files = coalesce((
				SELECT counts.n FROM (
					SELECT ancestor.id::uuid AS id, count(*) AS n
					FROM collection_files
					INNER JOIN collections d ON d.id = collection_files.collection_id
					CROSS JOIN unnest(string_to_array(d.mpath, '.')) AS ancestor(id)
					WHERE ancestor.id <> ''
					GROUP BY 1
				) counts WHERE counts.id = c.id
			), 0),
			sample_file_ids = coalesce((
				SELECT ARRAY_AGG(subquery.id)
				FROM (
					SELECT collection_files.id
					FROM collection_files
					INNER JOIN collections collection_file_collection ON collection_files.collection_id = collection_file_collection.id
					INNER JOIN asset_files ON collection_files.asset_file_id = asset_files.id AND asset_files.has_thumbnail
					WHERE collection_file_collection.mpath LIKE c.mpath || '%'
					ORDER BY array_position(string_to_array(c.mpath, '.'), collection_files.collection_id::text) NULLS LAST, collection_files.created_at
					LIMIT 4
				) AS subquery
			), ARRAY[]::uuid[])
		${collectionIds ? 'WHERE c.id = ANY($1::uuid[])' : ''}
	`, collectionIds ? [collectionIds] : [])
}

const pathIds = (path: string | null | undefined) => (path ?? '').split('.').filter((id) => id)

// Serialises every job touching one synchronized tree on the topmost
// synchronized ancestor, whatever worker process runs it.
async function lockSynchronizedTree(em: EntityManager, path: string) {
	const [root] = await em.query(`
		SELECT id FROM collections
		WHERE id::text = ANY(string_to_array($1, '.')) AND asset_folder_id IS NOT NULL
		ORDER BY array_position(string_to_array($1, '.'), id::text)
		LIMIT 1
	`, [path])
	await em.query('SELECT pg_advisory_xact_lock(hashtext($1))', [root?.id ?? path])
}

export async function synchronizeCollection(em: EntityManager, collectionId: string) {
	const collection = await em.getRepository(Collection).findOne({
		where: { id: collectionId },
		relations: { assetFolder: true },
	})
	if (!collection?.assetFolder) {
		return
	}
	await lockSynchronizedTree(em, collection.path!)

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

	// upsert child collections; rows the sync did not create are never touched,
	// and rows of a folder that came back lose their orphan flag
	const childCollectionRows = await em.query(`
		INSERT INTO collections(id, name, public, draft, asset_folder_id, parent_id, created_at, updated_at, mpath, owner_id)
		SELECT sub_collection_id, name, $2, $3, id, $1, now(), now(), $4 || sub_collection_id || '.', $5
		FROM (SELECT *, uuid_generate_v4() AS sub_collection_id FROM asset_folders WHERE parent_id = $6 AND status <> 'pending_deletion') AS asset_folders
		ON CONFLICT (parent_id, asset_folder_id) WHERE asset_folder_id IS NOT NULL
		DO UPDATE SET name = EXCLUDED.name, updated_at = now(), orphaned_at = NULL, orphaned_from_name = NULL, orphaned_reason = NULL
		RETURNING id
	`, [collection.id, collection.public, collection.draft, collection.path, collection.ownerId, collection.assetFolderId])

	if (childCollectionRows.length > 0) {
		const jobs = childCollectionRows.map((row) => ({
			data: { collectionId: row.id },
		}))
		await collectionSynchronizationQueue.bulkPush(jobs)
	}
}

// The synchronized menu items of a collection follow it from one parent's
// items to the other's; items that find no place under the new parent go.
async function moveCollectionMenuItems(em: EntityManager, collection: Collection, oldParentId: string | null, newParentId: string | null) {
	const items = await em.getRepository(MenuItem).find({ where: { collectionId: collection.id }, relations: { parent: true } })
	const movable = items.filter((item) => item.data?.sync && item.parent?.data?.sync && item.parent.collectionId === oldParentId)
	const targets = newParentId ? await em.getRepository(MenuItem).find({ where: { collectionId: newParentId }, relations: { children: true } }) : []
	for (const target of targets.filter((item) => item.data?.sync && !item.children.some((child) => child.collectionId === collection.id))) {
		const item = movable.shift()
		if (!item) break
		await reparentSubtree(em, { table: 'menu_items', nodeId: item.id, newParentId: target.id })
		await em.getRepository(MenuItem).update(item.id, { position: target.children.length })
	}
	if (movable.length) {
		await em.getRepository(MenuItem).delete({ id: In(movable.map((item) => item.id)) })
	}
	await syncCollectionMenuItems(em, collection)
}

async function flagOrphan(em: EntityManager, collection: Collection, reason: string, fromName: string | null) {
	await em.getRepository(Collection).update(collection.id, { orphanedAt: new Date(), orphanedReason: reason, orphanedFromName: fromName })
	logger.warn('collection.orphaned', { collectionId: collection.id, name: collection.name, reason, from: fromName })
}

// An administrator moves a collection by hand. The synchronization owns the
// place of the rows it created, so the caller only lets custom collections and
// sync roots through. Visibility, name and cycle checks belong to the caller;
// the group restrictions are re-derived by the database triggers.
export async function moveCollection(em: EntityManager, collection: Collection, parent: Collection | null) {
	const oldPath = collection.path ?? ''
	const oldParentId = collection.parentId
	await reparentSubtree(em, { table: 'collections', nodeId: collection.id, newParentId: parent?.id ?? null })
	collection.parentId = parent?.id ?? null
	collection.path = `${parent?.path ?? ''}${collection.id}.`
	if (parent) {
		await em.query(`UPDATE collections SET draft = $2, owner_id = $3 WHERE mpath LIKE $1 || '%'`, [collection.path, parent.draft, parent.ownerId])
		await inheritGroupsInSubtree(em, collection.path, parent)
		collection.draft = parent.draft
		collection.ownerId = parent.ownerId
	}
	await moveCollectionMenuItems(em, collection, oldParentId, parent?.id ?? null)
	await recomputeCollectionRollups(em, [...new Set([...pathIds(oldPath), ...pathIds(collection.path)])])
}

export type MoveSynchronizedCollectionsOptions = {
	folderId: string
	newParentFolderId: string | null
}

// A folder moved in the cloud storage: every collection the sync created for
// it follows, keeping its id, page, thumbnail, permissions and custom children.
// Collections an admin linked by hand (roots, or under a custom parent) stay
// where they are.
export async function moveSynchronizedCollections(em: EntityManager, { folderId, newParentFolderId }: MoveSynchronizedCollectionsOptions) {
	const mirrors = await em.getRepository(Collection).find({
		where: { assetFolderId: folderId },
		relations: { parent: true },
		order: { path: 'ASC' },
	})
	const moving = mirrors.filter((collection) => collection.parent?.synchronized)
	for (const collection of moving) {
		await lockSynchronizedTree(em, collection.path!)
	}

	const rootOf = async (collection: Collection) => {
		const [root] = await em.query(`
			SELECT id, mpath FROM collections
			WHERE id::text = ANY(string_to_array($1, '.')) AND asset_folder_id IS NOT NULL
			ORDER BY array_position(string_to_array($1, '.'), id::text)
			LIMIT 1
		`, [collection.path])
		return root as { id: string, mpath: string }
	}
	const touched: string[] = []
	const byRoot = new Map<string, { root: { id: string, mpath: string }, collections: Collection[] }>()
	for (const collection of moving) {
		const root = await rootOf(collection)
		byRoot.set(root.id, { root, collections: [...(byRoot.get(root.id)?.collections ?? []), collection] })
	}

	for (const { root, collections } of byRoot.values()) {
		if (collections.length > 1) {
			for (const collection of collections) {
				await flagOrphan(em, collection, 'ambiguous_move', collection.parent!.name)
			}
			continue
		}
		const [collection] = collections
		const candidates = newParentFolderId ? await em.getRepository(Collection).createQueryBuilder('collection')
			.where('collection.asset_folder_id = :folderId', { folderId: newParentFolderId })
			.andWhere("collection.mpath LIKE :rootPath || '%'", { rootPath: root.mpath })
			.andWhere("collection.mpath NOT LIKE :ownPath || '%'", { ownPath: collection.path })
			.getMany() : []
		if (candidates.length === 0) {
			await flagOrphan(em, collection, 'parent_unmirrored', collection.parent!.name)
			continue
		}
		if (candidates.some((candidate) => candidate.id === collection.parentId)) {
			if (collection.orphanedAt) {
				await em.getRepository(Collection).update(collection.id, { orphanedAt: null, orphanedReason: null, orphanedFromName: null })
			}
			continue
		}
		const [target] = candidates
		if (candidates.length > 1 || target.public !== collection.public
			|| await em.getRepository(Collection).existsBy({ parentId: target.id, assetFolderId: folderId })) {
			await flagOrphan(em, collection, 'ambiguous_move', collection.parent!.name)
			continue
		}

		await reparentSubtree(em, { table: 'collections', nodeId: collection.id, newParentId: target.id })
		await em.query(`
			UPDATE collections SET draft = $2, owner_id = $3, orphaned_at = NULL, orphaned_from_name = NULL, orphaned_reason = NULL
			WHERE mpath LIKE $1 || '%'
		`, [`${target.path}${collection.id}.`, target.draft, target.ownerId])
		await inheritGroupsInSubtree(em, `${target.path}${collection.id}.`, target)
		const previousParent = collection.parent!
		collection.parentId = target.id
		collection.path = `${target.path}${collection.id}.`
		await moveCollectionMenuItems(em, collection, previousParent.id, target.id)
		touched.push(...pathIds(previousParent.path), ...pathIds(target.path))
	}
	await recomputeCollectionRollups(em, [...new Set(touched)])
}

// Deletes the collections mirroring the given folders, which must form whole
// subtrees, and keeps everything under them the sync did not create: custom
// collections are re-homed to the nearest surviving ancestor, or to the root
// as drafts, and flagged; hand-placed menu items move up to the nearest
// surviving item. Returns the storage cleanup to run once the transaction
// has committed.
export async function destroySynchronizedCollections(em: EntityManager, folderIds: string[]) {
	const doomed = await em.getRepository(Collection).find({ where: { assetFolderId: In(folderIds) }, order: { path: 'ASC' } })
	if (doomed.length === 0) {
		return async () => {}
	}
	for (const collection of doomed) {
		await lockSynchronizedTree(em, collection.path!)
	}
	const doomedIds = new Set(doomed.map((collection) => collection.id))
	const doomedById = new Map(doomed.map((collection) => [collection.id, collection]))
	const touched: string[] = []
	const rootLanded: string[] = []

	const rescued = (await em.getRepository(Collection).find({ where: { parentId: In([...doomedIds]) } }))
		.filter((collection) => !doomedIds.has(collection.id))
	for (const collection of rescued) {
		const parent = doomedById.get(collection.parentId!)!
		const targetId = pathIds(parent.path).reverse().find((id) => !doomedIds.has(id)) ?? null
		await reparentSubtree(em, { table: 'collections', nodeId: collection.id, newParentId: targetId })
		const [moved] = await em.query('SELECT mpath FROM collections WHERE id = $1', [collection.id])
		if (!targetId) {
			await em.query("UPDATE collections SET draft = true WHERE mpath LIKE $1 || '%'", [moved.mpath])
			rootLanded.push(moved.mpath)
		}
		await flagOrphan(em, collection, 'folder_deleted', parent.name)
		touched.push(...pathIds(parent.path), ...pathIds(moved.mpath))
	}

	// Menu items die with their collection, and so do the synchronized items
	// of a collection that left the menu for the root. Whatever else hangs
	// under a dying item climbs to the nearest item that stays.
	const rootLandedCollectionIds = new Set<string>(rootLanded.length
		? (await em.query(`SELECT id FROM collections WHERE ${rootLanded.map((_, index) => `mpath LIKE $${index + 1} || '%'`).join(' OR ')}`, rootLanded)).map((row) => row.id)
		: [])
	const items = (await em.getRepository(MenuItem).find()).sort((a, b) => (a.path?.length ?? 0) - (b.path?.length ?? 0))
	const dying = new Set<string>()
	for (const item of items) {
		if (doomedIds.has(item.collectionId ?? '')
			|| (item.parentId && dying.has(item.parentId) && item.data?.sync && rootLandedCollectionIds.has(item.collectionId ?? ''))) {
			dying.add(item.id)
		}
	}
	for (const item of items) {
		if (dying.has(item.id) || !item.parentId || !dying.has(item.parentId)) continue
		const targetId = pathIds(item.path).slice(0, -1).reverse().find((id) => !dying.has(id)) ?? null
		const position = await em.getRepository(MenuItem).countBy({ parentId: targetId ?? IsNull() })
		await reparentSubtree(em, { table: 'menu_items', nodeId: item.id, newParentId: targetId })
		await em.getRepository(MenuItem).update(item.id, { position })
	}
	if (dying.size) {
		await em.getRepository(MenuItem).delete({ id: In([...dying]) })
	}

	const cleanup = await removeCollections(em, [...doomedIds])
	for (const collection of doomed) {
		touched.push(...pathIds(collection.path))
	}
	await recomputeCollectionRollups(em, [...new Set(touched)].filter((id) => !doomedIds.has(id)))
	return cleanup
}

// Deletes collections and returns the storage cleanup for their thumbnails and
// page uploads, to run after the caller's transaction has committed: an object
// deleted inside a transaction that rolls back is gone while its row survives.
export async function removeCollections(em: EntityManager, collectionIds: string[]) {
	const collections = await em.getRepository(Collection).findBy({ id: In(collectionIds) })
	// The collection page cascades in the database; its uploads do not.
	const pages = await em.getRepository(Page).findBy({ collectionId: In(collectionIds) })
	await em.getRepository(Collection).delete({ id: In(collectionIds) })
	const thumbnailKeys = collections.filter((collection) => collection.hasThumbnail).map((collection) => collection.thumbnailStorageKey)
	return async () => {
		if (thumbnailKeys.length) {
			await mainS3().removeObjects(mainS3Bucket(), thumbnailKeys)
		}
		for (const page of pages) {
			await removePageObjects(page.id)
		}
	}
}

export type DuplicateCollectionOptions = {
	em: EntityManager,
	source: Collection
	destination: Collection
	user: User
}

export async function duplicateCollection({ em, source, destination, user }: DuplicateCollectionOptions) {
	if (await em.getRepository(Collection).existsBy({ parentId: destination.id, name: source.name })) {
		return
	}
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

			const files = await userCollectionFilesQuery(user, em).andWhere('collection.id = :sourceId', { sourceId: source.id }).getMany()
			await duplicateFiles({ em, files, destination: duplicate })

			const children = await userCollectionsQuery(user, em).andWhere('collection.parent_id = :sourceId', { sourceId: source.id }).getMany()
			for (const current of children) {
				await duplicateCollection({ em, source: current, destination: duplicate, user })
			}
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
