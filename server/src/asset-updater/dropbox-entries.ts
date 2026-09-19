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
import path from 'node:path'
import { UpsertFileOptions, UpsertFolderOptions } from "../services/asset"

// The subset of Dropbox metadata the planner reads, so tests need no SDK types.
export type DropboxEntry = {
	'.tag': string
	id?: string
	name: string
	path_lower?: string
	size?: number
	content_hash?: string
}

// The listing root: the DROPBOX_ROOT_PATH folder, or the whole Dropbox as a
// synthetic folder with an empty path_lower.
export type DropboxRoot = { id: string, name: string, path_lower: string }
export const WHOLE_DROPBOX_ROOT: DropboxRoot = { id: 'dropbox-root', name: 'Dropbox', path_lower: '' }

export type DropboxPlan = {
	folders: UpsertFolderOptions[]
	files: UpsertFileOptions[]
	skipped: number
}

const hasHiddenComponent = (pathLower: string) => pathLower.split('/').some((part) => part.startsWith('.'))
const depthOf = (pathLower: string) => pathLower.split('/').filter(Boolean).length
const dirOf = (pathLower: string) => { const dir = path.posix.dirname(pathLower); return dir === '/' || dir === '.' ? '' : dir }

// Mirrors the OneDrive planner: the listing is written down item for item, the
// root (DROPBOX_ROOT_PATH or the whole Dropbox) is the single top-level row,
// folders and files with nothing in them are skipped, content_hash is the checksum.
export function planDropboxEntries(entries: DropboxEntry[], root: DropboxRoot): DropboxPlan {
	const folderItems: DropboxEntry[] = []
	const fileItems: DropboxEntry[] = []
	let skipped = 0

	const candidates: DropboxEntry[] = [{ '.tag': 'folder', id: root.id, name: root.name, path_lower: root.path_lower }, ...entries]
	for (const entry of candidates) {
		const pathLower = entry.path_lower
		if (!entry.id || !entry.name || entry.name.includes('\0') || pathLower === undefined || entry['.tag'] === 'deleted' || hasHiddenComponent(pathLower)) {
			skipped += 1
		} else if (entry['.tag'] === 'folder') {
			folderItems.push(entry)
		} else if (entry['.tag'] === 'file' && entry.size) {
			fileItems.push(entry)
		} else {
			skipped += 1
		}
	}

	const nonEmpty = new Set<string>()
	for (const file of fileItems) {
		for (let dir = dirOf(file.path_lower!); ; dir = dirOf(dir)) {
			nonEmpty.add(dir)
			if (dir === '') break
		}
	}
	const keptFolders = folderItems.filter((folder) => nonEmpty.has(folder.path_lower!))
	skipped += folderItems.length - keptFolders.length
	const idByPath = new Map(keptFolders.map((folder) => [folder.path_lower!, folder.id!]))
	const parentOf = (pathLower: string) => pathLower === root.path_lower ? '' : (idByPath.get(dirOf(pathLower)) ?? '')

	const folders = keptFolders
		.map((folder, index) => ({ folder, index, depth: depthOf(folder.path_lower!) }))
		.sort((a, b) => a.depth - b.depth || a.index - b.index)
		.map(({ folder }) => ({ externalId: folder.id!, parentExternalId: parentOf(folder.path_lower!), name: folder.name }))

	const files: UpsertFileOptions[] = []
	for (const file of fileItems) {
		files.push({
			externalId: file.id!,
			externalChecksum: file.content_hash ?? '',
			folderExternalId: parentOf(file.path_lower!),
			name: file.name,
			size: file.size!,
			mimeType: lookup(file.name) || 'application/octet-stream',
		})
	}

	return { folders, files, skipped }
}
