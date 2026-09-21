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
import { EntityManager } from "typeorm"

export const LINKED_FILES_LIMIT = 500

export type DirectFile = { id: string, name: string, path: string, strategy: string, status: string, isPrimary: boolean, sourcePath: string | null, pattern: string | null, createdBy: string | null, createdAt: Date | null, thumbnailStorageKey: string | null }
export type RangeFile = { id: string, name: string, path: string, attributeName: string, attributeValue: string, strategy: string, thumbnailStorageKey: string | null }

const thumbnailKey = (id: string, hasThumbnail: boolean) => hasThumbnail ? `asset-file/${id}-thumbnail` : null

// The files linked to one record, with what linked them, and the files
// linked to a range the record belongs to.
export async function linkedFilesOf(em: EntityManager, record: { id: string, recordKey: string }): Promise<{ direct: DirectFile[], range: RangeFile[] }> {
	const direct: { id: string, name: string, path: string, strategy: string, status: string, is_primary: boolean, has_thumbnail: boolean, source_path: string | null, pattern: string | null, created_by: string | null, created_at: Date | null }[] = await em.query(`
		SELECT a.id, a.name, f.path, l.strategy, l.status, l.is_primary, a.has_thumbnail, sf.path AS source_path, s.config ->> 'pattern' AS pattern, u.name AS created_by, l.created_at
		FROM asset_entity_links l
		INNER JOIN asset_files a ON a.id = l.asset_file_id
		INNER JOIN asset_folders f ON f.id = a.folder_id
		LEFT JOIN asset_folders sf ON sf.id = l.source_folder_id
		LEFT JOIN asset_type_resolver_steps s ON s.id = l.resolver_step_id
		LEFT JOIN users u ON u.id = l.created_by_id
		WHERE l.target_kind = 'record' AND l.record_key = $1
		UNION ALL
		SELECT a.id, a.name, f.path, 'legacy', 'active', true, a.has_thumbnail, NULL, NULL, NULL, NULL
		FROM asset_files a INNER JOIN asset_folders f ON f.id = a.folder_id
		WHERE a.record_id = $2 AND NOT EXISTS (SELECT 1 FROM asset_entity_links l WHERE l.asset_file_id = a.id AND l.target_kind = 'record')
		ORDER BY 2 LIMIT ${LINKED_FILES_LIMIT}
	`, [record.recordKey, record.id])
	const range: { id: string, name: string, path: string, attribute_name: string, attribute_value: string, strategy: string, has_thumbnail: boolean }[] = await em.query(`
		SELECT a.id, a.name, f.path, l.attribute_name, l.attribute_value, l.strategy, a.has_thumbnail
		FROM asset_entity_links l
		INNER JOIN asset_files a ON a.id = l.asset_file_id
		INNER JOIN asset_folders f ON f.id = a.folder_id
		INNER JOIN records r ON r.id = $1 AND (r.meta_data -> l.attribute_name) = l.attribute_value
		WHERE l.target_kind = 'attribute' AND l.status = 'active'
		ORDER BY a.name LIMIT ${LINKED_FILES_LIMIT}
	`, [record.id])
	return {
		direct: direct.map((row) => ({ id: row.id, name: row.name, path: row.path, strategy: row.strategy, status: row.status, isPrimary: row.is_primary, sourcePath: row.source_path, pattern: row.pattern, createdBy: row.created_by, createdAt: row.created_at, thumbnailStorageKey: thumbnailKey(row.id, row.has_thumbnail) })),
		range: range.map((row) => ({ id: row.id, name: row.name, path: row.path, attributeName: row.attribute_name, attributeValue: row.attribute_value, strategy: row.strategy, thumbnailStorageKey: thumbnailKey(row.id, row.has_thumbnail) })),
	}
}
