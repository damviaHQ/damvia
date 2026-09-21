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
import { ResolutionCandidate } from "../entity/asset-file-resolution"
import { User } from "../entity/user"
import { dataSource } from "../env"
import { userCollectionFilesQuery } from "./collection"
import { attachToExistingAxis, AxisCandidate, recognizeAxis, RECOGNIZER_NAMES } from "./variant-axes"

export type Token = { text: string, original: string, opaque: boolean }

export type VariantFile = {
	id: string
	name: string
	folderId: string
	assetTypeId: string
	hasThumbnail: boolean
	mimeType: string
	width: number | null
	height: number | null
	spans: [number, number][]
}

export type VariantOverrides = {
	excluded: Set<string>
	forced: { id: string, fileIds: string[] }[]
	covers: Map<string, string>
}

export type ComputedGroup = {
	folderId: string
	assetTypeId: string
	prefixKey: string
	displayName: string
	coverFileId: string
	members: { fileId: string, axisValues: string[] }[]
	columns: string[][]
	examples: string[]
}

const SEPARATORS = /[_\-\s.]+/

// The extension goes, each key a matching step consumed becomes one opaque
// token (so two SKUs never merge), the rest splits on _ - space and dot.
export function tokenizeFileName(name: string, spans: [number, number][], blocked: Set<string>): Token[] | null {
	const dot = name.lastIndexOf('.')
	const base = dot > 0 ? name.slice(0, dot) : name
	const tokens: Token[] = []
	const push = (text: string) => {
		for (const piece of text.split(SEPARATORS)) if (piece) tokens.push({ text: piece.toLowerCase(), original: piece, opaque: false })
	}
	let cursor = 0
	for (const [start, end] of [...spans].filter(([start, end]) => start >= 0 && end <= base.length && start < end).sort((a, b) => a[0] - b[0])) {
		if (start < cursor) continue
		push(base.slice(cursor, start))
		tokens.push({ text: `#${base.slice(start, end).toLowerCase()}`, original: base.slice(start, end), opaque: true })
		cursor = end
	}
	push(base.slice(cursor))
	if (tokens.some((token) => !token.opaque && blocked.has(token.text))) return null
	return tokens
}

type Tokenized = VariantFile & { tokens: Token[] }
type TrieNode = { members: Tokenized[], terminal: number, children: Map<string, TrieNode> }

const kindRank = (mimeType: string) => mimeType.startsWith('image/') ? 0 : mimeType.startsWith('video/') ? 1 : 2

