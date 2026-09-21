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
// X)" before anything is written.
async function summarizeChanges(folders: FolderRow[], changes: FolderResolution[]) {
	const byId = new Map(folders.map((folder) => [folder.id, folder]))
	const groups = new Map<string, { assetTypeId: string | null, source: string | null, ruleId: string | null, count: number }>()
	const add = (folder: FolderRow) => {
		const key = `${folder.assetTypeId}|${folder.assetTypeSource}|${folder.assetTypeRuleId}`
		const group = groups.get(key) ?? { assetTypeId: folder.assetTypeId, source: folder.assetTypeSource, ruleId: folder.assetTypeRuleId, count: 0 }
		group.count++
		groups.set(key, group)
	}
	for (const change of changes) add(byId.get(change.id)!)
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
			const byId = new Map(folders.map((folder) => [folder.id, folder]))
			const applied = (ruleId: string) => (wins.get(ruleId) ?? []).filter((id) => byId.get(id)!.assetTypeSource !== 'manual')
			return {
				folderCount: folders.length,
				roots: folders.filter((folder) => !folder.parentId).map((folder) => folder.path),
				rules: rules.map((rule) => ({
					...formatAssetTypeRule(rule),
					folders: applied(rule.id).length,
					keptByHand: (wins.get(rule.id)?.length ?? 0) - applied(rule.id).length,
					examples: applied(rule.id).slice(0, EXAMPLES).map((id) => byId.get(id)!.path),
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
			const winnerOf = new Map<string, string>()
			for (const [ruleId, folderIds] of wins) for (const folderId of folderIds) winnerOf.set(folderId, ruleId)
			const patterns = new Map((await dataSource.getRepository(AssetTypeRule).find()).map((rule) => [rule.id, rule.pattern]))
			const matched = folders.filter((folder) => candidate.regex.test(folder.path))
			const keptByHand = matched.filter((folder) => folder.assetTypeSource === 'manual')
			const lostTo = new Map<string, number>()
			for (const folder of matched) {
				const winner = winnerOf.get(folder.id)
				if (folder.assetTypeSource !== 'manual' && winner && winner !== candidate.id) lostTo.set(winner, (lostTo.get(winner) ?? 0) + 1)
			}
			return {
				matches: matched.length,
				examples: matched.slice(0, EXAMPLES).map((folder) => folder.path),
				applied: (wins.get(candidate.id) ?? []).filter((id) => !keptByHand.some((folder) => folder.id === id)).length,
				keptByHand: keptByHand.length,
				lostTo: [...lostTo].map(([ruleId, count]) => ({ rulePattern: patterns.get(ruleId) ?? null, count })),
				changes: await summarizeChanges(folders, changes),
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
