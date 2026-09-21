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
import { AssetEntityLink, EntityLinkStrategy } from "../entity/asset-entity-link"
import { ResolutionCandidate, ResolutionStatus } from "../entity/asset-file-resolution"
import { AssetTypeResolverStep, ResolverStepConfig } from "../entity/asset-type-resolver-step"
import { logger } from "../env"
import { compileRule } from "./asset-type-rules"

// Which link decides the primary record when several strategies found one.
// Links set by hand come first; among automatic ones, the more explicit wins.
const STRATEGY_ORDER: EntityLinkStrategy[] = ['manual_file', 'manual_folder', 'csv', 'filename_regex', 'folder_regex', 'metadata']

export type CompiledStep = {
	id: string
	strategy: AssetTypeResolverStep['strategy']
	config: ResolverStepConfig
	regex: RegExp | null
	viewGroup: number | null
}

export type FileToResolve = {
	id: string
	name: string
	folderId: string
	mpath: string
	path: string
	assetTypeId: string | null
	related: boolean
	recordId: string | null
	recordView: string | null
}

export type Attachment = {
	folderId: string
	targetKind: 'record' | 'attribute'
	recordKey: string | null
	attributeName: string | null
	attributeValue: string | null
}

export type ExistingLink = {
	id: string
	assetFileId: string
	targetKind: 'record' | 'attribute'
	recordId: string | null
	recordKey: string | null
	attributeName: string | null
	attributeValue: string | null
	strategy: EntityLinkStrategy
	resolverStepId: string | null
	sourceFolderId: string | null
	isPrimary: boolean
	status: 'active' | 'dangling'
}

export type DesiredLink = Omit<ExistingLink, 'id' | 'assetFileId'>

export type Catalogue = {
	recordIds: Map<string, string>
	attributeValues: Set<string>
}

export type FileResolution = {
	links: DesiredLink[]
	status: ResolutionStatus
	reason: string | null
	candidates: ResolutionCandidate[]
	primaryRecordId: string | null
	primaryView: string | null
	keepRecord: boolean
}

export function countGroups(pattern: string): number {
	return new RegExp(`${pattern}|`).exec('')!.length - 1
}

// A step whose pattern or groups do not hold is rejected with the sentence the
// admin reads under the field.
export function compileStep(strategy: CompiledStep['strategy'], config: ResolverStepConfig, views: ViewSettings | null = null): { regex: RegExp | null, viewGroup: number | null } {
	if (strategy !== 'filename_regex' && strategy !== 'folder_regex') return { regex: null, viewGroup: null }
	const pattern = config.pattern ?? ''
	const groups = countGroups(pattern)
	if (groups === 0) throw new Error('Put the key part in parentheses.')
	const keyGroup = strategy === 'folder_regex' && config.target === 'attribute' ? config.valueGroup ?? 1 : config.keyGroup ?? 1
	if (keyGroup < 1 || keyGroup > groups) throw new Error(`The pattern has ${groups} group${groups === 1 ? '' : 's'}; group ${keyGroup} does not exist.`)
	if (strategy === 'folder_regex') return { regex: compileRule(pattern, 'id'), viewGroup: null }
	if (config.viewGroup) {
		if (config.viewGroup > groups) throw new Error(`The pattern has ${groups} group${groups === 1 ? '' : 's'}; group ${config.viewGroup} does not exist.`)
		return { regex: compileRule(pattern, 'd'), viewGroup: config.viewGroup }
	}
	if (views?.enabled) {
		return { regex: compileRule(fullFilenamePattern(pattern, views), 'd'), viewGroup: groups + 1 }
	}
	return { regex: compileRule(pattern, 'd'), viewGroup: null }
}

export type ViewSettings = { enabled: boolean, separator: string, digits: number }

// The admin writes the key part; the view part comes from the Views setting.
export function fullFilenamePattern(pattern: string, views: ViewSettings): string {
	const separator = views.separator.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
	return `${pattern}(?:${separator}(\\d{${views.digits}}))?`
}

