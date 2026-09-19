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
import { DriveItem } from '@microsoft/microsoft-graph-types'
import { lookup } from 'mime-types'
import { UpsertFileOptions, UpsertFolderOptions } from "../services/asset"

export type DriveItemPlan = {
	folders: UpsertFolderOptions[]
	files: UpsertFileOptions[]
	skipped: number
}

// Delta responses never carry parentReference.path, so depth is derived by
// following parent ids through the feed itself. Unknown parents count as depth 0.
function folderDepths(folders: DriveItem[]): Map<string, number> {
	const byId = new Map(folders.map((folder) => [folder.id!, folder]))
	const depths = new Map<string, number>()
	const depthOf = (id: string, seen: Set<string>): number => {
		const known = depths.get(id)
		if (known !== undefined) return known
		const parentId = byId.get(id)?.parentReference?.id
		const depth = parentId && byId.has(parentId) && !seen.has(parentId)
			? depthOf(parentId, seen.add(id)) + 1
			: 0
		depths.set(id, depth)
		return depth
	}
	for (const folder of folders) depthOf(folder.id!, new Set())
	return depths
}

// Mirrors the feed exactly as production always did: the drive root is kept
// as a top-level folder (its parent reference has no id), every other item
// keeps its Graph parent id, size-0 items (empty folders and files) are skipped,
// and eTag stays the checksum so an upgrade never re-parents, re-downloads or
// deletes anything.
export function planDriveItems(items: DriveItem[]): DriveItemPlan {
	const folderItems: DriveItem[] = []
	const files: UpsertFileOptions[] = []
	let skipped = 0

	for (const item of items) {
		const name = item.name
		if (
			!item.id || !name || name.startsWith('.') || name.includes('\0') || item.size === 0 ||
			item.deleted !== undefined ||
			(item.folder === undefined && item.file === undefined)
		) {
			skipped += 1
			continue
		}

		const parentExternalId = item.parentReference?.id ?? ''

		if (item.folder !== undefined) {
			folderItems.push(item)
			continue
		}

		files.push({
			externalId: item.id,
			externalChecksum: item.eTag ?? '',
			folderExternalId: parentExternalId,
			name,
			size: item.size ?? 0,
			mimeType: item.file?.mimeType || lookup(name) || 'application/octet-stream',
		})
	}

	const depths = folderDepths(folderItems)
	const folders = folderItems
		.map((item, index) => ({ item, index, depth: depths.get(item.id!) ?? 0 }))
		.sort((a, b) => a.depth - b.depth || a.index - b.index)
		.map(({ item }) => ({
			externalId: item.id!,
			parentExternalId: item.parentReference?.id ?? '',
			name: item.name!,
		}))
	return { folders, files, skipped }
}
