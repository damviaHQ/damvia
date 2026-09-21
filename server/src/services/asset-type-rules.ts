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
import { runInNewContext } from "node:vm"
import { EntityManager } from "typeorm"
import { AssetTypeSource } from "../entity/asset-folder"
import { AssetTypeRule } from "../entity/asset-type-rule"
import { dataSource, logger } from "../env"

export const PATTERN_MAX_LENGTH = 500
export const ENRICHMENT_LOCK = 7218001
const PATTERN_MAX_MILLISECONDS = 50
const SAMPLE_PATH = '/' + Array.from({ length: 20 }, (_, index) => `Sample folder ${index}`).join('/')

export type CompiledRule = { id: string, regex: RegExp, assetTypeId: string, createdAt: Date }

export type FolderRow = {
	id: string
	parentId: string | null
	mpath: string
	path: string
	assetTypeId: string | null
	assetTypeSource: AssetTypeSource | null
	assetTypeRuleId: string | null
}

export type FolderResolution = { id: string, assetTypeId: string | null, assetTypeSource: AssetTypeSource | null, assetTypeRuleId: string | null }

export type Overlap = { ruleId: string, otherRuleId: string, folderId: string, path: string }

// Admin regexes run in Node only, never in Postgres. The sample run goes
// through the vm timeout because a catastrophic pattern does not come back to
// be timed: V8 only interrupts the backtracking on a script termination.
export function compileRule(pattern: string): RegExp {
	if (pattern.length === 0) throw new Error('The pattern is empty.')
	if (pattern.length > PATTERN_MAX_LENGTH) throw new Error(`The pattern is longer than ${PATTERN_MAX_LENGTH} characters.`)
	let regex: RegExp
	try {
		regex = new RegExp(pattern, 'i')
	} catch (error) {
		throw new Error(`Not a valid regular expression: ${error.message}`)
	}
	try {
		runInNewContext('regex.test(path)', { regex, path: SAMPLE_PATH }, { timeout: PATTERN_MAX_MILLISECONDS })
	} catch {
		throw new Error(`The pattern takes more than ${PATTERN_MAX_MILLISECONDS} ms on a sample path.`)
	}
	return regex
}

// Oldest first, so a tie between two rules starting at the same level goes to
// the older one. A rule that no longer compiles is skipped for this pass and
// carries the error on the rules screen.
export async function loadCompiledRules(em: EntityManager): Promise<CompiledRule[]> {
	const rules = await em.getRepository(AssetTypeRule).find({ where: { enabled: true }, order: { createdAt: 'ASC', id: 'ASC' } })
	const compiled: CompiledRule[] = []
	for (const rule of rules) {
		try {
			compiled.push({ id: rule.id, regex: compileRule(rule.pattern), assetTypeId: rule.assetTypeId, createdAt: rule.createdAt })
			if (rule.lastError) await em.getRepository(AssetTypeRule).update(rule.id, { lastError: null })
		} catch (error) {
			logger.error('enrichment.rule-invalid', { ruleId: rule.id, pattern: rule.pattern, error: error.message })
			await em.getRepository(AssetTypeRule).update(rule.id, { lastError: error.message })
		}
	}
	return compiled
}

export function loadFolders(em: EntityManager): Promise<FolderRow[]> {
	return em.query(`
		SELECT id, parent_id AS "parentId", mpath, path, asset_type_id AS "assetTypeId", asset_type_source AS "assetTypeSource", asset_type_rule_id AS "assetTypeRuleId"
		FROM asset_folders WHERE path IS NOT NULL ORDER BY mpath
	`)
}

export type Resolution = {
	resolved: Map<string, FolderResolution>
	changes: FolderResolution[]
	overlaps: Overlap[]
	wins: Map<string, string[]>
}

