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
import { In } from "typeorm"
import { z } from "zod"
import { AssetFolder } from "../../entity/asset-folder"
import { AssetType } from "../../entity/asset-type"
import { AssetTypeResolverStep } from "../../entity/asset-type-resolver-step"
import { dataSource } from "../../env"
import { rerunEntityStage } from "../../services/enrichment"
import { CompiledStep, compileStep, ExistingLink, fullFilenamePattern, loadAttachments, loadCatalogue, loadFilesToResolve, loadViewSettings, resolveFile } from "../../services/entity-resolution"
import { authMiddleware, publicProcedure, router, userAdmin } from "../index"

const PREVIEW_FILES = 40

export function formatResolverStep(step: AssetTypeResolverStep) {
	return {
		id: step.id,
		assetTypeId: step.assetTypeId,
		position: step.position,
		strategy: step.strategy,
		config: step.config,
		enabled: step.enabled,
		lastError: step.lastError,
	}
}

const stepInput = z.object({
	id: z.uuid().optional(),
	strategy: z.enum(['filename_regex', 'folder_regex', 'metadata']),
	enabled: z.boolean(),
	config: z.object({
		pattern: z.string().max(500).optional(),
		keyGroup: z.number().int().min(1).max(20).optional(),
		viewGroup: z.number().int().min(1).max(20).nullable().optional(),
		target: z.enum(['record', 'attribute']).optional(),
		attributeName: z.string().max(200).optional(),
		valueGroup: z.number().int().min(1).max(20).optional(),
		metadataFieldId: z.uuid().optional(),
	}),
})

type StepInput = z.infer<typeof stepInput>

// Every step is compiled before anything is written, so one bad step refuses
// the save and names its position.
async function compileInputSteps(steps: StepInput[]): Promise<CompiledStep[]> {
	const views = await loadViewSettings(dataSource.manager)
	return steps.filter((step) => step.enabled).map((step, index) => {
		if (step.strategy === 'folder_regex' && step.config.target === 'attribute' && !step.config.attributeName) {
			throw new TRPCError({ code: 'BAD_REQUEST', message: `Step ${index + 1}: choose the attribute the folder gives.` })
		}
		if (step.strategy === 'metadata' && !step.config.metadataFieldId) {
			throw new TRPCError({ code: 'BAD_REQUEST', message: `Step ${index + 1}: choose a metadata field.` })
		}
		try {
			return { id: step.id ?? `step-${index}`, strategy: step.strategy, config: step.config, ...compileStep(step.strategy, step.config, views) }
		} catch (error) {
			throw new TRPCError({ code: 'BAD_REQUEST', message: `Step ${index + 1}: ${error.message}` })
		}
	})
}