// The old cron matched the whole file name, case-sensitive; this step keeps
// that exactly so switching the cron off changes no link.
export function resolveByFilenameRegex(name: string, step: CompiledStep): ResolutionCandidate[] {
	const match = step.regex?.exec(name)
	const keyGroup = step.config.keyGroup ?? 1
	const key = match?.[keyGroup]
	if (!match || !key) return []
	const indices = (match as RegExpExecArray & { indices?: [number, number][] }).indices
	return [{
		strategy: 'filename_regex',
		stepId: step.id,
		kind: 'record',
		key,
		view: step.viewGroup ? match[step.viewGroup] ?? null : null,
		consumedSpan: indices?.[keyGroup] ?? null,
	}]
}

export function resolveByFolderRegex(path: string, step: CompiledStep): ResolutionCandidate[] {
	const match = step.regex?.exec(path)
	if (!match) return []
	if (step.config.target === 'attribute') {
		const value = match[step.config.valueGroup ?? 1]
		if (!value || !step.config.attributeName) return []
		return [{ strategy: 'folder_regex', stepId: step.id, kind: 'attribute', attributeName: step.config.attributeName, attributeValue: value }]
	}
	const key = match[step.config.keyGroup ?? 1]
	return key ? [{ strategy: 'folder_regex', stepId: step.id, kind: 'record', key }] : []
}

// The nearest folder carrying attachments decides; subfolders inherit them.
export function resolveByFolderAttachment(mpath: string, attachments: Map<string, Attachment[]>): { candidates: ResolutionCandidate[], folderId: string | null } {
	const ancestors = mpath.split('.').filter((id) => id).reverse()
	for (const folderId of ancestors) {
		const found = attachments.get(folderId)
		if (found?.length) {
			return {
				folderId,
				candidates: found.map((attachment) => attachment.targetKind === 'record'
					? { strategy: 'manual_folder', stepId: null, kind: 'record', key: attachment.recordKey! }
					: { strategy: 'manual_folder', stepId: null, kind: 'attribute', attributeName: attachment.attributeName!, attributeValue: attachment.attributeValue! }),
			}
		}
	}
	return { candidates: [], folderId: null }
}

export const attributeKey = (name: string, value: string) => `${name}\u0000${value}`

const rank = (strategy: EntityLinkStrategy) => STRATEGY_ORDER.indexOf(strategy)

