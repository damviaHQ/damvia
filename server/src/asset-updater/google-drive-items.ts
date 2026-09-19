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
import { lookup } from 'mime-types'
import { UpsertFileOptions, UpsertFolderOptions } from "../services/asset"

// The subset of a Drive file resource the planner reads, so tests need no SDK types.
export type DriveFileEntry = {
	id?: string | null
	name?: string | null
	mimeType?: string | null
	parents?: string[] | null
	size?: string | null
	md5Checksum?: string | null
	trashed?: boolean | null
}

export type DriveRoot = { id: string, name: string }

export type DriveFilePlan = {
	folders: UpsertFolderOptions[]
	files: UpsertFileOptions[]
	skipped: number
}

export const FOLDER_MIME = 'application/vnd.google-apps.folder'
const GOOGLE_APPS_PREFIX = 'application/vnd.google-apps.'

// Mirrors the OneDrive and Dropbox planners: the pointed folder is the single
// top-level row, every other item hangs under its Drive parent, Google-native
// documents and shortcuts are skipped (they have no downloadable bytes), folders
// and files with nothing in them are skipped, md5Checksum is the checksum.
export function planDriveFiles(entries: DriveFileEntry[], root: DriveRoot): DriveFilePlan {
	const folders = new Map<string, DriveFileEntry>([[root.id, { id: root.id, name: root.name, mimeType: FOLDER_MIME }]])
	const files: DriveFileEntry[] = []
	let skipped = 0

	for (const entry of entries) {
		const name = entry.name
		if (!entry.id || !name || name.startsWith('.') || name.includes('\0') || entry.trashed || !entry.parents?.length) {
			skipped += 1
		} else if (entry.mimeType === FOLDER_MIME) {
			folders.set(entry.id, entry)
		} else if (entry.mimeType?.startsWith(GOOGLE_APPS_PREFIX) || !Number(entry.size)) {
			skipped += 1
		} else {
			files.push(entry)
		}
	}

	// The chain of kept folders from an item up to the root, or null when it
	// passes through a missing or hidden folder (or loops).
	const chainToRoot = (parentId: string | undefined): string[] | null => {
		const chain: string[] = []
		const seen = new Set<string>()
		for (let id = parentId; id !== undefined; id = folders.get(id)?.parents?.[0] ?? undefined) {
			if (!folders.has(id) || seen.has(id)) return null
			seen.add(id)
			chain.push(id)
			if (id === root.id) return chain
		}
		return null
	}

	const nonEmpty = new Set<string>()
	const keptFiles: { entry: DriveFileEntry, folderId: string }[] = []
	for (const file of files) {
		const chain = chainToRoot(file.parents![0])
		if (!chain) {
			skipped += 1
			continue
		}
		chain.forEach((id) => nonEmpty.add(id))
		keptFiles.push({ entry: file, folderId: chain[0] })
	}

	const keptFolders = Array.from(folders.values()).filter((folder) => nonEmpty.has(folder.id!))
	skipped += folders.size - keptFolders.length
	const depthOf = (id: string) => (chainToRoot(id)?.length ?? 1) - 1

	return {
		folders: keptFolders
			.map((folder, index) => ({ folder, index, depth: depthOf(folder.id!) }))
			.sort((a, b) => a.depth - b.depth || a.index - b.index)
			.map(({ folder }) => ({
				externalId: folder.id!,
				parentExternalId: folder.id === root.id ? '' : folder.parents![0],
				name: folder.name!,
			})),
		files: keptFiles.map(({ entry, folderId }) => ({
			externalId: entry.id!,
			externalChecksum: entry.md5Checksum ?? '',
			folderExternalId: folderId,
			name: entry.name!,
			size: Number(entry.size),
			mimeType: entry.mimeType || lookup(entry.name!) || 'application/octet-stream',
		})),
		skipped,
	}
}
