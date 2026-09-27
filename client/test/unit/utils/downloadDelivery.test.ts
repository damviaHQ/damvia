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
import { downloadSummary } from '@/utils/downloadDelivery'

const file = (size: number, mimeType = 'application/pdf') => ({ size, mimeType })
const images = (count: number) => Array.from({ length: count }, () => file(1, 'image/png'))

describe('downloadSummary', () => {
  test('direct download stops at exactly 1 GB of combined files', () => {
    expect(downloadSummary([file(999_999_999)]).directAllowed).toBe(true)
    expect(downloadSummary([file(1_000_000_000)]).directAllowed).toBe(true)
    expect(downloadSummary([file(1_000_000_001)]).directAllowed).toBe(false)
    expect(downloadSummary([file(600_000_000), file(400_000_001)]).directAllowed).toBe(false)
  })

  test('sizes sent as strings are added as numbers', () => {
    expect(downloadSummary([{ size: '600000000', mimeType: 'video/mp4' }, { size: '500000000', mimeType: 'video/mp4' }]).bytes).toBe(1_100_000_000)
  })

  test('more than 300 images go by email and keep their original format', () => {
    expect(downloadSummary(images(300))).toMatchObject({ directAllowed: true, conversionAllowed: true })
    expect(downloadSummary(images(301))).toMatchObject({ directAllowed: false, conversionAllowed: false })
  })

  test('10 GB and above cannot be downloaded at all', () => {
    expect(downloadSummary([file(9_999_999_999)]).tooLarge).toBe(false)
    expect(downloadSummary([file(10_000_000_000)]).tooLarge).toBe(true)
  })
})
