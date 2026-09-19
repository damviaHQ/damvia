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
import { formatFileSize, formatStorage } from '@/utils/fileSize.ts'

describe('file sizes', () => {
  test('formatFileSize rounds to whole binary units', () => {
    expect(formatFileSize(0)).toBe('0 B')
    expect(formatFileSize(1023)).toBe('1023 B')
    expect(formatFileSize(1024)).toBe('1 KB')
    expect(formatFileSize(1536)).toBe('2 KB')
    expect(formatFileSize(1024 ** 2)).toBe('1 MB')
    expect(formatFileSize(1024 ** 3)).toBe('1 GB')
    expect(formatFileSize(5 * 1024 ** 4)).toBe('5120 GB')
  })

  test('formatStorage uses decimal units with one decimal above bytes', () => {
    expect(formatStorage(0)).toBe('0 B')
    expect(formatStorage(999)).toBe('999 B')
    expect(formatStorage(1000)).toBe('1.0 KB')
    expect(formatStorage(1536)).toBe('1.5 KB')
    expect(formatStorage(1.5e12)).toBe('1.5 TB')
    expect(formatStorage(1e18)).toBe('1000.0 PB')
  })

  test('the two formatters disagree at binary boundaries on purpose', () => {
    expect(formatFileSize(1024)).toBe('1 KB')
    expect(formatStorage(1024)).toBe('1.0 KB')
    expect(formatFileSize(1000)).toBe('1000 B')
  })
})