export default router({
	list: publicProcedure
		.use(authMiddleware(userAdmin))
		.query(async () => {
			const types = await dataSource.getRepository(AssetType).find({ order: { name: 'ASC' } })
			const steps = await dataSource.getRepository(AssetTypeResolverStep).find({ order: { position: 'ASC' } })
			const counts: { asset_type_id: string, files: number }[] = await dataSource.query(`
				SELECT asset_type_id, count(*)::int AS files FROM asset_files WHERE asset_type_id IS NOT NULL AND status <> 'pending_deletion' GROUP BY asset_type_id
			`)
			const attributes: { name: string }[] = await dataSource.query('SELECT DISTINCT skeys(meta_data) AS name FROM records ORDER BY 1')
			const views = await loadViewSettings(dataSource.manager)
			return {
				types: types.map((type) => ({
					id: type.id,
					name: type.name,
					isRelatedToRecords: type.isRelatedToRecords,
					files: counts.find((count) => count.asset_type_id === type.id)?.files ?? 0,
					steps: steps.filter((step) => step.assetTypeId === type.id).map(formatResolverStep),
				})),
				legacyPattern: process.env.PRODUCT_MATCHING_REGEX || null,
				legacyEnabled: process.env.ENABLE_LEGACY_PRODUCT_MATCHING !== 'false',
				views,
				generatedViewPart: views.enabled ? fullFilenamePattern('', views) : null,
				attributes: attributes.map((row) => row.name),
			}
		}),
	save: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(z.object({ assetTypeId: z.uuid(), steps: stepInput.array().max(20) }))
		.mutation(async ({ input }) => {
			if (!(await dataSource.getRepository(AssetType).existsBy({ id: input.assetTypeId }))) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Asset type not found.' })
			}
			await compileInputSteps(input.steps)
			await dataSource.transaction(async (em) => {
				const repository = em.getRepository(AssetTypeResolverStep)
				const existing = await repository.findBy({ assetTypeId: input.assetTypeId })
				const kept = input.steps.map((step) => step.id).filter((id): id is string => !!id && existing.some((current) => current.id === id))
				const removed = existing.filter((step) => !kept.includes(step.id))
				if (removed.length) await repository.delete({ id: In(removed.map((step) => step.id)) })
				for (const [position, step] of input.steps.entries()) {
					const row = existing.find((current) => current.id === step.id) ?? repository.create({ assetTypeId: input.assetTypeId })
					row.position = position
					row.strategy = step.strategy
					row.config = step.config
					row.enabled = step.enabled
					row.lastError = null
					await repository.save(row)
				}
			})
			const applied = await rerunEntityStage()
			const steps = await dataSource.getRepository(AssetTypeResolverStep).find({ where: { assetTypeId: input.assetTypeId }, order: { position: 'ASC' } })
			return { steps: steps.map(formatResolverStep), applied }
		}),
	// Runs unsaved steps on up to 40 files of a folder and its subfolders and
	// writes nothing.
	preview: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(z.object({ assetTypeId: z.uuid(), folderId: z.uuid(), steps: stepInput.array().max(20) }))
		.query(async ({ input }) => {
			const folder = await dataSource.getRepository(AssetFolder).findOneBy({ id: input.folderId })
			if (!folder) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Asset folder not found.' })
			}
			const steps = await compileInputSteps(input.steps)
			const [{ mpath }] = await dataSource.query('SELECT mpath FROM asset_folders WHERE id = $1', [folder.id])
			const files = await loadFilesToResolve(dataSource.manager, `AND f.mpath LIKE $1 || '%' ORDER BY f.path, a.name LIMIT ${PREVIEW_FILES}`, [mpath])
			const attachments = await loadAttachments(dataSource.manager)
			const attributeNames = input.steps.map((step) => step.config.attributeName).filter((name): name is string => !!name)
			const catalogue = await loadCatalogue(dataSource.manager, attributeNames)
			const manual: ExistingLink[] = files.length ? await dataSource.query(`
				SELECT id, asset_file_id AS "assetFileId", target_kind AS "targetKind", record_id AS "recordId", record_key AS "recordKey",
					attribute_name AS "attributeName", attribute_value AS "attributeValue", strategy, resolver_step_id AS "resolverStepId",
					source_folder_id AS "sourceFolderId", is_primary AS "isPrimary", status
				FROM asset_entity_links WHERE strategy = 'manual_file' AND asset_file_id = ANY($1)
			`, [files.map((file) => file.id)]) : []
			return files.map((file) => {
				const resolution = resolveFile(file, steps, attachments, manual.filter((link) => link.assetFileId === file.id), catalogue)
				const primary = resolution.links.find((link) => link.isPrimary)
				return {
					id: file.id,
					name: file.name,
					path: file.path,
					otherType: file.assetTypeId !== input.assetTypeId,
					status: resolution.links.some((link) => link.status === 'dangling') && resolution.status !== 'matched' ? 'dangling' : resolution.status,
					reason: resolution.reason,
					recordKey: primary?.recordKey ?? resolution.links.find((link) => link.targetKind === 'record')?.recordKey ?? null,
					view: resolution.primaryView,
					links: resolution.links.map((link) => ({ targetKind: link.targetKind, recordKey: link.recordKey, attributeName: link.attributeName, attributeValue: link.attributeValue, strategy: link.strategy, status: link.status })),
				}
			})
		}),
	rerun: publicProcedure
		.use(authMiddleware(userAdmin))
		.mutation(() => rerunEntityStage()),
})
