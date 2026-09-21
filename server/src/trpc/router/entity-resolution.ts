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
import { z } from "zod"
import { AssetEntityLink } from "../../entity/asset-entity-link"
import { AssetFolder } from "../../entity/asset-folder"
import { AssetFolderEntityAttachment } from "../../entity/asset-folder-entity-attachment"
import { DataRecord } from "../../entity/data-record"
import { dataSource } from "../../env"
import { rerunEntityStage } from "../../services/enrichment"
import { createRecord } from "../../services/records"
import { authMiddleware, publicProcedure, router, userAdmin } from "../index"

const LIST_LIMIT = 500

const target = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal('record'), key: z.string().trim().min(1).max(200), create: z.boolean().optional() }),
	z.object({ kind: z.literal('attribute'), name: z.string().trim().min(1).max(200), value: z.string().trim().min(1).max(500) }),
])

type Target = z.infer<typeof target>

// A key nobody imported yet can be created on the spot with the key only; the
// next CSV import fills its data.
async function ensureRecord(value: Target, userId: string): Promise<boolean> {
	if (value.kind !== 'record') return false
	const repository = dataSource.getRepository(DataRecord)
	if (await repository.existsBy({ recordKey: value.key })) return false
	if (!value.create) {
		throw new TRPCError({ code: 'NOT_FOUND', message: `No record with key ${value.key}.` })
	}
	await dataSource.transaction((em) => createRecord(em, { recordKey: value.key }, { userId, source: 'unmatched' }))
	return true
}

