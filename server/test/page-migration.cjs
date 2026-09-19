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
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const harness = require('./lib/helpers.cjs')
const { db } = harness

before(() => harness.setup())
after(() => harness.teardown())

const legacyBlock = (pageId, type, row, column, data) => db.query(
    `INSERT INTO page_blocks (id, page_id, type, "column", row, width, data) VALUES ($1, $2, $3, $4, $5, 1, $6)`,
    [randomUUID(), pageId, type, column, row, data]
)

// Existing installations must come through the rewrite with their pages intact:
// reading order is preserved and the old grid becomes block widths.
test('the layout migration converts existing pages without losing content', async () => {
    await db.undoLastMigration()

    const pageId = randomUUID()
    await db.query(`INSERT INTO pages (id, name) VALUES ($1, 'Legacy')`, [pageId])
    const s3key = `blocks/${pageId}/${randomUUID()}`
    await legacyBlock(pageId, 'text', 0, 0, JSON.stringify('<p>Hello</p>'))
    await legacyBlock(pageId, 'image', 1, 0, JSON.stringify({ s3key, url: 'https://example.com', external: true }))
    await legacyBlock(pageId, 'collections', 1, 1, JSON.stringify({ title: 'Brands', layout: 'grid' }))
    await legacyBlock(pageId, 'files', 2, 0, null)
    await legacyBlock(pageId, 'files', 2, 1, JSON.stringify({ title: 'A' }))
    await legacyBlock(pageId, 'files', 2, 2, JSON.stringify({ title: 'B' }))
    await legacyBlock(pageId, 'video', 3, 0, JSON.stringify({ s3key, url: 'https://ignored.example' }))
    await legacyBlock(pageId, 'last_files', 3, 1, JSON.stringify({}))
    await legacyBlock(pageId, 'last_files', 3, 2, JSON.stringify({}))
    await legacyBlock(pageId, 'last_files', 3, 3, JSON.stringify({}))

    await db.runMigrations()

    const blocks = await db.query('SELECT type, position, size, data FROM page_blocks WHERE page_id = $1 ORDER BY position', [pageId])
    assert.deepEqual(blocks.map(block => [block.type, block.position, block.size]), [
        ['text', 0, 'full'],
        ['image', 1, 'half'],
        ['collections', 2, 'half'],
        ['files', 3, 'third'],
        ['files', 4, 'third'],
        ['files', 5, 'third'],
        // Four blocks never shared a line usefully, so each takes the width.
        ['video', 6, 'full'],
        ['last_files', 7, 'full'],
        ['last_files', 8, 'full'],
        ['last_files', 9, 'full'],
    ])

    assert.deepEqual(blocks[0].data, { html: '<p>Hello</p>' })
    assert.deepEqual(blocks[1].data, {
        media: { source: 'upload', s3key },
        alt: '',
        caption: '',
        link: { kind: 'url', url: 'https://example.com', external: true },
    })
    assert.deepEqual(blocks[2].data, { title: 'Brands', layout: 'grid' })
    assert.deepEqual(blocks[3].data, {})
    assert.deepEqual(blocks[6].data, { media: { source: 'upload', s3key } })
})

test('the converted payloads are what the block schemas accept', async () => {
    const { parseBlockData } = require('../dist/page-blocks/schema')
    const blocks = await db.query('SELECT type, data FROM page_blocks')
    for (const block of blocks) {
        assert.doesNotThrow(() => parseBlockData(block.type, block.data), `${block.type} did not survive the migration`)
    }
})

test('the migration can be undone and replayed, as an upgrade that is rolled back would', async () => {
    const pageId = randomUUID()
    await db.query(`INSERT INTO pages (id, name) VALUES ($1, 'Rollback')`, [pageId])
    await db.query(
        `INSERT INTO page_blocks (id, page_id, type, position, size, data) VALUES ($1, $2, 'text', 0, 'half', $3)`,
        [randomUUID(), pageId, JSON.stringify({ html: '<p>Keep me</p>' })]
    )

    await db.undoLastMigration()
    const legacy = await db.query('SELECT type, row, "column", width, data FROM page_blocks WHERE page_id = $1', [pageId])
    assert.equal(legacy.length, 1)
    assert.equal(legacy[0].row, 0)
    assert.equal(JSON.parse(legacy[0].data), '<p>Keep me</p>')

    await db.runMigrations()
    const [block] = await db.query('SELECT position, size, data FROM page_blocks WHERE page_id = $1', [pageId])
    assert.equal(block.position, 0)
    // Widths cannot survive a schema that has no room for them.
    assert.equal(block.size, 'full')
    assert.deepEqual(block.data, { html: '<p>Keep me</p>' })
})
