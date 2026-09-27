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
import { fileTypeOf, isExcel, isFontFile, isPdf, isPowerPoint, isPsd, isTextFile, isVectorFile, isVideoFile, isWord } from '@/utils/fileType'

const file = (name: string, mimeType = 'application/octet-stream') => ({ name, mimeType })

describe('file type predicates', () => {
  test.each([
    ['pdf', isPdf, 'brief.pdf', 'application/pdf'],
    ['psd', isPsd, 'layers.psd', 'image/vnd.adobe.photoshop'],
    ['vector', isVectorFile, 'logo.eps', 'application/illustrator'],
    ['text', isTextFile, 'notes.yaml', 'text/markdown'],
    ['font', isFontFile, 'brand.otf', 'application/vnd.ms-fontobject'],
    ['video', isVideoFile, 'clip.m4v', 'video/quicktime'],
    ['powerpoint', isPowerPoint, 'deck.ppsx', 'application/vnd.ms-powerpoint'],
    ['word', isWord, 'letter.odt', 'application/rtf'],
    ['excel', isExcel, 'data.csv', 'application/vnd.oasis.opendocument.spreadsheet'],
  ] as const)('%s matches by extension, by mime type and case-insensitively', (_, predicate, name, mimeType) => {
    expect(predicate(file(name))).toBe(true)
    expect(predicate(file('unknown.bin', mimeType))).toBe(true)
    expect(predicate(file(name.toUpperCase()))).toBe(true)
    expect(predicate(file('unknown.bin'))).toBe(false)
  })

  test('predicates do not overlap on common files', () => {
    const predicates = [isPdf, isPsd, isVectorFile, isTextFile, isFontFile, isVideoFile, isPowerPoint, isWord, isExcel]
    for (const sample of [file('photo.jpg', 'image/jpeg'), file('brief.pdf', 'application/pdf'), file('clip.mp4', 'video/mp4'), file('data.xlsx')]) {
      expect(predicates.filter(predicate => predicate(sample)).length).toBeLessThanOrEqual(1)
    }
  })

  test('a file falls in one search bucket, read from its mime type alone', () => {
    expect(fileTypeOf({ mimeType: 'image/jpeg' })).toBe('image')
    expect(fileTypeOf({ mimeType: 'IMAGE/PNG' })).toBe('image')
    expect(fileTypeOf({ mimeType: 'video/quicktime' })).toBe('video')
    expect(fileTypeOf({ mimeType: 'application/mp4' })).toBe('video')
    for (const mimeType of ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-powerpoint']) {
      expect(fileTypeOf({ mimeType })).toBe('document')
    }
    expect(fileTypeOf({ mimeType: 'application/zip' })).toBe('other')
    expect(fileTypeOf({ mimeType: 'text/plain' })).toBe('other')
    expect(fileTypeOf({ mimeType: null })).toBe('other')
    expect(fileTypeOf({})).toBe('other')
  })
})
