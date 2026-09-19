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
// Parses ASSET_SOURCES, or the single-provider variables it replaces, into a
// validated list of sources and refuses configurations whose sweeps would
// fight over the same items.

export type OneDriveAccount = { provider: 'onedrive', tenantId: string, clientId: string, clientSecret: string, user: string }
export type DropboxAccount = { provider: 'dropbox', appKey: string, appSecret: string, refreshToken: string, useTeamRoot?: boolean }
export type GoogleDriveAccount = { provider: 'googledrive', serviceAccount: string, impersonate?: string }
export type AssetAccount = OneDriveAccount | DropboxAccount | GoogleDriveAccount

export type AssetSourceConfig = {
	key: string
	label?: string
	root: string
	account: AssetAccount
}

export const SOURCE_KEY_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/

const ACCOUNT_FIELDS: Record<AssetAccount['provider'], string[]> = {
	onedrive: ['tenantId', 'clientId', 'clientSecret', 'user'],
	dropbox: ['appKey', 'appSecret', 'refreshToken'],
	googledrive: ['serviceAccount'],
}

function fail(message: string): never {
	throw new Error(`ASSET_SOURCES: ${message}`)
}

function requireString(object: Record<string, unknown>, field: string, where: string): string {
	const value = object[field]
	if (typeof value !== 'string' || value.trim() === '') fail(`${where} needs a non-empty "${field}"`)
	return value.trim()
}

// Same credentials under two account names are still one account.
export function accountIdentity(account: AssetAccount): string {
	switch (account.provider) {
		case 'onedrive': return `onedrive:${account.tenantId}:${account.user.toLowerCase()}`
		case 'dropbox': return `dropbox:${account.refreshToken}`
		case 'googledrive': return `googledrive:${account.serviceAccount}:${account.impersonate ?? ''}`
	}
}

// Roots become a comparable path when the provider expresses them as one:
// '' is the whole account, '/a/b' a subtree. Opaque ids (Google Drive folder
// ids, OneDrive item addresses) are only compared for equality.
export function normalizeRoot(provider: AssetAccount['provider'], root: string): string {
	const trimmed = root.trim()
	if (provider === 'googledrive') return `#${trimmed}`
	if (provider === 'onedrive') {
		if (trimmed === 'root') return ''
		const match = trimmed.match(/^root:(\/.*):$/)
		if (!match) return `#${trimmed}`
		return match[1].replace(/\/+$/, '').toLowerCase()
	}
	const path = trimmed.replace(/\/+$/, '').toLowerCase()
	return path === '' ? '' : (path.startsWith('/') ? path : `/${path}`)
}

export function rootsOverlap(a: string, b: string): boolean {
	if (a === b) return true
	if (a.startsWith('#') || b.startsWith('#')) return false
	if (a === '' || b === '') return true
	return a.startsWith(`${b}/`) || b.startsWith(`${a}/`)
}

