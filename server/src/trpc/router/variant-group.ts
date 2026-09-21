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
import { RecordAttribute } from "../../entity/record-attribute"
import { UserRole } from "../../entity/user"
import { VariantGroup } from "../../entity/variant-group"
import { VariantGroupOverride } from "../../entity/variant-group-override"
import { dataSource } from "../../env"
import { userCollectionFilesQuery } from "../../services/collection"
import { rerunVariantStage } from "../../services/enrichment"
import { loadViewableMetadata } from "../../services/file-metadata"
import { onePerFile } from "../../services/search"
import { authMiddleware, publicProcedure, router, userAdmin, userApproved } from "../index"
import { formatCollectionFile } from "./collection"

const STATUS_RANK = ['up_to_date', 'creating', 'outdated', 'pending_deletion']

const fileIds = z.uuid().array().min(1).max(500)

// Overrides are kept by file id, so a file must exist; a group override needs
// its files in one folder and one asset type, as groups never span folders.
async function assertFiles(ids: string[], sameFolder: boolean) {
	const rows: { folder_id: string, asset_type_id: string | null }[] = await dataSource.query('SELECT folder_id, asset_type_id FROM asset_files WHERE id = ANY($1)', [ids])
	if (rows.length !== new Set(ids).size) {
		throw new TRPCError({ code: 'NOT_FOUND', message: 'Asset file not found.' })
	}
	if (sameFolder && new Set(rows.map((row) => `${row.folder_id}|${row.asset_type_id}`)).size > 1) {
		throw new TRPCError({ code: 'BAD_REQUEST', message: 'Variants can only be grouped inside one folder and one asset type.' })
	}
}

export default router({
	// Members the reader cannot see are neither listed nor counted.
	findById: publicProcedure
		.use(authMiddleware(userApproved))
		.input(z.uuid())
		.query(async ({ input, ctx }) => {
			const group = await dataSource.getRepository(VariantGroup).findOneBy({ id: input })
			if (!group) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Variant group not found.' })
			}
			const visible = () => userCollectionFilesQuery(ctx.user)
				.innerJoin('variant_group_members', 'group_member', 'group_member.asset_file_id = asset_file.id AND group_member.variant_group_id = :groupId', { groupId: group.id })
			const files = await onePerFile(visible(), visible()).orderBy('asset_file.name', 'ASC').getMany()
			if (!files.length) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Variant group not found.' })
			}
			const members: { asset_file_id: string, axis_values: string[] }[] = await dataSource.query('SELECT asset_file_id, axis_values FROM variant_group_members WHERE variant_group_id = $1', [group.id])
			const axes: { position: number, id: string, name: string | null, recognizer: string | null }[] = await dataSource.query(`
				SELECT ga.position, a.id, a.name, a.recognizer FROM variant_group_axes ga INNER JOIN variant_axes a ON a.id = ga.variant_axis_id
				WHERE ga.variant_group_id = $1 ORDER BY ga.position
			`, [group.id])
			const unnamed: { id: string }[] = await dataSource.query('SELECT id FROM variant_axes WHERE name IS NULL ORDER BY created_at, id')
			const isAdmin = ctx.user.role === UserRole.ADMIN && userAdmin(ctx.user)
			const overrides: { id: string, kind: string, asset_file_ids: string[] }[] = isAdmin ? await dataSource.query(`
				SELECT id, kind, asset_file_ids FROM variant_group_overrides
				WHERE kind = 'cover' AND asset_file_ids && $1::uuid[] OR ('override:' || id) = $2
				ORDER BY created_at
			`, [members.map((member) => member.asset_file_id), group.prefixKey]) : []
			const recordAttributes = await dataSource.getRepository(RecordAttribute).find()
			const metadata = await loadViewableMetadata(files.map((file) => file.assetFileId))
			return {
				id: group.id,
				displayName: group.displayName,
				coverFileId: group.coverAssetFileId,
				memberCount: files.length,
				status: files.map((file) => file.assetFile.status as string).sort((a, b) => STATUS_RANK.indexOf(b) - STATUS_RANK.indexOf(a))[0],
				forced: group.prefixKey.startsWith('override:'),
				axes: axes.map((axis) => ({ ...axis, label: axis.name ?? `Variant ${unnamed.findIndex((row) => row.id === axis.id) + 1}` })),
				overrides: overrides.map((row) => ({ id: row.id, kind: row.kind, assetFileIds: row.asset_file_ids })),
				members: await Promise.all(files.map(async (file) => ({
					...await formatCollectionFile({ file, recordAttributes, metadata }),
					assetFileId: file.assetFileId,
					status: file.assetFile.status,
					axisValues: members.find((member) => member.asset_file_id === file.assetFileId)?.axis_values ?? [],
				}))),
			}
		}),
	setCover: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(z.object({ groupId: z.uuid(), assetFileId: z.uuid() }))
		.mutation(async ({ input, ctx }) => {
			const members: { asset_file_id: string }[] = await dataSource.query('SELECT asset_file_id FROM variant_group_members WHERE variant_group_id = $1', [input.groupId])
			if (!members.some((member) => member.asset_file_id === input.assetFileId)) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'This file is not a member of the group.' })
			}
			await dataSource.transaction(async (em) => {
				await em.query("DELETE FROM variant_group_overrides WHERE kind = 'cover' AND asset_file_ids && $1::uuid[]", [members.map((member) => member.asset_file_id)])
				await em.getRepository(VariantGroupOverride).save({ kind: 'cover', assetFileIds: [input.assetFileId], createdById: ctx.user.id })
			})
			return rerunVariantStage()
		}),
	// The chosen files leave their computed groups and form one of their own.
	forceGroup: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(z.object({ assetFileIds: fileIds.min(2) }))
		.mutation(async ({ input, ctx }) => {
			await assertFiles(input.assetFileIds, true)
			await dataSource.getRepository(VariantGroupOverride).save({ kind: 'force_group', assetFileIds: input.assetFileIds, createdById: ctx.user.id })
			return rerunVariantStage()
		}),
	exclude: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(z.object({ assetFileIds: fileIds }))
		.mutation(async ({ input, ctx }) => {
			await assertFiles(input.assetFileIds, false)
			await dataSource.getRepository(VariantGroupOverride).save({ kind: 'exclude', assetFileIds: input.assetFileIds, createdById: ctx.user.id })
			return rerunVariantStage()
		}),
	listOverrides: publicProcedure
		.use(authMiddleware(userAdmin))
		.query(async () => {
			const rows: { id: string, kind: string, names: string[], created_by: string | null, created_at: Date }[] = await dataSource.query(`
				SELECT o.id, o.kind, array(SELECT a.name FROM asset_files a WHERE a.id = ANY(o.asset_file_ids) ORDER BY a.name) AS names, u.name AS created_by, o.created_at
				FROM variant_group_overrides o LEFT JOIN users u ON u.id = o.created_by_id ORDER BY o.created_at DESC
			`)
			return rows.map((row) => ({ id: row.id, kind: row.kind, fileNames: row.names, createdBy: row.created_by, createdAt: row.created_at }))
		}),
	undoOverride: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(z.uuid())
		.mutation(async ({ input }) => {
			const override = await dataSource.getRepository(VariantGroupOverride).findOneBy({ id: input })
			if (!override) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Override not found.' })
			}
			await dataSource.getRepository(VariantGroupOverride).remove(override)
			return rerunVariantStage()
		}),
})
