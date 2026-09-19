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
// Kept apart from services/page.ts so the collection service can clean a page's
// objects without importing the page service, which imports it back.
import { logger, mainS3, mainS3Bucket } from "../env"

export function blockPrefix(pageId: string) {
	return `blocks/${pageId}/`
}

export function stagingKey(pageId: string, uploadId: string) {
	return `${blockPrefix(pageId)}tmp/${uploadId}`
}

export async function listPageObjects(pageId: string): Promise<string[]> {
	const stream = mainS3().listObjects(mainS3Bucket(), blockPrefix(pageId), true)
	const keys: string[] = []
	for await (const object of stream) {
		if (object.name) {
			keys.push(object.name)
		}
	}
	return keys
}

export async function removePageObjects(pageId: string) {
	const keys = await listPageObjects(pageId)
	if (keys.length) {
		await mainS3().removeObjects(mainS3Bucket(), keys).catch(() => logger.warn('page.cleanup-failed', { pageId }))
	}
	return keys
}

// Objects are only ever deleted after the transaction commits, and only when no
// block references them any more, which also clears abandoned staged uploads.
export async function collectPageGarbage(pageId: string, keptKeys: string[]) {
	const keep = new Set(keptKeys)
	const orphans = (await listPageObjects(pageId)).filter((key) => !keep.has(key))
	if (orphans.length) {
		await mainS3().removeObjects(mainS3Bucket(), orphans).catch(() => logger.warn('page.garbage-collection-failed', { pageId }))
	}
	return orphans
}
