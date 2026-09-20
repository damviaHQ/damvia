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
import { defaultCollectionBlocks } from '@/components/page-editor/blockLibrary'
import { parseBlockData } from 'server/src/page-blocks/schema'
import { describe, expect, test } from 'vitest'

// A collection with no page of its own opens the editor on these, so what the
// author first sees is the listing readers already get.
describe('defaultCollectionBlocks', () => {
  test('is the default listing, unsaved', () => {
    const blocks = defaultCollectionBlocks()
    expect(blocks.map((block) => [block.type, block.size])).toEqual([
      ['collections', 'full'],
      ['files', 'full'],
    ])
    expect(blocks.every((block) => block.id === undefined)).toBe(true)
  })

  test('carries payloads the server accepts', () => {
    for (const block of defaultCollectionBlocks()) {
      expect(() => parseBlockData(block.type, block.data)).not.toThrow()
    }
  })
})
