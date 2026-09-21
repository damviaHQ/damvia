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
import { AssetType } from "../../entity/asset-type"
import { AssetTypeRule } from "../../entity/asset-type-rule"
import { dataSource } from "../../env"
import { compileRule, CompiledRule, FolderResolution, FolderRow, loadCompiledRules, loadFolders, PATTERN_MAX_LENGTH, resolveFolderAssetTypes, reresolveRule } from "../../services/asset-type-rules"
import { authMiddleware, publicProcedure, router, userAdmin } from "../index"

const EXAMPLES = 10

export function formatAssetTypeRule(rule: AssetTypeRule) {
	return {
		id: rule.id,
		pattern: rule.pattern,
		assetTypeId: rule.assetTypeId,
		enabled: rule.enabled,
		lastError: rule.lastError,
		createdById: rule.createdById,
		createdAt: rule.createdAt,
		updatedAt: rule.updatedAt,
	}
}

const pattern = z.string().max(PATTERN_MAX_LENGTH).superRefine((value, ctx) => {
	try {
		compileRule(value)
	} catch (error) {
		ctx.addIssue({ code: 'custom', message: error.message })
	}
})

const ruleInput = z.object({
	pattern,
	assetTypeId: z.uuid(),
	enabled: z.boolean().optional(),
})

async function assertPatternFree(pattern: string, exceptId?: string) {
	const duplicate = await dataSource.getRepository(AssetTypeRule).findOneBy({ pattern })
	if (duplicate && duplicate.id !== exceptId) {
		throw new TRPCError({ code: 'BAD_REQUEST', message: 'A rule with this pattern already exists.' })
	}
}

async function assertAssetType(id: string) {
	if (!(await dataSource.getRepository(AssetType).existsBy({ id }))) {
		throw new TRPCError({ code: 'NOT_FOUND', message: 'Asset type not found.' })
	}
}

// What the folders currently hold where the resolution would change, grouped
// by type and origin, so the admin sees "12 folders currently Packshot (rule
// X)" before anything is written. Manual folders the rule matches are listed
// too, as not changed.
async function summarizeChanges(folders: FolderRow[], changes: FolderResolution[], manualMatched: FolderRow[]) {
	const byId = new Map(folders.map((folder) => [folder.id, folder]))
	const groups = new Map<string, { assetTypeId: string | null, source: string | null, ruleId: string | null, count: number }>()
	const add = (folder: FolderRow) => {
		const key = `${folder.assetTypeId}|${folder.assetTypeSource}|${folder.assetTypeRuleId}`
		const group = groups.get(key) ?? { assetTypeId: folder.assetTypeId, source: folder.assetTypeSource, ruleId: folder.assetTypeRuleId, count: 0 }
		group.count++
		groups.set(key, group)
	}
	for (const change of changes) add(byId.get(change.id)!)
	for (const folder of manualMatched) add(folder)
	const types = await dataSource.getRepository(AssetType).find()
	const rules = await dataSource.getRepository(AssetTypeRule).find()
	const files = changes.length ? await dataSource.query('SELECT count(*)::int AS count FROM asset_files WHERE folder_id = ANY($1)', [changes.map((change) => change.id)]) : [{ count: 0 }]
	return {
		folders: changes.length,
		files: files[0].count as number,
		groups: [...groups.values()].map((group) => ({
			count: group.count,
			assetTypeName: types.find((type) => type.id === group.assetTypeId)?.name ?? null,
			source: group.source,
			rulePattern: rules.find((rule) => rule.id === group.ruleId)?.pattern ?? null,
		})),
	}
}

export default router({
	list: publicProcedure
		.use(authMiddleware(userAdmin))
		.query(async () => {
			const rules = await dataSource.getRepository(AssetTypeRule).find({ order: { createdAt: 'ASC', id: 'ASC' } })
			const folders = await loadFolders(dataSource.manager)
			const compiled = await loadCompiledRules(dataSource.manager)
			const { wins, overlaps } = resolveFolderAssetTypes(folders, compiled)
			const paths = new Map(folders.map((folder) => [folder.id, folder.path]))
			return {
				folderCount: folders.length,
				rules: rules.map((rule) => ({
					...formatAssetTypeRule(rule),
					folders: wins.get(rule.id)?.length ?? 0,
					examples: (wins.get(rule.id) ?? []).slice(0, EXAMPLES).map((id) => paths.get(id)!),
					overlaps: [...new Set(overlaps.filter((overlap) => overlap.ruleId === rule.id || overlap.otherRuleId === rule.id).map((overlap) => overlap.ruleId === rule.id ? overlap.otherRuleId : overlap.ruleId))],
				})),
			}
		}),
	preview: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(ruleInput.extend({ id: z.uuid().optional() }))
		.query(async ({ input }) => {
			const existing = input.id ? await dataSource.getRepository(AssetTypeRule).findOneBy({ id: input.id }) : null
			const candidate: CompiledRule = { id: input.id ?? 'preview', regex: compileRule(input.pattern), assetTypeId: input.assetTypeId, createdAt: existing?.createdAt ?? new Date() }
			const others = (await loadCompiledRules(dataSource.manager)).filter((rule) => rule.id !== candidate.id)
			const rules = input.enabled === false ? others : [...others, candidate].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))
			const folders = await loadFolders(dataSource.manager)
			const { wins, changes } = resolveFolderAssetTypes(folders, rules)
			const byId = new Map(folders.map((folder) => [folder.id, folder]))
			const won = wins.get(candidate.id) ?? []
			const manualMatched = won.map((id) => byId.get(id)!).filter((folder) => folder.assetTypeSource === 'manual')
			return {
				matches: won.length,
				examples: won.slice(0, EXAMPLES).map((id) => byId.get(id)!.path),
				changes: await summarizeChanges(folders, changes, manualMatched),
			}
		}),
	create: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(ruleInput)
		.mutation(async ({ input, ctx }) => {
			await assertAssetType(input.assetTypeId)
			await assertPatternFree(input.pattern)
			const rule = new AssetTypeRule()
			rule.pattern = input.pattern
			rule.assetTypeId = input.assetTypeId
			rule.enabled = input.enabled ?? true
			rule.createdById = ctx.user.id
			await dataSource.getRepository(AssetTypeRule).save(rule)
			const applied = await reresolveRule(rule.id)
			return { rule: formatAssetTypeRule(rule), applied }
		}),
	update: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(ruleInput.extend({ id: z.uuid() }))
		.mutation(async ({ input }) => {
			const rule = await dataSource.getRepository(AssetTypeRule).findOneBy({ id: input.id })
			if (!rule) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Folder rule not found.' })
			}
			await assertAssetType(input.assetTypeId)
			await assertPatternFree(input.pattern, rule.id)
			rule.pattern = input.pattern
			rule.assetTypeId = input.assetTypeId
			rule.enabled = input.enabled ?? rule.enabled
			rule.lastError = null
			await dataSource.getRepository(AssetTypeRule).save(rule)
			const applied = await reresolveRule(rule.id)
			return { rule: formatAssetTypeRule(rule), applied }
		}),
	remove: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(z.uuid())
		.mutation(async ({ input }) => {
			const rule = await dataSource.getRepository(AssetTypeRule).findOneBy({ id: input })
			if (!rule) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Folder rule not found.' })
			}
			await dataSource.getRepository(AssetTypeRule).remove(rule)
		}),
	reresolve: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(z.uuid())
		.mutation(async ({ input }) => {
			if (!(await dataSource.getRepository(AssetTypeRule).existsBy({ id: input }))) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Folder rule not found.' })
			}
			return reresolveRule(input)
		}),
})
