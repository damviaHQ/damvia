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
// These tests lock the OneDrive sync behaviour that production depends on.
// See docs/integrations/onedrive.md, section "Guarantees the tests lock".
// Change an expectation here only for a confirmed critical bug or a security
// hazard, and say which one in the commit message; never to make a refactor pass.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { planDriveItems } = require('../dist/asset-updater/one-drive-items')

const ROOT = 'root-id'
const ref = (id) => ({ driveId: 'drive', id })
const page = [
    { id: ROOT, name: 'root', root: {}, folder: { childCount: 3 }, size: 900, parentReference: { driveId: 'drive' } },
    { id: 'nested', name: 'Nested', folder: { childCount: 1 }, size: 100, parentReference: ref('top') },
    { id: 'top', name: 'Top', folder: { childCount: 2 }, size: 800, parentReference: ref(ROOT) },
    { id: 'empty', name: 'Empty', folder: { childCount: 0 }, size: 0, parentReference: ref(ROOT) },
    { id: 'zero', name: 'zero.txt', file: { mimeType: 'text/plain' }, size: 0, eTag: 'e', cTag: 'c', parentReference: ref('top') },
    { id: 'dot', name: '.hidden.jpg', file: { mimeType: 'image/jpeg' }, size: 5, parentReference: ref('top') },
    { id: 'notebook', name: 'Notes', package: { type: 'oneNote' }, size: 5, parentReference: ref(ROOT) },
    { id: 'gone', name: 'gone.jpg', file: { mimeType: 'image/jpeg' }, deleted: { state: 'deleted' }, size: 5, parentReference: ref('top') },
    { id: 'photo', name: 'photo.jpg', file: { mimeType: 'image/jpeg' }, size: 10, eTag: '"etag-1"', cTag: '"ctag-1"', parentReference: ref('nested') },
    { id: 'logo', name: 'logo.svg', file: {}, size: 20, eTag: '"etag-2"', parentReference: ref(ROOT) },
    { id: 'blob', name: 'blob', file: {}, size: 30, parentReference: ref(ROOT) },
]

test('deleted, dot, size-0 and non-file items are skipped; the root is kept as in production', () => {
    const plan = planDriveItems(page)
    assert.equal(plan.skipped, 5)
    assert.deepEqual(plan.folders.map(f => f.externalId), [ROOT, 'top', 'nested'])
    assert.deepEqual(plan.files.map(f => f.externalId), ['photo', 'logo', 'blob'])
})

test('the root has no parent, its children keep the root id and parents come before children', () => {
    const plan = planDriveItems(page)
    const root = plan.folders.find(f => f.externalId === ROOT)
    const top = plan.folders.find(f => f.externalId === 'top')
    const nested = plan.folders.find(f => f.externalId === 'nested')
    assert.deepEqual(root, { externalId: ROOT, parentExternalId: '', name: 'root' })
    assert.deepEqual(top, { externalId: 'top', parentExternalId: ROOT, name: 'Top' })
    assert.equal(nested.parentExternalId, 'top')
    assert.ok(plan.folders.indexOf(root) < plan.folders.indexOf(top))
    assert.ok(plan.folders.indexOf(top) < plan.folders.indexOf(nested))
    assert.equal(plan.files.find(f => f.externalId === 'logo').folderExternalId, ROOT)
})

test('files keep eTag as checksum and MIME falls back to the extension', () => {
    const plan = planDriveItems(page)
    const [photo, logo, blob] = plan.files
    assert.deepEqual(photo, {
        externalId: 'photo', externalChecksum: '"etag-1"', folderExternalId: 'nested',
        name: 'photo.jpg', size: 10, mimeType: 'image/jpeg',
    })
    assert.equal(logo.externalChecksum, '"etag-2"')
    assert.equal(logo.mimeType, 'image/svg+xml')
    assert.equal(blob.externalChecksum, '')
    assert.equal(blob.mimeType, 'application/octet-stream')
})

test('a folder listed before its grandparent still sorts after it without a path', () => {
    const plan = planDriveItems([
        { id: 'c', name: 'C', folder: {}, size: 1, parentReference: ref('b') },
        { id: 'b', name: 'B', folder: {}, size: 1, parentReference: ref('a') },
        { id: 'a', name: 'A', folder: {}, size: 1, parentReference: ref(ROOT) },
        { id: ROOT, name: 'root', root: {}, folder: {}, size: 1, parentReference: { driveId: 'drive' } },
    ])
    assert.deepEqual(plan.folders.map(f => f.externalId), [ROOT, 'a', 'b', 'c'])
})

test('a subtree listing keeps the named folder as top item with its unknown drive-root parent id', () => {
    const plan = planDriveItems([
        { id: 'child', name: 'Child', folder: {}, size: 1, parentReference: ref('marketing') },
        { id: 'marketing', name: 'Marketing', folder: {}, size: 1, parentReference: ref('drive-root-not-listed') },
    ])
    assert.deepEqual(plan.folders, [
        { externalId: 'marketing', parentExternalId: 'drive-root-not-listed', name: 'Marketing' },
        { externalId: 'child', parentExternalId: 'marketing', name: 'Child' },
    ])
})

test('an empty page yields an empty plan', () => {
    assert.deepEqual(planDriveItems([]), { folders: [], files: [], skipped: 0 })
})
