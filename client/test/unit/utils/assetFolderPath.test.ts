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
import { pathSegments, resolveAssetFolderPath, type AssetFolderNode } from '@/utils/assetFolderPath'

const folder = (id: string, name: string, children?: AssetFolderNode[]): AssetFolderNode => ({ id, name, children })
const root = folder('root', 'Brand', [
  folder('ss26', 'SS26', [
    folder('sellout', 'SELL-OUT', [
      folder('videos', 'PRODUCT VIDEOS', [
        folder('pampa', 'PAMPA FAMILY', [folder('916', '9_16'), folder('169', '16_9')]),
      ]),
    ]),
  ]),
  folder('fw25', 'FW25'),
])
const target = 'SS26/SELL-OUT/PRODUCT VIDEOS/PAMPA FAMILY/9_16'

describe('asset folder path', () => {
  test('pasted variants resolve to the same folder', () => {
    for (const input of [
      target,
      `/${target}`,
      `${target}/`,
      `'${target}'`,
      `"/${target}/"`,
      `  ${target}  `,
      target.replace(/\//g, '\\'),
      target.toLowerCase(),
      `Brand/${target}`,
      `/Team/Marketing/Brand/${target}`,
      `https://www.dropbox.com/home/Brand/${target.replace(/ /g, '%20')}`,
      `SS26//SELL-OUT/ PRODUCT VIDEOS /PAMPA FAMILY/9_16`,
    ]) {
      expect(resolveAssetFolderPath(root, input), input).toEqual({ folder: expect.objectContaining({ id: '916' }), missing: [] })
    }
  })

  test('an unknown tail stops at the deepest folder found', () => {
    expect(resolveAssetFolderPath(root, 'SS26/SELL-OUT/PHOTOS/9_16')).toEqual({ folder: expect.objectContaining({ id: 'sellout' }), missing: ['PHOTOS', '9_16'] })
  })

  test('the source name alone is the source root', () => {
    expect(resolveAssetFolderPath(root, '/Brand/')).toEqual({ folder: root, missing: [] })
  })

  test('an empty path resolves to nothing', () => {
    expect(resolveAssetFolderPath(root, ' / ')).toBeNull()
    expect(pathSegments('""')).toEqual([])
  })
})