// Deepest start wins: a rule's start level is the highest ancestor from which
// it matches without interruption down to the folder. A hand-set type is
// left alone and anchors its descendants: a rule that started at or above
// the hand-set folder is blocked below it, a rule that starts deeper wins.
export function resolveFolderAssetTypes(folders: FolderRow[], rules: CompiledRule[]): Resolution {
	const ordered = [...folders].sort((a, b) => a.path.split('/').length - b.path.split('/').length)
	const states = new Map<string, { starts: Map<string, number>, assetTypeId: string | null, manualLevel: number }>()
	const resolved = new Map<string, FolderResolution>()
	const changes: FolderResolution[] = []
	const overlaps: Overlap[] = []
	const wins = new Map<string, string[]>()
	for (const folder of ordered) {
		const level = folder.path.split('/').length - 1
		const parent = folder.parentId ? states.get(folder.parentId) : undefined
		const manual = folder.assetTypeSource === 'manual' && !!folder.assetTypeId
		const blockedLevel = parent?.manualLevel ?? 0
		const starts = new Map<string, number>()
		const candidates: { rule: CompiledRule, start: number }[] = []
		for (const rule of rules) {
			if (!rule.regex.test(folder.path)) continue
			const start = parent?.starts.get(rule.id) ?? level
			starts.set(rule.id, start)
			if (start > blockedLevel) candidates.push({ rule, start })
		}
		const winnerStart = Math.max(0, ...candidates.map((candidate) => candidate.start))
		const tied = candidates.filter((candidate) => candidate.start === winnerStart)
		const winner = tied[0]?.rule ?? null
		if (winner) {
			const list = wins.get(winner.id) ?? []
			list.push(folder.id)
			wins.set(winner.id, list)
			for (const other of tied.slice(1)) overlaps.push({ ruleId: winner.id, otherRuleId: other.rule.id, folderId: folder.id, path: folder.path })
		}
		let resolution: FolderResolution
		if (manual) {
			resolution = { id: folder.id, assetTypeId: folder.assetTypeId, assetTypeSource: 'manual', assetTypeRuleId: null }
		} else if (winner) {
			resolution = { id: folder.id, assetTypeId: winner.assetTypeId, assetTypeSource: 'rule', assetTypeRuleId: winner.id }
		} else {
			const inherited = parent?.assetTypeId ?? null
			resolution = { id: folder.id, assetTypeId: inherited, assetTypeSource: inherited ? 'inherited' : null, assetTypeRuleId: null }
		}
		states.set(folder.id, { starts, assetTypeId: resolution.assetTypeId, manualLevel: manual ? level : blockedLevel })
		resolved.set(folder.id, resolution)
		if (resolution.assetTypeId !== folder.assetTypeId || resolution.assetTypeSource !== folder.assetTypeSource || resolution.assetTypeRuleId !== folder.assetTypeRuleId) {
			changes.push(resolution)
		}
	}
	return { resolved, changes, overlaps, wins }
}

// Two set-based statements: the changed folders, then the files of those
// folders. Nothing is written for a folder that already holds its resolution.
export async function applyFolderAssetTypes(em: EntityManager, changes: FolderResolution[]): Promise<{ folders: number, files: number }> {
	if (changes.length === 0) return { folders: 0, files: 0 }
	const ids = changes.map((change) => change.id)
	await em.query(`
		UPDATE asset_folders f
		SET asset_type_id = v.asset_type_id, asset_type_source = v.asset_type_source, asset_type_rule_id = v.asset_type_rule_id, updated_at = now()
		FROM unnest($1::uuid[], $2::uuid[], $3::varchar[], $4::uuid[]) AS v(id, asset_type_id, asset_type_source, asset_type_rule_id)
		WHERE f.id = v.id
	`, [ids, changes.map((change) => change.assetTypeId), changes.map((change) => change.assetTypeSource), changes.map((change) => change.assetTypeRuleId)])
	const [, files] = await em.query(`
		UPDATE asset_files a SET asset_type_id = f.asset_type_id, updated_at = now()
		FROM asset_folders f
		WHERE a.folder_id = f.id AND f.id = ANY($1) AND a.asset_type_id IS DISTINCT FROM f.asset_type_id
	`, [ids])
	return { folders: changes.length, files }
}

export async function refreshFolderPaths(em: EntityManager): Promise<number> {
	const [, updated] = await em.query(`
		WITH RECURSIVE tree AS (
			SELECT id, '/' || name AS path FROM asset_folders WHERE parent_id IS NULL
			UNION ALL
			SELECT f.id, tree.path || '/' || f.name FROM asset_folders f INNER JOIN tree ON f.parent_id = tree.id
		)
		UPDATE asset_folders f SET path = tree.path FROM tree WHERE f.id = tree.id AND f.path IS DISTINCT FROM tree.path
	`)
	return updated
}

export async function resolveAllFolders(em: EntityManager): Promise<{ folders: FolderRow[], rules: CompiledRule[], resolution: Resolution }> {
	const rules = await loadCompiledRules(em)
	const folders = await loadFolders(em)
	return { folders, rules, resolution: resolveFolderAssetTypes(folders, rules) }
}

// Re-apply one rule: only the folders it types, the folders it used to type,
// and the descendants that inherit from them change. Other edited rules wait
// for the next pass.
export async function reresolveRule(ruleId: string): Promise<{ folders: number, files: number }> {
	return dataSource.transaction(async (em) => {
		await em.query('SELECT pg_advisory_xact_lock($1)', [ENRICHMENT_LOCK])
		await refreshFolderPaths(em)
		const { folders, resolution } = await resolveAllFolders(em)
		const scoped = new Set<string>()
		for (const folder of folders) {
			if (folder.assetTypeRuleId === ruleId || resolution.resolved.get(folder.id)?.assetTypeRuleId === ruleId) scoped.add(folder.id)
		}
		const byId = new Map(folders.map((folder) => [folder.id, folder]))
		const inScope = (change: FolderResolution) => {
			if (scoped.has(change.id)) return true
			if (change.assetTypeSource !== 'inherited' && change.assetTypeSource !== null) return false
			return byId.get(change.id)!.mpath.split('.').some((ancestorId) => ancestorId && scoped.has(ancestorId))
		}
		return applyFolderAssetTypes(em, resolution.changes.filter(inScope))
	})
}
