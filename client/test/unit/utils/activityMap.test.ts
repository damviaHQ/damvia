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
import geography from '@/assets/maps/world.json'
import { clusterLocations, locateRegions, type Geography } from '@/utils/activityMap.ts'

const world = geography as Geography[]
const activity = (name: string, count = 3) => ({ name, activeUsers: count, downloads: count * 2, views: count * 4 })

describe('activity map', () => {
  test('countries resolve by codes and localized exact names while custom labels stay unmapped', () => {
    const rows = ['France', 'FR', 'États-Unis', 'UK', 'Deutschland', 'APAC', 'Client team France', 'Unknown'].map(name => activity(name))
    const { mapped, unmapped } = locateRegions(rows, world)
    expect(mapped.find(row => row.id === 'FR')?.activeUsers).toBe(6)
    expect(mapped.find(row => row.id === 'US')?.activeUsers).toBe(3)
    expect(mapped.find(row => row.id === 'GB')?.activeUsers).toBe(3)
    expect(mapped.find(row => row.id === 'DE')?.activeUsers).toBe(3)
    expect(mapped.find(row => row.name === 'Asia Pacific')?.kind).toBe('region')
    expect(unmapped.map(row => row.name)).toEqual(['Client team France', 'Unknown'])
    for (const metric of ['activeUsers', 'downloads', 'views'] as const) {
      expect([...mapped, ...unmapped].reduce((sum, row) => sum + row[metric], 0)).toBe(rows.reduce((sum, row) => sum + row[metric], 0))
    }
  })

  test('ambiguous aliases do not silently place activity in the wrong country', () => {
    const countries: Geography[] = [{ code: 'A', name: 'First', aliases: ['Same'], point: [10, 10], path: '' }, { code: 'B', name: 'Second', aliases: ['Same'], point: [20, 20], path: '' }]
    expect(locateRegions([activity('Same')], countries).unmapped).toHaveLength(1)
  })

  test('nearby activity clusters split when zoomed, preserve totals and never mutate source locations', () => {
    const mapped = locateRegions([activity('France', 5), activity('Germany', 7), activity('Japan', 11)], world).mapped
    const before = structuredClone(mapped)
    const zoomedOut = clusterLocations(mapped, 'activeUsers', 1, 800)
    const zoomedIn = clusterLocations(mapped, 'activeUsers', 8, 800)
    expect(zoomedOut).toHaveLength(2)
    expect(zoomedIn).toHaveLength(3)
    expect(zoomedOut.reduce((sum, item) => sum + item.value, 0)).toBe(23)
    expect(clusterLocations(mapped, 'downloads', 1, 800).reduce((sum, item) => sum + item.value, 0)).toBe(46)
    expect(mapped).toEqual(before)
    expect(clusterLocations(locateRegions([activity('France', 0)], world).mapped, 'views', 1, 800)).toEqual([])
  })

  test('the bundled map has valid local paths and supports tiny countries without inventing outlines', () => {
    expect(world.length).toBeGreaterThan(190)
    expect(new Set(world.map(row => row.code)).size).toBe(world.length)
    for (const row of world) {
      expect(row.point.every(Number.isFinite)).toBe(true)
      expect(row.point[0]).toBeGreaterThanOrEqual(0)
      expect(row.point[0]).toBeLessThanOrEqual(1000)
      expect(row.point[1]).toBeGreaterThanOrEqual(0)
      expect(row.point[1]).toBeLessThanOrEqual(448)
      expect(/NaN|Infinity|<|>/.test(row.path)).toBe(false)
    }
    expect(locateRegions([activity('Singapore')], world).mapped).toHaveLength(1)
    expect(locateRegions([], world)).toEqual({ mapped: [], unmapped: [] })
  })
})
