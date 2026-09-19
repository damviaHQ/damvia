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
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { planDriveItems } = require('../dist/asset-updater/one-drive-items')

const ROOT = 'root-id'
const ref = (id, path) => ({ driveId: 'drive', id, path })
const page = [
    { id: ROOT, name: 'root', root: {}, folder: { childCount: 3 }, size: 900, parentReference: { driveId: 'drive' } },
    { id: 'nested', name: 'Nested', folder: { childCount: 1 }, size: 100, parentReference: ref('top', '/drive/root:/Top') },
    { id: 'top', name: 'Top', folder: { childCount: 2 }, size: 800, parentReference: ref(ROOT, '/drive/root:') },
    { id: 'empty', name: 'Empty', folder: { childCount: 0 }, size: 0, parentReference: ref(ROOT, '/drive/root:') },
    { id: 'zero', name: 'zero.txt', file: { mimeType: 'text/plain' }, size: 0, eTag: 'e', cTag: 'c', parentReference: ref('top', '/drive/root:/Top') },
    { id: 'dot', name: '.hidden.jpg', file: { mimeType: 'image/jpeg' }, size: 5, parentReference: ref('top', '/drive/root:/Top') },
    { id: 'notebook', name: 'Notes', package: { type: 'oneNote' }, size: 5, parentReference: ref(ROOT, '/drive/root:') },
    { id: 'gone', name: 'gone.jpg', file: { mimeType: 'image/jpeg' }, deleted: { state: 'deleted' }, size: 5, parentReference: ref('top', '/drive/root:/Top') },
    { id: 'photo', name: 'photo.jpg', file: { mimeType: 'image/jpeg' }, size: 10, eTag: '"etag-1"', cTag: '"ctag-1"', parentReference: ref('nested', '/drive/root:/Top/Nested') },
    { id: 'logo', name: 'logo.svg', file: {}, size: 20, eTag: '"etag-2"', parentReference: ref(ROOT, '/drive/root:') },
    { id: 'blob', name: 'blob', file: {}, size: 30, parentReference: ref(ROOT, '/drive/root:') },
]

test('the root item, deleted, dot, empty and non-file items are skipped', () => {
    const plan = planDriveItems(page, ROOT)
    assert.equal(plan.skipped, 5)
    assert.deepEqual(plan.folders.map(f => f.externalId), ['top', 'empty', 'nested'])
    assert.deepEqual(plan.files.map(f => f.externalId), ['photo', 'logo', 'blob'])
})

test('children of the root become top-level and parents are ordered before children', () => {
    const plan = planDriveItems(page, ROOT)
    const top = plan.folders.find(f => f.externalId === 'top')
    const nested = plan.folders.find(f => f.externalId === 'nested')
    assert.deepEqual(top, { externalId: 'top', parentExternalId: '', name: 'Top' })
    assert.equal(nested.parentExternalId, 'top')
    assert.ok(plan.folders.indexOf(top) < plan.folders.indexOf(nested))
    assert.equal(plan.files.find(f => f.externalId === 'logo').folderExternalId, '')
})

test('files use cTag first and fall back to eTag, and MIME falls back to the extension', () => {
    const plan = planDriveItems(page, ROOT)
    const [photo, logo, blob] = plan.files
    assert.deepEqual(photo, {
        externalId: 'photo', externalChecksum: '"ctag-1"', folderExternalId: 'nested',
        name: 'photo.jpg', size: 10, mimeType: 'image/jpeg',
    })
    assert.equal(logo.externalChecksum, '"etag-2"')
    assert.equal(logo.mimeType, 'image/svg+xml')
    assert.equal(blob.externalChecksum, '')
    assert.equal(blob.mimeType, 'application/octet-stream')
})

test('an empty page yields an empty plan', () => {
    assert.deepEqual(planDriveItems([], ROOT), { folders: [], files: [], skipped: 0 })
    assert.deepEqual(planDriveItems([page[0]], ROOT), { folders: [], files: [], skipped: 1 })
})
