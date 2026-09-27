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
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, test } from 'vitest'

// The phone interface shares logic with the desktop one, never its screens:
// each side can change its layout without breaking the other.
const src = join(__dirname, '../../src')
const files = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name)
  return statSync(path).isDirectory() ? files(path) : /\.(vue|ts)$/.test(name) ? [path] : []
})
const imports = (path: string) => [...readFileSync(path, 'utf8').matchAll(/from\s+["']([^"']+)["']|import\(["']([^"']+)["']\)/g)].map((match) => match[1] ?? match[2])
const SHARED = [/^@\/(composables|utils|stores|services)\//, /^@\/components\/ui\//, /^@\/components\/page-renderer\/(PageRenderer\.vue|filesRenderer)/, /^@\/components\/(ClientLogo|Loader)\.vue$/, /^@\/components\/layout-main\/MainNavigation\.vue$/]

describe('mobile boundary', () => {
  test('phone screens import shared logic and primitives only', () => {
    const offending = files(join(src, 'mobile')).flatMap((path) => imports(path)
      .filter((spec) => spec.startsWith('@/') && !SHARED.some((pattern) => pattern.test(spec)))
      .map((spec) => `${relative(src, path)} -> ${spec}`))
    expect(offending).toEqual([])
  })

  test('desktop code never imports phone screens, except the router and layout switch', () => {
    const allowed = ['router/index.ts', 'layouts/LayoutRouter.vue']
    const offending = files(src)
      .filter((path) => !relative(src, path).startsWith('mobile/') && !allowed.includes(relative(src, path)))
      .flatMap((path) => imports(path).filter((spec) => spec.startsWith('@/mobile/')).map((spec) => `${relative(src, path)} -> ${spec}`))
    expect(offending).toEqual([])
  })
})