// Candidates from every strategy become links. Agreeing strategies each keep
// their row; two different automatic keys are a conflict nobody resolves but
// a person, and a link set by hand settles it for good.
export function mergeCandidates(candidates: ResolutionCandidate[], manual: ExistingLink[], catalogue: Catalogue, sourceFolderId: string | null): FileResolution {
	const links: DesiredLink[] = []
	const seen = new Set<string>()
	for (const candidate of candidates) {
		const identity = `${candidate.kind}|${candidate.key ?? ''}|${candidate.attributeName ?? ''}|${candidate.attributeValue ?? ''}|${candidate.strategy}`
		if (seen.has(identity)) continue
		seen.add(identity)
		const recordId = candidate.kind === 'record' ? catalogue.recordIds.get(candidate.key!) ?? null : null
		const active = candidate.kind === 'record' ? !!recordId : catalogue.attributeValues.has(attributeKey(candidate.attributeName!, candidate.attributeValue!))
		links.push({
			targetKind: candidate.kind,
			recordId,
			recordKey: candidate.kind === 'record' ? candidate.key! : null,
			attributeName: candidate.kind === 'attribute' ? candidate.attributeName! : null,
			attributeValue: candidate.kind === 'attribute' ? candidate.attributeValue! : null,
			strategy: candidate.strategy as EntityLinkStrategy,
			resolverStepId: candidate.stepId,
			sourceFolderId: candidate.strategy === 'manual_folder' ? sourceFolderId : null,
			isPrimary: false,
			status: active ? 'active' : 'dangling',
		})
	}
	const manualLinks: DesiredLink[] = manual.map((link) => {
		const recordId = link.targetKind === 'record' ? catalogue.recordIds.get(link.recordKey ?? '') ?? null : null
		const active = link.targetKind === 'record' ? !!recordId : catalogue.attributeValues.has(attributeKey(link.attributeName ?? '', link.attributeValue ?? ''))
		return { ...link, recordId, isPrimary: false, status: active ? 'active' : 'dangling' }
	})
	const all = [...manualLinks, ...links]
	const manualRecord = manualLinks.some((link) => link.targetKind === 'record')
	const automaticKeys = new Set(links.filter((link) => link.targetKind === 'record' && link.strategy !== 'manual_folder').map((link) => link.recordKey))
	const folderKeys = new Set(links.filter((link) => link.targetKind === 'record' && link.strategy === 'manual_folder').map((link) => link.recordKey))
	const conflict = !manualRecord && folderKeys.size === 0 && automaticKeys.size > 1
	let primary: DesiredLink | null = null
	if (!conflict) {
		primary = all
			.filter((link) => link.targetKind === 'record' && link.status === 'active')
			.sort((a, b) => rank(a.strategy) - rank(b.strategy) || (a.recordKey ?? '').localeCompare(b.recordKey ?? ''))[0] ?? null
		if (primary) primary.isPrimary = true
	}
	const dangling = all.filter((link) => link.status === 'dangling')
	const matched = all.some((link) => link.status === 'active')
	const status: ResolutionStatus = conflict ? 'conflict' : matched ? 'matched' : 'unmatched'
	let reason: string | null = null
	if (conflict) {
		reason = `Strategies disagree: ${[...automaticKeys].join(', ')}`
	} else if (!matched) {
		reason = dangling.length
			? dangling.map((link) => link.targetKind === 'record' ? `no record with key ${link.recordKey}` : `no record where ${link.attributeName} = ${link.attributeValue}`).join('; ')
			: 'no strategy found a key'
	}
	// Like the old job, a view found in the name is kept even when its key has
	// no record yet.
	const primaryCandidate = primary
		? candidates.find((candidate) => candidate.kind === 'record' && candidate.key === primary!.recordKey && candidate.view)
		: candidates.find((candidate) => candidate.kind === 'record' && candidate.view)
	return {
		links: [...manualLinks, ...links],
		status,
		reason,
		candidates,
		primaryRecordId: primary?.recordId ?? null,
		primaryView: primaryCandidate?.view ?? null,
		keepRecord: conflict,
	}
}

export function resolveFile(file: FileToResolve, steps: CompiledStep[], attachments: Map<string, Attachment[]>, manual: ExistingLink[], catalogue: Catalogue, extra: ResolutionCandidate[] = []): FileResolution {
	const candidates: ResolutionCandidate[] = []
	const folder = resolveByFolderAttachment(file.mpath, attachments)
	candidates.push(...folder.candidates)
	candidates.push(...extra)
	for (const step of steps) {
		if (step.strategy === 'filename_regex') candidates.push(...resolveByFilenameRegex(file.name, step))
		else if (step.strategy === 'folder_regex') candidates.push(...resolveByFolderRegex(file.path, step))
	}
	return mergeCandidates(candidates, manual, catalogue, folder.folderId)
}

export async function loadCatalogue(em: EntityManager, attributeNames: string[]): Promise<Catalogue> {
	const records: { id: string, record_key: string }[] = await em.query('SELECT id, record_key FROM records')
	const pairs: { key: string, value: string }[] = attributeNames.length
		? await em.query('SELECT DISTINCT e.key, e.value FROM records, each(records.meta_data) AS e WHERE e.key = ANY($1) AND e.value <> \'\'', [attributeNames])
		: []
	return {
		recordIds: new Map(records.map((record) => [record.record_key, record.id])),
		attributeValues: new Set(pairs.map((pair) => attributeKey(pair.key, pair.value))),
	}
}