export default router({
	counts: publicProcedure
		.use(authMiddleware(userAdmin))
		.query(async () => {
			const [row] = await dataSource.query(`
				SELECT
					(SELECT count(*) FROM asset_file_resolutions WHERE status = 'unmatched')::int AS unmatched,
					(SELECT count(*) FROM asset_file_resolutions WHERE status = 'conflict')::int AS conflicts,
					(SELECT count(*) FROM asset_entity_links WHERE status = 'dangling')::int AS dangling,
					(SELECT count(DISTINCT a.folder_id) FROM asset_file_resolutions r INNER JOIN asset_files a ON a.id = r.asset_file_id WHERE r.status = 'unmatched')::int AS folders
			`)
			return row as { unmatched: number, conflicts: number, dangling: number, folders: number }
		}),
	unmatchedFolders: publicProcedure
		.use(authMiddleware(userAdmin))
		.query(async () => {
			const rows: { id: string, path: string, type: string | null, files: number }[] = await dataSource.query(`
				SELECT f.id, f.path, t.name AS type, count(*)::int AS files
				FROM asset_file_resolutions r
				INNER JOIN asset_files a ON a.id = r.asset_file_id
				INNER JOIN asset_folders f ON f.id = a.folder_id
				LEFT JOIN asset_types t ON t.id = a.asset_type_id
				WHERE r.status = 'unmatched'
				GROUP BY f.id, f.path, t.name ORDER BY files DESC, f.path LIMIT $1
			`, [LIST_LIMIT])
			return rows
		}),
	unmatchedFiles: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(z.object({ search: z.string().max(200).optional(), folderId: z.uuid().optional(), page: z.number().int().min(1).default(1) }))
		.query(async ({ input }) => {
			const filters = ["r.status = 'unmatched'"]
			const parameters: unknown[] = []
			if (input.search?.trim()) {
				parameters.push(`%${input.search.trim()}%`)
				filters.push(`a.name ILIKE $${parameters.length}`)
			}
			if (input.folderId) {
				parameters.push(input.folderId)
				filters.push(`a.folder_id = $${parameters.length}`)
			}
			const where = filters.join(' AND ')
			const [{ total }] = await dataSource.query(`SELECT count(*)::int AS total FROM asset_file_resolutions r INNER JOIN asset_files a ON a.id = r.asset_file_id WHERE ${where}`, parameters)
			const rows: { id: string, name: string, path: string, type: string | null, reason: string | null, suggestion: string | null, suggestion_field: string | null }[] = await dataSource.query(`
				SELECT a.id, a.name, f.path, t.name AS type, r.reason, suggestion.key AS suggestion, suggestion.field AS suggestion_field
				FROM asset_file_resolutions r
				INNER JOIN asset_files a ON a.id = r.asset_file_id
				INNER JOIN asset_folders f ON f.id = a.folder_id
				LEFT JOIN asset_types t ON t.id = a.asset_type_id
				LEFT JOIN LATERAL (
					SELECT v.value_text AS key, coalesce(mf.display_name, mf.name) AS field FROM asset_file_metadata_values v
					INNER JOIN metadata_fields mf ON mf.id = v.metadata_field_id AND mf.can_link AND mf.link_target = 'record_key'
					INNER JOIN records rec ON rec.record_key = v.value_text
					WHERE v.asset_file_id = a.id ORDER BY mf.name LIMIT 1
				) suggestion ON true
				WHERE ${where} ORDER BY f.path, a.name LIMIT 100 OFFSET ${(input.page - 1) * 100}
			`, parameters)
			return { total, files: rows.map((row) => ({ id: row.id, name: row.name, path: row.path, type: row.type, reason: row.reason, suggestion: row.suggestion, suggestionField: row.suggestion_field })) }
		}),
	conflicts: publicProcedure
		.use(authMiddleware(userAdmin))
		.query(async () => {
			const rows: { id: string, name: string, path: string, candidates: { key?: string, strategy: string, kind: string }[] }[] = await dataSource.query(`
				SELECT a.id, a.name, f.path, r.candidates
				FROM asset_file_resolutions r
				INNER JOIN asset_files a ON a.id = r.asset_file_id
				INNER JOIN asset_folders f ON f.id = a.folder_id
				WHERE r.status = 'conflict' ORDER BY f.path, a.name LIMIT $1
			`, [LIST_LIMIT])
			const keys = [...new Set(rows.flatMap((row) => row.candidates.map((candidate) => candidate.key).filter((key): key is string => !!key)))]
			const existing: { record_key: string }[] = keys.length ? await dataSource.query('SELECT record_key FROM records WHERE record_key = ANY($1)', [keys]) : []
			const known = new Set(existing.map((row) => row.record_key))
			return rows.map((row) => ({
				id: row.id,
				name: row.name,
				path: row.path,
				candidates: row.candidates.filter((candidate) => candidate.kind === 'record').map((candidate) => ({ key: candidate.key!, strategy: candidate.strategy, exists: known.has(candidate.key!) })),
			}))
		}),
	dangling: publicProcedure
		.use(authMiddleware(userAdmin))
		.query(async () => {
			const rows: { id: string, file_id: string, name: string, path: string, target_kind: string, record_key: string | null, attribute_name: string | null, attribute_value: string | null, strategy: string }[] = await dataSource.query(`
				SELECT l.id, a.id AS file_id, a.name, f.path, l.target_kind, l.record_key, l.attribute_name, l.attribute_value, l.strategy
				FROM asset_entity_links l
				INNER JOIN asset_files a ON a.id = l.asset_file_id
				INNER JOIN asset_folders f ON f.id = a.folder_id
				WHERE l.status = 'dangling' ORDER BY l.record_key NULLS LAST, f.path, a.name LIMIT $1
			`, [LIST_LIMIT])
			return rows.map((row) => ({
				id: row.id,
				fileId: row.file_id,
				name: row.name,
				path: row.path,
				targetKind: row.target_kind as 'record' | 'attribute',
				recordKey: row.record_key,
				attributeName: row.attribute_name,
				attributeValue: row.attribute_value,
				strategy: row.strategy,
				manual: row.strategy === 'manual_file',
			}))
		}),
	// The record picker: a key, or any searchable attribute, and the values an
	// attribute takes for picking a range.
	findTargets: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(z.object({ query: z.string().max(200), attributeName: z.string().max(200).optional() }))
		.query(async ({ input }) => {
			const query = `%${input.query.trim()}%`
			if (input.attributeName) {
				const values: { value: string, records: number }[] = await dataSource.query(`
					SELECT meta_data -> $1 AS value, count(*)::int AS records FROM records
					WHERE (meta_data -> $1) ILIKE $2 AND (meta_data -> $1) <> '' GROUP BY 1 ORDER BY 1 LIMIT 20
				`, [input.attributeName, query])
				return { records: [], values }
			}
			const searchable: { name: string }[] = await dataSource.query('SELECT name FROM record_attributes WHERE searchable')
			const records: { id: string, record_key: string, meta_data: Record<string, string> }[] = await dataSource.query(`
				SELECT id, record_key, hstore_to_json(meta_data) AS meta_data FROM records
				WHERE record_key ILIKE $1 OR EXISTS (SELECT 1 FROM each(meta_data) e WHERE e.key = ANY($2) AND e.value ILIKE $1)
				ORDER BY record_key LIMIT 20
			`, [query, searchable.map((row) => row.name)])
			return {
				records: records.map((record) => ({
					id: record.id,
					key: record.record_key,
					label: searchable.map((attribute) => record.meta_data?.[attribute.name]).find((value) => value && value !== record.record_key) ?? null,
				})),
				values: [],
			}
		}),
	folderAttachments: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(z.uuid())
		.query(async ({ input }) => {
			const rows: { id: string, folder_id: string, path: string, target_kind: string, record_key: string | null, attribute_name: string | null, attribute_value: string | null, created_by: string | null, created_at: Date }[] = await dataSource.query(`
				SELECT at.id, at.asset_folder_id AS folder_id, f.path, at.target_kind, at.record_key, at.attribute_name, at.attribute_value, u.name AS created_by, at.created_at
				FROM asset_folder_entity_attachments at
				INNER JOIN asset_folders f ON f.id = at.asset_folder_id
				LEFT JOIN users u ON u.id = at.created_by_id
				WHERE at.asset_folder_id::text = ANY(string_to_array((SELECT mpath FROM asset_folders WHERE id = $1), '.'))
				ORDER BY length(f.mpath) DESC, at.created_at
			`, [input])
			const nearest = rows[0]?.folder_id
			return rows.filter((row) => row.folder_id === nearest).map((row) => ({
				id: row.id,
				inherited: row.folder_id !== input,
				path: row.path,
				targetKind: row.target_kind as 'record' | 'attribute',
				recordKey: row.record_key,
				attributeName: row.attribute_name,
				attributeValue: row.attribute_value,
				createdBy: row.created_by,
				createdAt: row.created_at,
			}))
		}),
	// One attach on a folder links every file inside it and below it; on files,
	// it pins a link no rule reopens.
	attach: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(z.object({ target, folderId: z.uuid().optional(), fileIds: z.uuid().array().max(500).optional() }).refine((value) => !!value.folderId !== !!value.fileIds?.length, 'Attach either a folder or files.'))
		.mutation(async ({ input, ctx }) => {
			const created = await ensureRecord(input.target, ctx.user.id)
			const record = input.target.kind === 'record' ? await dataSource.getRepository(DataRecord).findOneBy({ recordKey: input.target.key }) : null
			const fields = input.target.kind === 'record'
				? { targetKind: 'record' as const, recordId: record?.id ?? null, recordKey: input.target.key, attributeName: null, attributeValue: null }
				: { targetKind: 'attribute' as const, recordId: null, recordKey: null, attributeName: input.target.name, attributeValue: input.target.value }
			let files = 0
			if (input.folderId) {
				const folder = await dataSource.getRepository(AssetFolder).findOneBy({ id: input.folderId })
				if (!folder) {
					throw new TRPCError({ code: 'NOT_FOUND', message: 'Asset folder not found.' })
				}
				const [{ exists }] = await dataSource.query(`
					SELECT EXISTS (SELECT 1 FROM asset_folder_entity_attachments WHERE asset_folder_id = $1 AND target_kind = $2
						AND record_key IS NOT DISTINCT FROM $3 AND attribute_name IS NOT DISTINCT FROM $4 AND attribute_value IS NOT DISTINCT FROM $5) AS exists
				`, [folder.id, fields.targetKind, fields.recordKey, fields.attributeName, fields.attributeValue])
				if (!exists) {
					const repository = dataSource.getRepository(AssetFolderEntityAttachment)
					await repository.save(repository.create({ assetFolderId: folder.id, ...fields, createdById: ctx.user.id }))
				}
				const [{ count }] = await dataSource.query(`
					SELECT count(*)::int AS count FROM asset_files a INNER JOIN asset_folders f ON f.id = a.folder_id
					WHERE f.mpath LIKE (SELECT mpath FROM asset_folders WHERE id = $1) || '%' AND a.status <> 'pending_deletion'
				`, [folder.id])
				files = count
			} else {
				const fileIds = input.fileIds!
				await dataSource.query(`
					INSERT INTO asset_entity_links (asset_file_id, target_kind, record_id, record_key, attribute_name, attribute_value, strategy, created_by_id)
					SELECT id, $2, $3, $4, $5, $6, 'manual_file', $7 FROM asset_files WHERE id = ANY($1)
					ON CONFLICT DO NOTHING
				`, [fileIds, fields.targetKind, fields.recordId, fields.recordKey, fields.attributeName, fields.attributeValue, ctx.user.id])
				files = fileIds.length
			}
			const applied = await rerunEntityStage()
			return { files, recordCreated: created, applied }
		}),
	detach: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(z.object({ linkId: z.uuid().optional(), attachmentId: z.uuid().optional() }).refine((value) => !!value.linkId !== !!value.attachmentId, 'Detach either a link or a folder attachment.'))
		.mutation(async ({ input }) => {
			if (input.linkId) {
				const link = await dataSource.getRepository(AssetEntityLink).findOneBy({ id: input.linkId })
				if (!link || link.strategy !== 'manual_file') {
					throw new TRPCError({ code: 'NOT_FOUND', message: 'Only a link set by hand can be detached; change the matching steps for the others.' })
				}
				await dataSource.getRepository(AssetEntityLink).remove(link)
			} else {
				const attachment = await dataSource.getRepository(AssetFolderEntityAttachment).findOneBy({ id: input.attachmentId })
				if (!attachment) {
					throw new TRPCError({ code: 'NOT_FOUND', message: 'Folder attachment not found.' })
				}
				await dataSource.getRepository(AssetFolderEntityAttachment).remove(attachment)
			}
			return rerunEntityStage()
		}),
	// A key the files carry but the catalogue lacks: create it with the key only
	// and every dangling link to it becomes active.
	createRecord: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(z.object({ key: z.string().trim().min(1).max(200) }))
		.mutation(async ({ input, ctx }) => {
			if (!(await ensureRecord({ kind: 'record', key: input.key, create: true }, ctx.user.id))) {
				throw new TRPCError({ code: 'BAD_REQUEST', message: `A record with key ${input.key} already exists.` })
			}
			return rerunEntityStage()
		}),
	fileLinks: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(z.uuid())
		.query(async ({ input }) => {
			const links = await dataSource.getRepository(AssetEntityLink).find({ where: { assetFileId: input }, order: { isPrimary: 'DESC', createdAt: 'ASC' } })
			return links.map((link) => ({
				id: link.id,
				targetKind: link.targetKind,
				recordKey: link.recordKey,
				attributeName: link.attributeName,
				attributeValue: link.attributeValue,
				strategy: link.strategy,
				status: link.status,
				isPrimary: link.isPrimary,
			}))
		}),
})
