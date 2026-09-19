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
// These tests lock the ASSET_SOURCES rules: permanent keys, unique labels,
// and the refusal of two sources whose sweeps would fight over the same items.
// Change an expectation here only for a confirmed critical bug or a security
// hazard, and say which one in the commit message; never to make a refactor pass.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { parseAssetSources, legacyAssetSource, normalizeRoot, rootsOverlap } = require('../dist/asset-updater/sources')

const onedrive = { provider: 'onedrive', tenantId: 't', clientId: 'c', clientSecret: 's', user: 'Marketing@Contoso.com' }
const dropbox = { provider: 'dropbox', appKey: 'k', appSecret: 's', refreshToken: 'r' }
const google = { provider: 'googledrive', serviceAccount: '{"client_email":"x","private_key":"y"}' }
const config = (sources, accounts = { contoso: onedrive, agency: dropbox, studio: { ...dropbox, refreshToken: 'r2' }, workspace: google }) => JSON.stringify({ accounts, sources })

test('a valid configuration yields one source per entry, raw or base64, with trimmed keys and optional labels', () => {
    const raw = config([
        { key: 'marketing', label: ' Marketing ', account: 'contoso', root: 'root:/Marketing/Assets:' },
        { key: 'press', account: 'agency', root: '/Press' },
        { key: 'whole-dropbox', account: 'studio', root: '' },
        { key: 'video', account: 'workspace', root: '1AbC' },
    ])
    for (const encoded of [raw, Buffer.from(raw).toString('base64')]) {
        const sources = parseAssetSources(encoded)
        assert.deepEqual(sources.map(s => [s.key, s.label, s.root, s.account.provider]), [
            ['marketing', 'Marketing', 'root:/Marketing/Assets:', 'onedrive'],
            ['press', undefined, '/Press', 'dropbox'],
            ['whole-dropbox', undefined, '', 'dropbox'],
            ['video', undefined, '1AbC', 'googledrive'],
        ])
        assert.equal(sources[1].account.useTeamRoot, false)
    }
})

test('malformed configurations are refused with a message naming the problem', () => {
    const cases = [
        ['not json', /JSON object/],
        ['{"sources":[]}', /"accounts" and a "sources" array/],
        [config([]), /at least one source/],
        [config([{ key: 'Bad Key', account: 'contoso', root: 'root' }]), /source key "Bad Key"/],
        [config([{ key: 'a', account: 'contoso', root: 'root' }, { key: 'a', account: 'agency' }]), /used twice/],
        [config([{ key: 'a', account: 'nowhere', root: 'root' }]), /unknown account "nowhere"/],
        [config([{ key: 'a', account: 'contoso' }]), /needs a "root"/],
        [config([{ key: 'a', account: 'workspace' }]), /needs a "root"/],
        [config([{ key: 'a', account: 'contoso', root: 'root', label: 'X' }, { key: 'b', account: 'agency', label: 'X' }]), /label "X" is used twice/],
        [config([{ key: 'a', account: 'x', root: 'root' }], { x: { provider: 'box' } }), /unknown provider "box"/],
        [config([{ key: 'a', account: 'x', root: 'root' }], { x: { provider: 'onedrive', tenantId: 't' } }), /needs a non-empty "clientId"/],
    ]
    for (const [encoded, expected] of cases) assert.throws(() => parseAssetSources(encoded), expected)
})

test('two sources on the same account are refused when one root contains the other', () => {
    const overlapping = [
        [{ key: 'a', account: 'contoso', root: 'root' }, { key: 'b', account: 'contoso', root: 'root:/Marketing:' }],
        [{ key: 'a', account: 'contoso', root: 'root:/Marketing:' }, { key: 'b', account: 'contoso', root: 'root:/marketing/assets/:' }],
        [{ key: 'a', account: 'contoso', root: 'root:/Marketing:' }, { key: 'b', account: 'contoso', root: 'root:/Marketing:' }],
        [{ key: 'a', account: 'agency', root: '' }, { key: 'b', account: 'agency', root: '/Press' }],
        [{ key: 'a', account: 'agency', root: '/Press' }, { key: 'b', account: 'agency', root: 'press/2026/' }],
        [{ key: 'a', account: 'workspace', root: '1AbC' }, { key: 'b', account: 'workspace', root: '1AbC' }],
    ]
    for (const sources of overlapping) assert.throws(() => parseAssetSources(config(sources)), /roots overlap/)
    // The same credentials under two account names are still one account.
    assert.throws(() => parseAssetSources(config(
        [{ key: 'a', account: 'one', root: 'root' }, { key: 'b', account: 'two', root: 'root:/X:' }],
        { one: onedrive, two: { ...onedrive, user: 'marketing@contoso.com' } },
    )), /roots overlap/)
})

test('disjoint roots on one account, and any roots on different accounts, are accepted', () => {
    const accepted = [
        [{ key: 'a', account: 'contoso', root: 'root:/Marketing:' }, { key: 'b', account: 'contoso', root: 'root:/Marketing 2:' }],
        [{ key: 'a', account: 'agency', root: '/Press' }, { key: 'b', account: 'agency', root: '/Pressroom' }],
        [{ key: 'a', account: 'workspace', root: '1AbC' }, { key: 'b', account: 'workspace', root: '2DeF' }],
        [{ key: 'a', account: 'contoso', root: 'root' }, { key: 'b', account: 'agency', root: '' }, { key: 'c', account: 'workspace', root: '1AbC' }],
    ]
    for (const sources of accepted) assert.equal(parseAssetSources(config(sources)).length, sources.length)
    assert.equal(normalizeRoot('onedrive', 'root:/Marketing/Assets/:'), '/marketing/assets')
    assert.equal(normalizeRoot('onedrive', 'items/01ABC'), '#items/01ABC')
    assert.equal(normalizeRoot('dropbox', 'Marketing/'), '/marketing')
    assert.equal(rootsOverlap('#x', ''), false)
})

test('without ASSET_SOURCES the single-provider variables describe one source keyed by the provider name', () => {
    const requireEnv = (name) => name.toLowerCase()
    assert.deepEqual(legacyAssetSource({ ASSET_UPDATER: 'onedrive' }, requireEnv), {
        key: 'onedrive', root: 'onedrive_drive',
        account: { provider: 'onedrive', tenantId: 'onedrive_tenant_id', clientId: 'onedrive_client_id', clientSecret: 'onedrive_client_secret', user: 'onedrive_user' },
    })
    assert.deepEqual(legacyAssetSource({ ASSET_UPDATER: 'dropbox', DROPBOX_USE_TEAM_ROOT: 'true' }, requireEnv), {
        key: 'dropbox', root: '',
        account: { provider: 'dropbox', appKey: 'dropbox_app_key', appSecret: 'dropbox_app_secret', refreshToken: 'dropbox_refresh_token', useTeamRoot: true },
    })
    assert.equal(legacyAssetSource({ ASSET_UPDATER: 'googledrive', GOOGLE_DRIVE_IMPERSONATE: 'me@x' }, requireEnv).account.impersonate, 'me@x')
    assert.throws(() => legacyAssetSource({}, requireEnv), /ASSET_SOURCES or a valid ASSET_UPDATER/)
})