export function parseAssetSources(encoded: string): AssetSourceConfig[] {
	const raw = encoded.trim().startsWith('{') ? encoded : Buffer.from(encoded, 'base64').toString('utf-8')
	let parsed: any
	try {
		parsed = JSON.parse(raw)
	} catch {
		fail('must be a JSON object, raw or base64')
	}
	if (!parsed || typeof parsed !== 'object' || !parsed.accounts || typeof parsed.accounts !== 'object' || !Array.isArray(parsed.sources)) {
		fail('must be an object with "accounts" and a "sources" array')
	}

	const accounts = new Map<string, AssetAccount>()
	for (const [name, value] of Object.entries<any>(parsed.accounts)) {
		if (!value || typeof value !== 'object') fail(`account "${name}" must be an object`)
		const provider = value.provider
		if (!(provider in ACCOUNT_FIELDS)) fail(`account "${name}" has an unknown provider "${provider}", use dropbox, onedrive or googledrive`)
		const account: Record<string, unknown> = { provider }
		for (const field of ACCOUNT_FIELDS[provider as AssetAccount['provider']]) account[field] = requireString(value, field, `account "${name}"`)
		if (provider === 'dropbox') account.useTeamRoot = value.useTeamRoot === true
		if (provider === 'googledrive' && typeof value.impersonate === 'string' && value.impersonate.trim()) account.impersonate = value.impersonate.trim()
		accounts.set(name, account as AssetAccount)
	}

	if (parsed.sources.length === 0) fail('needs at least one source')
	const sources: AssetSourceConfig[] = []
	for (const value of parsed.sources) {
		if (!value || typeof value !== 'object') fail('every source must be an object')
		const key = requireString(value, 'key', 'a source')
		if (!SOURCE_KEY_PATTERN.test(key)) fail(`source key "${key}" must be 1 to 40 lowercase letters, digits or dashes and start with a letter or digit`)
		if (sources.some((source) => source.key === key)) fail(`source key "${key}" is used twice`)
		const accountName = requireString(value, 'account', `source "${key}"`)
		const account = accounts.get(accountName)
		if (!account) fail(`source "${key}" refers to an unknown account "${accountName}"`)
		const root = typeof value.root === 'string' ? value.root.trim() : ''
		if (root === '' && account.provider !== 'dropbox') fail(`source "${key}" needs a "root"`)
		const label = typeof value.label === 'string' && value.label.trim() ? value.label.trim() : undefined
		if (label !== undefined && sources.some((source) => source.label === label)) fail(`label "${label}" is used twice`)
		sources.push({ key, label, root, account })
	}

	for (let i = 0; i < sources.length; i++) {
		for (let j = i + 1; j < sources.length; j++) {
			const a = sources[i], b = sources[j]
			if (accountIdentity(a.account) !== accountIdentity(b.account)) continue
			if (rootsOverlap(normalizeRoot(a.account.provider, a.root), normalizeRoot(b.account.provider, b.root))) {
				fail(`sources "${a.key}" and "${b.key}" point at the same account and their roots overlap (${a.root || '/'} and ${b.root || '/'}); one root must not contain the other`)
			}
		}
	}
	return sources
}

// The single-provider variables describe exactly one source whose key is the
// provider name, which is what the startup adoption stamps on existing rows.
export function legacyAssetSource(env: NodeJS.ProcessEnv, requireEnv: (name: string) => string): AssetSourceConfig {
	switch (env.ASSET_UPDATER) {
		case 'dropbox':
			return {
				key: 'dropbox',
				root: env.DROPBOX_ROOT_PATH ?? '',
				account: {
					provider: 'dropbox',
					appKey: requireEnv('DROPBOX_APP_KEY'),
					appSecret: requireEnv('DROPBOX_APP_SECRET'),
					refreshToken: requireEnv('DROPBOX_REFRESH_TOKEN'),
					useTeamRoot: env.DROPBOX_USE_TEAM_ROOT === 'true',
				},
			}
		case 'onedrive':
			return {
				key: 'onedrive',
				root: requireEnv('ONEDRIVE_DRIVE'),
				account: {
					provider: 'onedrive',
					tenantId: requireEnv('ONEDRIVE_TENANT_ID'),
					clientId: requireEnv('ONEDRIVE_CLIENT_ID'),
					clientSecret: requireEnv('ONEDRIVE_CLIENT_SECRET'),
					user: requireEnv('ONEDRIVE_USER'),
				},
			}
		case 'googledrive':
			return {
				key: 'googledrive',
				root: requireEnv('GOOGLE_DRIVE_FOLDER_ID'),
				account: {
					provider: 'googledrive',
					serviceAccount: requireEnv('GOOGLE_DRIVE_SERVICE_ACCOUNT'),
					impersonate: env.GOOGLE_DRIVE_IMPERSONATE || undefined,
				},
			}
		default:
			throw new Error('Provide ASSET_SOURCES or a valid ASSET_UPDATER')
	}
}
