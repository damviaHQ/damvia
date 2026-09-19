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
import { describe, expect, test } from 'vitest'
import { BLOCK_SIZES, BLOCK_TYPES, emptyBlockData, parseEmbedUrl, parseBlockData } from 'server/src/page-blocks/schema'

// The editor validates block data with the very schemas the server enforces,
// so this guards the runtime import through the "server" file: dependency.
describe('shared block schema', () => {
  test('every block type has an empty payload the schema accepts', () => {
    for (const type of BLOCK_TYPES) {
      expect(() => emptyBlockData(type)).not.toThrow()
    }
    expect(BLOCK_SIZES).toEqual(['full', 'half', 'third'])
  })

  test('block data is parsed the same way as on the server', () => {
    expect(parseBlockData('text', { html: '<p>Hi</p>' })).toEqual({ html: '<p>Hi</p>' })
    expect(() => parseBlockData('image', { media: { source: 'upload', s3key: 'settings/client-logo.webp' } })).toThrow()
    expect(parseEmbedUrl('https://youtu.be/dQw4w9WgXcQ')).toEqual({ provider: 'youtube', videoId: 'dQw4w9WgXcQ' })
  })
})
