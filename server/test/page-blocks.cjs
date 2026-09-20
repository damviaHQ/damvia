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
const schema = require('../dist/page-blocks/schema')
const { sanitizeBlockHtml } = require('../dist/page-blocks/sanitize')

const PAGE_ID = '11111111-1111-4111-8111-111111111111'
const FILE_ID = '22222222-2222-4222-8222-222222222222'
const uploadKey = `blocks/${PAGE_ID}/33333333-3333-4333-8333-333333333333`

test('every block type has an empty payload its own schema accepts', () => {
    for (const type of schema.BLOCK_TYPES) {
        const data = schema.emptyBlockData(type)
        assert.doesNotThrow(() => schema.parseBlockData(type, data), `${type} rejects its own empty data`)
    }
})

test('media references only accept upload keys inside a page folder', () => {
    assert.doesNotThrow(() => schema.parseBlockData('image', { media: { source: 'upload', s3key: uploadKey } }))
    for (const s3key of ['settings/client-logo.webp', 'asset-file/123', `blocks/${PAGE_ID}/tmp/abc`, '../../etc/passwd']) {
        assert.throws(() => schema.parseBlockData('image', { media: { source: 'upload', s3key } }), `${s3key} was accepted`)
    }
    assert.doesNotThrow(() => schema.parseBlockData('image', { media: { source: 'file', fileId: FILE_ID } }))
    assert.throws(() => schema.parseBlockData('image', { media: { source: 'file', fileId: 'not-a-uuid' } }))
})

test('links reject anything that is not http, https or a known target', () => {
    assert.doesNotThrow(() => schema.parseBlockData('image', { link: { kind: 'url', url: 'https://example.com' } }))
    for (const url of ['javascript:alert(1)', 'data:text/html,<script>', 'file:///etc/passwd', 'not a url']) {
        assert.throws(() => schema.parseBlockData('image', { link: { kind: 'url', url } }), `${url} was accepted`)
    }
    assert.doesNotThrow(() => schema.parseBlockData('hero', { title: 'Hi', button: { label: 'Go', link: { kind: 'collection', collectionId: FILE_ID } } }))
})

test('a picture height is a number of pixels, and the old words still read', () => {
    assert.equal(schema.parseBlockData('image', {}).height, schema.DEFAULT_IMAGE_HEIGHT)
    assert.equal(schema.parseBlockData('image', { height: 512 }).height, 512)
    assert.equal(schema.parseBlockData('image', { height: 'small' }).height, 220)
    assert.equal(schema.parseBlockData('image', { height: 'original' }).height, schema.MAX_IMAGE_HEIGHT)
    assert.equal(schema.parseBlockData('image', { height: 'whatever' }).height, schema.DEFAULT_IMAGE_HEIGHT)
    for (const height of [0, 10, 9000, 42.5]) {
        assert.throws(() => schema.parseBlockData('image', { height }), `${height} was accepted`)
    }
})

test('a block cannot be saved with another block type payload', () => {
    assert.throws(() => schema.parseBlockData('collections', { collectionsId: ['not-a-uuid'] }))
    assert.throws(() => schema.parseBlockData('video', { media: { source: 'embed', provider: 'dailymotion', videoId: 'abcdef' } }))
})

test('references are collected for asset resolution and garbage collection', () => {
    assert.deepEqual(schema.uploadKeysOf({ media: { source: 'upload', s3key: uploadKey } }), [uploadKey])
    assert.deepEqual(schema.uploadKeysOf({ media: { source: 'file', fileId: FILE_ID } }), [])
    assert.deepEqual(schema.fileIdsOf({ media: { source: 'file', fileId: FILE_ID } }), [FILE_ID])
    assert.deepEqual(schema.collectionIdsOf({ collectionsId: [FILE_ID], link: { kind: 'collection', collectionId: PAGE_ID } }), [FILE_ID, PAGE_ID])
    assert.deepEqual(schema.pageIdsOf({ button: { label: 'Go', link: { kind: 'page', pageId: PAGE_ID } } }), [PAGE_ID])
})

test('video links are recognised for the known providers only', () => {
    assert.deepEqual(schema.parseEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), { provider: 'youtube', videoId: 'dQw4w9WgXcQ' })
    assert.deepEqual(schema.parseEmbedUrl('https://youtu.be/dQw4w9WgXcQ'), { provider: 'youtube', videoId: 'dQw4w9WgXcQ' })
    assert.deepEqual(schema.parseEmbedUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ'), { provider: 'youtube', videoId: 'dQw4w9WgXcQ' })
    assert.deepEqual(schema.parseEmbedUrl('https://vimeo.com/123456789'), { provider: 'vimeo', videoId: '123456789' })
    assert.deepEqual(schema.parseEmbedUrl('https://player.vimeo.com/video/123456789'), { provider: 'vimeo', videoId: '123456789' })
    for (const url of ['https://example.com/watch?v=abc', 'javascript:alert(1)', 'https://youtube.com/watch?v=<script>']) {
        assert.equal(schema.parseEmbedUrl(url), null, `${url} was accepted`)
    }
})

test('block text keeps its structure and loses everything that can execute', () => {
    assert.equal(sanitizeBlockHtml('<p>Hello <strong>world</strong></p>'), '<p>Hello <strong>world</strong></p>')
    assert.equal(sanitizeBlockHtml('<script>alert(1)</script><p>Safe</p>'), '<p>Safe</p>')
    assert.equal(sanitizeBlockHtml('<img src=x onerror=alert(1)>'), '')
    assert.equal(sanitizeBlockHtml('<p style="color:red" class="ql-align-center">Plain</p>'), '<p>Plain</p>')
    assert.equal(sanitizeBlockHtml('<a href="javascript:alert(1)">Bad</a>'), '<a rel="noopener noreferrer">Bad</a>')
    assert.equal(
        sanitizeBlockHtml('<a href="https://example.com" target="_blank">Good</a>'),
        '<a href="https://example.com" target="_blank" rel="noopener noreferrer">Good</a>'
    )
    assert.equal(sanitizeBlockHtml(''), '')
    assert.equal(sanitizeBlockHtml(null), '')
})