export async function loadSteps(em: EntityManager, views: ViewSettings | null): Promise<Map<string, CompiledStep[]>> {
	const steps = await em.getRepository(AssetTypeResolverStep).find({ where: { enabled: true }, order: { position: 'ASC' } })
	const byType = new Map<string, CompiledStep[]>()
	for (const step of steps) {
		try {
			const compiled = compileStep(step.strategy, step.config, views)
			const list = byType.get(step.assetTypeId) ?? []
			list.push({ id: step.id, strategy: step.strategy, config: step.config, ...compiled })
			byType.set(step.assetTypeId, list)
			if (step.lastError) await em.getRepository(AssetTypeResolverStep).update(step.id, { lastError: null })
		} catch (error) {
			logger.error('enrichment.step-invalid', { stepId: step.id, error: error.message })
			await em.getRepository(AssetTypeResolverStep).update(step.id, { lastError: error.message })
		}
	}
	return byType
}

export async function loadAttachments(em: EntityManager): Promise<Map<string, Attachment[]>> {
	const rows: Attachment[] = await em.query(`
		SELECT asset_folder_id AS "folderId", target_kind AS "targetKind", record_key AS "recordKey", attribute_name AS "attributeName", attribute_value AS "attributeValue"
		FROM asset_folder_entity_attachments
	`)
	const byFolder = new Map<string, Attachment[]>()
	for (const row of rows) {
		const list = byFolder.get(row.folderId) ?? []
		list.push(row)
		byFolder.set(row.folderId, list)
	}
	return byFolder
}

export async function loadViewSettings(em: EntityManager): Promise<ViewSettings> {
	const [row] = await em.query('SELECT views_enabled, view_separator, view_digits FROM enrichment_settings WHERE id = 1')
	return { enabled: row.views_enabled, separator: row.view_separator, digits: row.view_digits }
}

export async function loadFilesToResolve(em: EntityManager, where = '', parameters: unknown[] = []): Promise<FileToResolve[]> {
	return em.query(`
		SELECT a.id, a.name, a.folder_id AS "folderId", f.mpath, coalesce(f.path, '') AS path, a.asset_type_id AS "assetTypeId",
			coalesce(t.is_related_to_records, false) AS related, a.record_id AS "recordId", a.record_view AS "recordView"
		FROM asset_files a
		INNER JOIN asset_folders f ON f.id = a.folder_id
		LEFT JOIN asset_types t ON t.id = a.asset_type_id
		WHERE a.status <> 'pending_deletion' ${where}
	`, parameters)
}

// jsonb gives keys back in its own order, so candidates compare on a sorted form.
export const stableJson = (value: unknown) => JSON.stringify(value, (_, current) =>
	current && typeof current === 'object' && !Array.isArray(current) ? Object.fromEntries(Object.entries(current).sort(([a], [b]) => a.localeCompare(b))) : current)

const linkIdentity = (link: { targetKind: string, recordKey: string | null, attributeName: string | null, attributeValue: string | null, strategy: string }) =>
	`${link.targetKind}|${link.recordKey ?? ''}|${link.attributeName ?? ''}|${link.attributeValue ?? ''}|${link.strategy}`

export type EntityStageResult = { files: number, matched: number, unmatched: number, conflicts: number, linksAdded: number, linksRemoved: number, linksUpdated: number, filesUpdated: number }

