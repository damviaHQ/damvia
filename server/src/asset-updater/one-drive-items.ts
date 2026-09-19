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

function pathDepth(item: DriveItem): number {
	return (item.parentReference?.path ?? '').split('/').filter(Boolean).length
}

export function planDriveItems(items: DriveItem[], rootId: string): DriveItemPlan {
	const folders: (UpsertFolderOptions & { depth: number })[] = []
	const files: UpsertFileOptions[] = []
	let skipped = 0

	for (const item of items) {
		const name = item.name
		if (
			!item.id || !name || name.startsWith('.') ||
			item.root !== undefined || item.id === rootId ||
			item.deleted !== undefined ||
			(item.folder === undefined && item.file === undefined)
		) {
			skipped += 1
			continue
		}

		const parentId = item.parentReference?.id
		const parentExternalId = !parentId || parentId === rootId ? '' : parentId

		if (item.folder !== undefined) {
			folders.push({ externalId: item.id, parentExternalId, name, depth: pathDepth(item) })
			continue
		}

		if (!item.size) {
			skipped += 1
			continue
		}

		files.push({
			externalId: item.id,
			externalChecksum: item.cTag ?? item.eTag ?? '',
			folderExternalId: parentExternalId,
			name,
			size: item.size,
			mimeType: item.file?.mimeType || lookup(name) || 'application/octet-stream',
		})
	}

	folders.sort((a, b) => a.depth - b.depth)
	return {
		folders: folders.map(({ depth, ...folder }) => folder),
		files,
		skipped,
	}
}
