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
// These tests lock the Google Drive sync behaviour, kept identical in spirit to the
// OneDrive one. See docs/integrations/google-drive.md, section "Guarantees the tests lock".
// Change an expectation here only for a confirmed critical bug or a security
// hazard, and say which one in the commit message; never to make a refactor pass.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { planDriveFiles, FOLDER_MIME } = require('../dist/asset-updater/google-drive-items')

const ROOT = { id: 'root', name: 'Marketing' }
const folder = (id, name, parent) => ({ id, name, mimeType: FOLDER_MIME, parents: [parent] })
const file = (id, name, parent, extra = {}) => ({ id, name, mimeType: 'image/jpeg', parents: [parent], size: '10', md5Checksum: 'md5-' + id, ...extra })
const listing = [
    file('photo', 'photo.jpg', 'nested'),
    folder('nested', 'Nested', 'top'),
    folder('top', 'Top', ROOT.id),
    folder('empty', 'Empty', ROOT.id),
    folder('hidden', '.cache', ROOT.id),
    file('in-hidden', 'x.bin', 'hidden'),
    file('zero', 'zero.txt', 'top', { size: '0', mimeType: 'text/plain' }),
    file('gdoc', 'Brief', 'top', { mimeType: 'application/vnd.google-apps.document', size: undefined }),
    file('shortcut', 'Link', 'top', { mimeType: 'application/vnd.google-apps.shortcut', size: undefined }),
    file('trashed', 'old.jpg', 'top', { trashed: true }),
    file('svg', 'logo.svg', ROOT.id, { mimeType: '', size: '20' }),
    file('stray', 'stray.jpg', 'not-listed'),
]

test('the pointed folder is the only top-level row; hidden, empty, native, trashed, zero-size and stray items are skipped', () => {
    const plan = planDriveFiles(listing, ROOT)
    assert.deepEqual(plan.folders, [
        { externalId: 'root', parentExternalId: '', name: 'Marketing' },
        { externalId: 'top', parentExternalId: 'root', name: 'Top' },
        { externalId: 'nested', parentExternalId: 'top', name: 'Nested' },
    ])
    assert.deepEqual(plan.files.map(f => [f.externalId, f.folderExternalId]), [['photo', 'nested'], ['svg', 'root']])
    assert.equal(plan.skipped, 8)
})

test('files keep md5Checksum, size becomes a number and MIME falls back to the extension', () => {
    const [photo, svg] = planDriveFiles(listing, ROOT).files
    assert.deepEqual(photo, { externalId: 'photo', externalChecksum: 'md5-photo', folderExternalId: 'nested', name: 'photo.jpg', size: 10, mimeType: 'image/jpeg' })
    assert.equal(svg.mimeType, 'image/svg+xml')
    assert.equal(svg.size, 20)
})

test('a parent loop never hangs and its items are skipped', () => {
    const plan = planDriveFiles([folder('a', 'A', 'b'), folder('b', 'B', 'a'), file('f', 'f.jpg', 'a')], ROOT)
    assert.deepEqual(plan, { folders: [], files: [], skipped: 4 })
})

test('a pointed folder with nothing downloadable yields an empty plan', () => {
    assert.deepEqual(planDriveFiles([folder('e', 'Empty', ROOT.id)], ROOT), { folders: [], files: [], skipped: 2 })
    assert.deepEqual(planDriveFiles([], ROOT), { folders: [], files: [], skipped: 1 })
})
