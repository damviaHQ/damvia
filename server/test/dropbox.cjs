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
// These tests lock the Dropbox sync behaviour, kept identical in spirit to the
// OneDrive one. See docs/integrations/dropbox.md, section "Guarantees the tests lock".
// Change an expectation here only for a confirmed critical bug or a security
// hazard, and say which one in the commit message; never to make a refactor pass.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { planDropboxEntries, WHOLE_DROPBOX_ROOT } = require('../dist/asset-updater/dropbox-entries')

const folder = (id, p) => ({ '.tag': 'folder', id, name: p.split('/').pop(), path_lower: p.toLowerCase(), path_display: p })
const file = (id, p, size = 10, hash = 'h') => ({ '.tag': 'file', id, name: p.split('/').pop(), path_lower: p.toLowerCase(), path_display: p, size, content_hash: hash })
const listing = [
    file('f-nested', '/Marketing/Nested/photo.JPG', 10, 'hash-1'),
    folder('d-nested', '/Marketing/Nested'),
    folder('d-empty', '/Marketing/Empty'),
    folder('d-marketing', '/Marketing'),
    file('f-zero', '/Marketing/zero.txt', 0),
    folder('d-hidden', '/Marketing/.git'),
    file('f-hidden', '/Marketing/.git/config', 5),
    file('f-svg', '/Marketing/logo.svg', 20, 'hash-2'),
    { '.tag': 'deleted', name: 'gone.jpg', path_lower: '/marketing/gone.jpg' },
    { '.tag': 'file', id: 'f-nameless', path_lower: '/marketing/nameless', size: 4 },
    file('f-top', '/top.png', 3),
]

test('whole Dropbox: a synthetic "Dropbox" root is the only top-level row; empty, hidden, zero-byte and deleted entries are skipped', () => {
    const plan = planDropboxEntries(listing, WHOLE_DROPBOX_ROOT)
    assert.deepEqual(plan.folders, [
        { externalId: 'dropbox-root', parentExternalId: '', name: 'Dropbox' },
        { externalId: 'd-marketing', parentExternalId: 'dropbox-root', name: 'Marketing' },
        { externalId: 'd-nested', parentExternalId: 'd-marketing', name: 'Nested' },
    ])
    assert.deepEqual(plan.files.map(f => [f.externalId, f.folderExternalId]), [['f-nested', 'd-nested'], ['f-svg', 'd-marketing'], ['f-top', 'dropbox-root']])
    assert.equal(plan.skipped, 6)
})

test('a DROPBOX_ROOT_PATH folder is the single top-level row and its children hang under it', () => {
    const plan = planDropboxEntries(listing.filter(e => e.path_lower.startsWith('/marketing/')), { id: 'd-marketing', name: 'Marketing', path_lower: '/marketing' })
    assert.deepEqual(plan.folders.map(f => [f.externalId, f.parentExternalId]), [['d-marketing', ''], ['d-nested', 'd-marketing']])
    assert.equal(plan.files.find(f => f.externalId === 'f-svg').folderExternalId, 'd-marketing')
})

test('files keep content_hash as checksum, MIME comes from the extension, parents come before children', () => {
    const plan = planDropboxEntries(listing, WHOLE_DROPBOX_ROOT)
    const [nested, svg] = plan.files
    assert.deepEqual(nested, { externalId: 'f-nested', externalChecksum: 'hash-1', folderExternalId: 'd-nested', name: 'photo.JPG', size: 10, mimeType: 'image/jpeg' })
    assert.equal(svg.mimeType, 'image/svg+xml')
    assert.ok(plan.folders.findIndex(f => f.externalId === 'd-marketing') < plan.folders.findIndex(f => f.externalId === 'd-nested'))
})

test('a pointed folder with nothing in it yields an empty plan', () => {
    assert.deepEqual(planDropboxEntries([folder('d-e', '/Marketing/Empty')], { id: 'd-marketing', name: 'Marketing', path_lower: '/marketing' }), { folders: [], files: [], skipped: 2 })
    assert.deepEqual(planDropboxEntries([], WHOLE_DROPBOX_ROOT), { folders: [], files: [], skipped: 1 })
})
