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
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const ts = require('../client/node_modules/typescript')
const source = readFileSync(new URL('../client/src/utils/activityMap.ts', import.meta.url), 'utf8')
const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }).outputText
const { locateRegions, clusterLocations } = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`)
const geography = JSON.parse(readFileSync(new URL('../client/src/assets/maps/world.json', import.meta.url), 'utf8'))
const activity = (name, count = 3) => ({ name, activeUsers: count, downloads: count * 2, views: count * 4 })

test('countries resolve by codes and localized exact names while custom labels stay unmapped', () => {
  const rows = ['France', 'FR', 'États-Unis', 'UK', 'Deutschland', 'APAC', 'Client team France', 'Unknown'].map(name => activity(name))
  const { mapped, unmapped } = locateRegions(rows, geography)
  assert.equal(mapped.find(row => row.id === 'FR').activeUsers, 6)
  assert.equal(mapped.find(row => row.id === 'US').activeUsers, 3)
  assert.equal(mapped.find(row => row.id === 'GB').activeUsers, 3)
  assert.equal(mapped.find(row => row.id === 'DE').activeUsers, 3)
  assert.equal(mapped.find(row => row.name === 'Asia Pacific').kind, 'region')
  assert.deepEqual(unmapped.map(row => row.name), ['Client team France', 'Unknown'])
  for (const metric of ['activeUsers', 'downloads', 'views']) assert.equal([...mapped, ...unmapped].reduce((sum, row) => sum + row[metric], 0), rows.reduce((sum, row) => sum + row[metric], 0))
})

test('ambiguous aliases do not silently place activity in the wrong country', () => {
  const countries = [{code:'A',name:'First',aliases:['Same'],point:[10,10],path:''},{code:'B',name:'Second',aliases:['Same'],point:[20,20],path:''}]
  assert.equal(locateRegions([activity('Same')], countries).unmapped.length, 1)
})

test('nearby activity clusters split when zoomed, preserve totals and never mutate source locations', () => {
  const mapped = locateRegions([activity('France', 5), activity('Germany', 7), activity('Japan', 11)], geography).mapped
  const before = structuredClone(mapped)
  const world = clusterLocations(mapped, 'activeUsers', 1, 800)
  const zoomed = clusterLocations(mapped, 'activeUsers', 8, 800)
  assert.equal(world.length, 2)
  assert.equal(zoomed.length, 3)
  assert.equal(world.reduce((sum, item) => sum + item.value, 0), 23)
  assert.equal(clusterLocations(mapped, 'downloads', 1, 800).reduce((sum, item) => sum + item.value, 0), 46)
  assert.deepEqual(mapped, before)
  assert.deepEqual(clusterLocations(locateRegions([activity('France', 0)], geography).mapped, 'views', 1, 800), [])
})

test('the bundled map has valid local paths and supports tiny countries without inventing outlines', () => {
  assert(geography.length > 190)
  assert.equal(new Set(geography.map(row => row.code)).size, geography.length)
  for (const row of geography) {
    assert(row.point.every(Number.isFinite))
    assert(row.point[0] >= 0 && row.point[0] <= 1000)
    assert(row.point[1] >= 0 && row.point[1] <= 448)
    assert(!/NaN|Infinity|<|>/.test(row.path))
  }
  assert(locateRegions([activity('Singapore')], geography).mapped.length === 1)
  assert.deepEqual(locateRegions([], geography), { mapped: [], unmapped: [] })
})