// Deterministic whatever the sync order: a thumbnail first, then an image
// before a video before anything else, then the largest, then the name.
export function chooseCover(members: VariantFile[], override?: string): string {
	if (override && members.some((member) => member.id === override)) return override
	return [...members].sort((a, b) =>
		Number(b.hasThumbnail) - Number(a.hasThumbnail)
		|| kindRank(a.mimeType) - kindRank(b.mimeType)
		|| (b.width ?? 0) * (b.height ?? 0) - (a.width ?? 0) * (a.height ?? 0)
		|| (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
		|| (a.id < b.id ? -1 : 1))[0].id
}

const extensionOf = (name: string) => {
	const dot = name.lastIndexOf('.')
	return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

// What differs after the shared prefix, one column per position; a column
// where every member says the same thing is not an axis. Members with fewer
// tokens get ''. When only the extension differs, it is the axis.
function buildColumns(members: Tokenized[], depth: number): { columns: string[][], values: Map<string, string[]> } {
	const width = Math.max(0, ...members.map((member) => member.tokens.length - depth))
	let columns: string[][] = []
	for (let index = 0; index < width; index++) {
		const column = members.map((member) => member.tokens[depth + index]?.text.replace(/^#/, '') ?? '')
		if (new Set(column).size > 1) columns.push(column)
	}
	if (!columns.length) {
		const extensions = members.map((member) => extensionOf(member.name))
		if (new Set(extensions).size > 1) columns = [extensions]
	}
	const values = new Map(members.map((member, row) => [member.id, columns.map((column) => column[row])]))
	return { columns: columns.map((column) => [...new Set(column)].sort()), values }
}

function makeGroup(folderId: string, assetTypeId: string, prefixKey: string, prefix: Token[], members: Tokenized[], depth: number, overrides: VariantOverrides): ComputedGroup {
	const { columns, values } = buildColumns(members, depth)
	const sorted = [...members].sort((a, b) => (a.name < b.name ? -1 : 1))
	const cover = [...overrides.covers.entries()].filter(([fileId]) => members.some((member) => member.id === fileId)).map(([fileId]) => fileId).pop()
	return {
		folderId,
		assetTypeId,
		prefixKey,
		displayName: prefix.map((token) => token.original).join(' ') || sorted[0].name.replace(/\.[^.]+$/, ''),
		coverFileId: chooseCover(members, cover),
		members: sorted.map((member) => ({ fileId: member.id, axisValues: values.get(member.id)! })),
		columns,
		examples: sorted.slice(0, 2).map((member) => member.name),
	}
}

const commonPrefix = (members: Tokenized[]) => {
	let depth = 0
	while (members.every((member) => member.tokens[depth] && member.tokens[depth].text === members[0].tokens[depth].text)) depth++
	return depth
}

// Files of one folder and one asset type. A trie of their tokens is walked
// from each first token down while every branch keeps at least two files;
// where a branch would leave a file alone, the node is the group. So
// banner_1x1 and banner_9x16_en stay one "banner" group, while
// pampa_campaign_* and pampa_teaser_* become two. Branches that are values
// of a recognised axis (1x1 and 9x16, en and fr) never split a group, or a
// complete grid of formats and languages would become one group per format.
export function groupFolder(files: VariantFile[], settings: { minPrefixLength: number, blocked: Set<string> }, overrides: VariantOverrides): ComputedGroup[] {
	const groups: ComputedGroup[] = []
	const tokenized: Tokenized[] = []
	for (const file of files) {
		if (overrides.excluded.has(file.id)) continue
		const tokens = tokenizeFileName(file.name, file.spans, settings.blocked)
		if (tokens) tokenized.push({ ...file, tokens })
	}
	if (!tokenized.length) return groups
	const { folderId, assetTypeId } = tokenized[0]
	const forcedIds = new Set<string>()
	for (const forced of overrides.forced) {
		const members = tokenized.filter((file) => forced.fileIds.includes(file.id) && !forcedIds.has(file.id))
		if (members.length < 2) continue
		members.forEach((member) => forcedIds.add(member.id))
		const depth = commonPrefix(members)
		groups.push(makeGroup(folderId, assetTypeId, `override:${forced.id}`, members[0].tokens.slice(0, depth), members, depth, overrides))
	}
	const root: TrieNode = { members: [], terminal: 0, children: new Map() }
	for (const file of tokenized.filter((file) => !forcedIds.has(file.id))) {
		let node = root
		for (const token of file.tokens) {
			let child = node.children.get(token.text)
			if (!child) {
				child = { members: [], terminal: 0, children: new Map() }
				node.children.set(token.text, child)
			}
			child.members.push(file)
			node = child
		}
		node.terminal++
	}
	const visit = (node: TrieNode, depth: number) => {
		if (node.members.length < 2) return
		const splits = node.children.size > 0 && node.terminal === 0 && [...node.children.values()].every((child) => child.members.length >= 2)
			&& recognizeAxis([...node.children.keys()].map((token) => token.replace(/^#/, ''))) === null
		if (splits) {
			for (const child of node.children.values()) visit(child, depth + 1)
			return
		}
		const prefix = node.members[0].tokens.slice(0, depth)
		const length = prefix.map((token) => token.text.replace(/^#/, '')).join('').length
		if (length < settings.minPrefixLength || prefix.every((token) => token.opaque)) return
		groups.push(makeGroup(folderId, assetTypeId, prefix.map((token) => token.text).join(' '), prefix, node.members, depth, overrides))
	}
	for (const child of root.children.values()) visit(child, 1)
	return groups
}

export type VariantStageResult = { groups: number, groupsAdded: number, groupsRemoved: number, membersWritten: number, axesCreated: number, axesRemoved: number }

// Group ids stay stable across passes (upsert on folder, type and prefix);
// members, covers and axes are written only where they change.
export async function runVariantStage(em: EntityManager): Promise<VariantStageResult> {
	const result: VariantStageResult = { groups: 0, groupsAdded: 0, groupsRemoved: 0, membersWritten: 0, axesCreated: 0, axesRemoved: 0 }
	const [settings] = await em.query('SELECT min_prefix_length, blocked_tokens FROM variant_grouping_settings WHERE id = 1')
	const files: Omit<VariantFile, 'spans'>[] = await em.query(`
		SELECT a.id, a.name, a.folder_id AS "folderId", a.asset_type_id AS "assetTypeId", a.has_thumbnail AS "hasThumbnail", a.mime_type AS "mimeType", a.width, a.height
		FROM asset_files a INNER JOIN asset_types t ON t.id = a.asset_type_id
		WHERE t.group_variants AND a.status <> 'pending_deletion'
	`)
	const resolutions: { asset_file_id: string, candidates: ResolutionCandidate[] }[] = files.length
		? await em.query('SELECT asset_file_id, candidates FROM asset_file_resolutions WHERE asset_file_id = ANY($1)', [files.map((file) => file.id)])
		: []
	const spans = new Map(resolutions.map((row) => [row.asset_file_id, row.candidates.filter((candidate) => candidate.consumedSpan).map((candidate) => candidate.consumedSpan!)]))
	const overrideRows: { id: string, kind: string, asset_file_ids: string[] }[] = await em.query('SELECT id, kind, asset_file_ids FROM variant_group_overrides ORDER BY created_at, id')
	const overrides: VariantOverrides = {
		excluded: new Set(overrideRows.filter((row) => row.kind === 'exclude').flatMap((row) => row.asset_file_ids)),
		forced: overrideRows.filter((row) => row.kind === 'force_group').map((row) => ({ id: row.id, fileIds: row.asset_file_ids })),
		covers: new Map(overrideRows.filter((row) => row.kind === 'cover').map((row) => [row.asset_file_ids[0], row.id])),
	}
	const byFolder = new Map<string, VariantFile[]>()
	for (const file of files) {
		const key = `${file.folderId}|${file.assetTypeId}`
		byFolder.set(key, [...(byFolder.get(key) ?? []), { ...file, spans: spans.get(file.id) ?? [] }])
	}
	const computed: ComputedGroup[] = []
	for (const key of [...byFolder.keys()].sort()) {
		computed.push(...groupFolder(byFolder.get(key)!, { minPrefixLength: settings.min_prefix_length, blocked: new Set(settings.blocked_tokens) }, overrides))
	}
	result.groups = computed.length

	const existing: { id: string, asset_folder_id: string, asset_type_id: string, prefix_key: string, display_name: string, cover_asset_file_id: string | null, member_count: number }[] = await em.query(
		'SELECT id, asset_folder_id, asset_type_id, prefix_key, display_name, cover_asset_file_id, member_count FROM variant_groups')
	const groupKey = (folderId: string, assetTypeId: string, prefixKey: string) => JSON.stringify([folderId, assetTypeId, prefixKey])
	const existingByKey = new Map(existing.map((group) => [groupKey(group.asset_folder_id, group.asset_type_id, group.prefix_key), group]))
	const ids = new Map<ComputedGroup, string>()
	for (const group of computed) {
		const current = existingByKey.get(groupKey(group.folderId, group.assetTypeId, group.prefixKey))
		if (!current) {
			const [inserted] = await em.query(`
				INSERT INTO variant_groups (asset_folder_id, asset_type_id, prefix_key, display_name, cover_asset_file_id, member_count)
				VALUES ($1, $2, $3, $4, $5, $6) RETURNING id
			`, [group.folderId, group.assetTypeId, group.prefixKey, group.displayName, group.coverFileId, group.members.length])
			ids.set(group, inserted.id)
			result.groupsAdded++
			continue
		}
		ids.set(group, current.id)
		if (current.display_name !== group.displayName || current.cover_asset_file_id !== group.coverFileId || current.member_count !== group.members.length) {
			await em.query('UPDATE variant_groups SET display_name = $2, cover_asset_file_id = $3, member_count = $4, updated_at = now() WHERE id = $1', [current.id, group.displayName, group.coverFileId, group.members.length])
		}
	}
	const kept = new Set(ids.values())
	const removed = existing.filter((group) => !kept.has(group.id)).map((group) => group.id)
	if (removed.length) await em.query('DELETE FROM variant_groups WHERE id = ANY($1)', [removed])
	result.groupsRemoved = removed.length

	const members: { asset_file_id: string, variant_group_id: string, axis_values: string[] }[] = await em.query('SELECT asset_file_id, variant_group_id, axis_values FROM variant_group_members')
	const currentMembers = new Map(members.map((member) => [member.asset_file_id, member]))
	const wanted = new Map<string, { groupId: string, axisValues: string[] }>()
	for (const group of computed) for (const member of group.members) wanted.set(member.fileId, { groupId: ids.get(group)!, axisValues: member.axisValues })
	const stale = members.filter((member) => !wanted.has(member.asset_file_id)).map((member) => member.asset_file_id)
	if (stale.length) await em.query('DELETE FROM variant_group_members WHERE asset_file_id = ANY($1)', [stale])
	const writes = [...wanted.entries()].filter(([fileId, member]) => {
		const current = currentMembers.get(fileId)
		return !current || current.variant_group_id !== member.groupId || JSON.stringify(current.axis_values) !== JSON.stringify(member.axisValues)
	})
	if (writes.length) {
		await em.query(`
			INSERT INTO variant_group_members (asset_file_id, variant_group_id, axis_values)
			SELECT id, group_id, coalesce((SELECT array_agg(value) FROM jsonb_array_elements_text(axis_values::jsonb) AS value), '{}')
			FROM unnest($1::uuid[], $2::uuid[], $3::text[]) AS v(id, group_id, axis_values)
			ON CONFLICT (asset_file_id) DO UPDATE SET variant_group_id = EXCLUDED.variant_group_id, axis_values = EXCLUDED.axis_values
		`, [writes.map(([fileId]) => fileId), writes.map(([, member]) => member.groupId), writes.map(([, member]) => JSON.stringify(member.axisValues))])
	}
	result.membersWritten = writes.length

	const axes: (AxisCandidate & { name: string | null, ignored: boolean })[] = (await em.query('SELECT id, "values", created_at, name, ignored FROM variant_axes'))
		.map((axis: { id: string, values: string[], created_at: Date, name: string | null, ignored: boolean }) => ({ id: axis.id, values: axis.values, createdAt: axis.created_at, name: axis.name, ignored: axis.ignored }))
	const groupAxes: { variant_group_id: string, position: number, variant_axis_id: string }[] = await em.query('SELECT variant_group_id, position, variant_axis_id FROM variant_group_axes')
	for (const group of computed) {
		const groupId = ids.get(group)!
		const desired: string[] = []
		for (const column of group.columns) {
			let axis = attachToExistingAxis(column, axes)
			if (!axis) {
				const recognizer = recognizeAxis(column)
				const values = column.filter((value) => value !== '')
				const [created] = await em.query(`
					INSERT INTO variant_axes (name, "values", recognizer, example_file_names) VALUES ($1, $2, $3, $4) RETURNING id, created_at
				`, [recognizer ? RECOGNIZER_NAMES[recognizer] : null, values, recognizer, group.examples])
				axis = { id: created.id, values, createdAt: created.created_at }
				axes.push({ ...axis, name: recognizer ? RECOGNIZER_NAMES[recognizer] : null, ignored: false })
				result.axesCreated++
			}
			desired.push(axis.id)
		}
		const current = groupAxes.filter((row) => row.variant_group_id === groupId).sort((a, b) => a.position - b.position).map((row) => row.variant_axis_id)
		if (JSON.stringify(current) !== JSON.stringify(desired)) {
			await em.query('DELETE FROM variant_group_axes WHERE variant_group_id = $1', [groupId])
			if (desired.length) {
				await em.query(`
					INSERT INTO variant_group_axes (variant_group_id, position, variant_axis_id)
					SELECT $1, position - 1, axis FROM unnest($2::uuid[]) WITH ORDINALITY AS v(axis, position)
				`, [groupId, desired])
			}
		}
	}
	const [, orphans] = await em.query(`
		DELETE FROM variant_axes a WHERE a.name IS NULL AND NOT a.ignored
		AND NOT EXISTS (SELECT 1 FROM variant_group_axes ga WHERE ga.variant_axis_id = a.id)
	`)
	result.axesRemoved = orphans
	return result
}

const STATUS_RANK = ['up_to_date', 'creating', 'outdated', 'pending_deletion']

export type VariantGroupSummary = { id: string, displayName: string, memberCount: number, status: string, coverFileId: string | null }

// The group of each file on a page, counted over the members this user can
// see. The status is the worst of theirs, computed now, never stored.
export async function loadVariantGroups(user: User, assetFileIds: string[]): Promise<Map<string, VariantGroupSummary>> {
	const byFile = new Map<string, VariantGroupSummary>()
	if (!assetFileIds.length) return byFile
	const rows: { asset_file_id: string, variant_group_id: string, display_name: string, cover_asset_file_id: string | null }[] = await dataSource.query(`
		SELECT m.asset_file_id, m.variant_group_id, g.display_name, g.cover_asset_file_id
		FROM variant_group_members m INNER JOIN variant_groups g ON g.id = m.variant_group_id WHERE m.asset_file_id = ANY($1)
	`, [assetFileIds])
	if (!rows.length) return byFile
	const visible = await userCollectionFilesQuery(user)
		.innerJoin('variant_group_members', 'member', 'member.asset_file_id = asset_file.id')
		.andWhere('member.variant_group_id IN (:...groupIds)', { groupIds: [...new Set(rows.map((row) => row.variant_group_id))] })
		.select('member.variant_group_id', 'group_id')
		.addSelect('COUNT(DISTINCT asset_file.id)', 'members')
		.addSelect('array_agg(DISTINCT asset_file.status)', 'statuses')
		.groupBy('member.variant_group_id')
		.getRawMany<{ group_id: string, members: string, statuses: string[] | string }>()
	const counts = new Map(visible.map((row) => {
		const statuses = Array.isArray(row.statuses) ? row.statuses : String(row.statuses).replace(/[{}]/g, '').split(',')
		return [row.group_id, { members: parseInt(row.members, 10), status: statuses.sort((a, b) => STATUS_RANK.indexOf(b) - STATUS_RANK.indexOf(a))[0] }]
	}))
	for (const row of rows) {
		const count = counts.get(row.variant_group_id)
		if (!count || count.members < 2) continue
		byFile.set(row.asset_file_id, { id: row.variant_group_id, displayName: row.display_name, memberCount: count.members, status: count.status, coverFileId: row.cover_asset_file_id })
	}
	return byFile
}
