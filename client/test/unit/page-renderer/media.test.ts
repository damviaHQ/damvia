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
import { embedSrc, imageHeightOf, resolveMedia } from '@/components/page-renderer/media'

const assets = {
  uploads: { 'blocks/page/one': 'https://files.test/one' },
  files: { 'file-1': { name: 'photo.png', mimeType: 'image/png', thumbnailURL: 'https://files.test/thumb', fileURL: 'https://files.test/full' } },
  collections: {},
  pages: {},
} as any

describe('block media', () => {
  test('an uploaded picture resolves to the address the server signed', () => {
    expect(resolveMedia({ source: 'upload', s3key: 'blocks/page/one' }, assets))
      .toEqual({ url: 'https://files.test/one', thumbnailURL: 'https://files.test/one', displayURL: 'https://files.test/one', name: '' })
  })

  test('a library file resolves to its original and its thumbnail', () => {
    expect(resolveMedia({ source: 'file', fileId: 'file-1' }, assets))
      .toEqual({
        url: 'https://files.test/full', thumbnailURL: 'https://files.test/thumb',
        displayURL: 'https://files.test/thumb', name: 'photo.png',
      })
  })

  // A library original can weigh tens of megabytes; a page shows the rendition
  // the DAM already made, and only falls back when there is none.
  test('a picture is displayed from the rendition, not from the original', () => {
    const noThumbnail = { ...assets, files: { 'file-2': { name: 'raw.tif', mimeType: 'image/tiff', thumbnailURL: null, fileURL: 'https://files.test/raw' } } }
    expect(resolveMedia({ source: 'file', fileId: 'file-2' }, noThumbnail as any)?.displayURL).toBe('https://files.test/raw')
  })

  test('a picture height is a number of pixels, whatever the page stored', () => {
    expect(imageHeightOf(512)).toBe(512)
    expect(imageHeightOf(undefined)).toBe(420)
    expect(imageHeightOf('medium')).toBe(420)
    expect(imageHeightOf('small')).toBe(220)
    expect(imageHeightOf('original')).toBe(2400)
    expect(imageHeightOf(10)).toBe(80)
    expect(imageHeightOf(9000)).toBe(2400)
  })

  // A reader who cannot open the file gets no address for it at all.
  test('a reference the reader cannot reach resolves to nothing', () => {
    expect(resolveMedia({ source: 'file', fileId: 'hidden' }, assets)).toBeNull()
    expect(resolveMedia({ source: 'upload', s3key: 'blocks/page/gone' }, assets)).toBeNull()
    expect(resolveMedia(null, assets)).toBeNull()
    expect(resolveMedia({ source: 'file', fileId: 'file-1' }, undefined)).toBeNull()
  })

  test('embedded videos are played from the provider, never from a pasted address', () => {
    expect(embedSrc({ source: 'embed', provider: 'youtube', videoId: 'abc123' } as any))
      .toBe('https://www.youtube-nocookie.com/embed/abc123')
    expect(embedSrc({ source: 'embed', provider: 'vimeo', videoId: '123456789' } as any))
      .toBe('https://player.vimeo.com/video/123456789')
    expect(embedSrc({ source: 'upload', s3key: 'blocks/page/one' })).toBeNull()
  })
})