// Set-based writes: links, resolutions and the derived record columns change
// only where the computed state differs, so a second pass writes nothing.
export async function runEntityStage(em: EntityManager, extraCandidates: (file: FileToResolve) => ResolutionCandidate[] = () => []): Promise<EntityStageResult> {
	const views = await loadViewSettings(em)
	const steps = await loadSteps(em, views)
	const attachments = await loadAttachments(em)
	const files = await loadFilesToResolve(em)
	const attributeNames = new Set<string>()
	for (const list of steps.values()) for (const step of list) if (step.config.target === 'attribute' && step.config.attributeName) attributeNames.add(step.config.attributeName)
	for (const list of attachments.values()) for (const attachment of list) if (attachment.attributeName) attributeNames.add(attachment.attributeName)
	const existingLinks: ExistingLink[] = await em.query(`
		SELECT id, asset_file_id AS "assetFileId", target_kind AS "targetKind", record_id AS "recordId", record_key AS "recordKey",
			attribute_name AS "attributeName", attribute_value AS "attributeValue", strategy, resolver_step_id AS "resolverStepId",
			source_folder_id AS "sourceFolderId", is_primary AS "isPrimary", status
		FROM asset_entity_links
	`)
	for (const link of existingLinks) if (link.attributeName) attributeNames.add(link.attributeName)
	const catalogue = await loadCatalogue(em, [...attributeNames])
	const linksByFile = new Map<string, ExistingLink[]>()
	for (const link of existingLinks) {
		const list = linksByFile.get(link.assetFileId) ?? []
		list.push(link)
		linksByFile.set(link.assetFileId, list)
	}
	const resolutions: { asset_file_id: string, status: string, candidates: ResolutionCandidate[], reason: string | null }[] = await em.query('SELECT asset_file_id, status, candidates, reason FROM asset_file_resolutions')
	const resolutionByFile = new Map(resolutions.map((row) => [row.asset_file_id, row]))

	const inserts: (DesiredLink & { assetFileId: string })[] = []
	const deletes: string[] = []
	const updates: (DesiredLink & { id: string })[] = []
	const resolutionWrites: { id: string, status: string, candidates: string, reason: string | null }[] = []
	const fileWrites: { id: string, recordId: string | null, recordView: string | null }[] = []
	const result: EntityStageResult = { files: files.length, matched: 0, unmatched: 0, conflicts: 0, linksAdded: 0, linksRemoved: 0, linksUpdated: 0, filesUpdated: 0 }

	for (const file of files) {
		const existing = linksByFile.get(file.id) ?? []
		const manual = existing.filter((link) => link.strategy === 'manual_file')
		const automatic = existing.filter((link) => link.strategy !== 'manual_file')
		const typeSteps = file.assetTypeId ? steps.get(file.assetTypeId) ?? [] : []
		let resolution: FileResolution
		if (!file.related) {
			resolution = { links: [], status: 'not_applicable', reason: null, candidates: [], primaryRecordId: null, primaryView: null, keepRecord: true }
			for (const link of manual) {
				const recordId = link.targetKind === 'record' ? catalogue.recordIds.get(link.recordKey ?? '') ?? null : link.recordId
				if (recordId !== link.recordId) updates.push({ ...link, recordId, status: recordId || link.targetKind === 'attribute' ? 'active' : 'dangling' })
			}
		} else {
			resolution = resolveFile(file, typeSteps, attachments, manual, catalogue, extraCandidates(file))
			// A type with no step and a file nobody linked by hand stays with the
			// old filename job, which still owns its record link.
			if (!typeSteps.length && !manual.length && !resolution.links.some((link) => link.strategy === 'manual_folder')) {
				resolution.keepRecord = true
				if (resolution.status === 'unmatched') resolution.reason = 'this asset type has no matching step'
			}
			const byIdentity = new Map(existing.map((link) => [linkIdentity(link), link]))
			const wanted = new Set<string>()
			for (const link of resolution.links) {
				const identity = linkIdentity(link)
				wanted.add(identity)
				const current = byIdentity.get(identity)
				if (!current) {
					inserts.push({ ...link, assetFileId: file.id })
				} else if (current.recordId !== link.recordId || current.status !== link.status || current.isPrimary !== link.isPrimary
					|| current.resolverStepId !== link.resolverStepId || current.sourceFolderId !== link.sourceFolderId) {
					updates.push({ ...link, id: current.id })
				}
			}
			for (const link of automatic) if (!wanted.has(linkIdentity(link))) deletes.push(link.id)
			if (!resolution.keepRecord && (resolution.primaryRecordId !== file.recordId || resolution.primaryView !== file.recordView)) {
				fileWrites.push({ id: file.id, recordId: resolution.primaryRecordId, recordView: resolution.primaryView })
			}
		}
		if (!file.related) {
			for (const link of automatic) deletes.push(link.id)
		}
		if (resolution.status === 'matched') result.matched++
		else if (resolution.status === 'unmatched') result.unmatched++
		else if (resolution.status === 'conflict') result.conflicts++
		const stored = resolutionByFile.get(file.id)
		const candidates = stableJson(resolution.candidates)
		if (!stored || stored.status !== resolution.status || stored.reason !== resolution.reason || stableJson(stored.candidates) !== candidates) {
			resolutionWrites.push({ id: file.id, status: resolution.status, candidates, reason: resolution.reason })
		}
	}

	if (deletes.length) {
		await em.query('DELETE FROM asset_entity_links WHERE id = ANY($1)', [deletes])
	}
	for (let index = 0; index < inserts.length; index += 1000) {
		const batch = inserts.slice(index, index + 1000)
		await em.query(`
			INSERT INTO asset_entity_links (asset_file_id, target_kind, record_id, record_key, attribute_name, attribute_value, strategy, resolver_step_id, source_folder_id, is_primary, status)
			SELECT * FROM unnest($1::uuid[], $2::varchar[], $3::uuid[], $4::text[], $5::text[], $6::text[], $7::varchar[], $8::uuid[], $9::uuid[], $10::boolean[], $11::varchar[])
		`, [
			batch.map((link) => link.assetFileId), batch.map((link) => link.targetKind), batch.map((link) => link.recordId), batch.map((link) => link.recordKey),
			batch.map((link) => link.attributeName), batch.map((link) => link.attributeValue), batch.map((link) => link.strategy), batch.map((link) => link.resolverStepId),
			batch.map((link) => link.sourceFolderId), batch.map((link) => link.isPrimary), batch.map((link) => link.status),
		])
	}
	if (updates.length) {
		await em.query(`
			UPDATE asset_entity_links l SET record_id = v.record_id, status = v.status, is_primary = v.is_primary, resolver_step_id = v.resolver_step_id, source_folder_id = v.source_folder_id, updated_at = now()
			FROM unnest($1::uuid[], $2::uuid[], $3::varchar[], $4::boolean[], $5::uuid[], $6::uuid[]) AS v(id, record_id, status, is_primary, resolver_step_id, source_folder_id)
			WHERE l.id = v.id
		`, [updates.map((link) => link.id), updates.map((link) => link.recordId), updates.map((link) => link.status), updates.map((link) => link.isPrimary), updates.map((link) => link.resolverStepId), updates.map((link) => link.sourceFolderId)])
	}
	if (resolutionWrites.length) {
		await em.query(`
			INSERT INTO asset_file_resolutions (asset_file_id, status, candidates, reason, resolved_at)
			SELECT id, status, candidates::jsonb, reason, now() FROM unnest($1::uuid[], $2::varchar[], $3::text[], $4::text[]) AS v(id, status, candidates, reason)
			ON CONFLICT (asset_file_id) DO UPDATE SET status = EXCLUDED.status, candidates = EXCLUDED.candidates, reason = EXCLUDED.reason, resolved_at = now()
		`, [resolutionWrites.map((row) => row.id), resolutionWrites.map((row) => row.status), resolutionWrites.map((row) => row.candidates), resolutionWrites.map((row) => row.reason)])
	}
	if (fileWrites.length) {
		await em.query(`
			UPDATE asset_files a SET record_id = v.record_id, record_view = v.record_view, updated_at = now()
			FROM unnest($1::uuid[], $2::uuid[], $3::varchar[]) AS v(id, record_id, record_view)
			WHERE a.id = v.id
		`, [fileWrites.map((row) => row.id), fileWrites.map((row) => row.recordId), fileWrites.map((row) => row.recordView)])
	}
	result.linksAdded = inserts.length
	result.linksRemoved = deletes.length
	result.linksUpdated = updates.length
	result.filesUpdated = fileWrites.length
	return result
}

export async function linkedLinks(em: EntityManager, assetFileIds: string[]): Promise<AssetEntityLink[]> {
	if (!assetFileIds.length) return []
	return em.getRepository(AssetEntityLink).createQueryBuilder('link').where('link.asset_file_id IN (:...ids)', { ids: assetFileIds }).getMany()
}
