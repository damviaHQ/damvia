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
export type RegionActivity = { name: string; activeUsers: number; views: number; downloads: number }
export type MapMetric = 'activeUsers' | 'views' | 'downloads'
export type Geography = { code: string; name: string; aliases: string[]; point: number[]; path: string }
export type MapLocation = RegionActivity & {
  id: string
  point: number[]
  kind: 'country' | 'region'
  regions: string[]
}

export const normalizeRegion = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
const project = (lon: number, lat: number) => [20 + ((lon + 180) / 360) * 960, 24 + ((85 - lat) / 150) * 400]
const macroregions = [
  {
    code: 'region-europe',
    name: 'Europe',
    aliases: ['Europe', 'EU', 'European Union', 'Union européenne'],
    point: project(15, 50),
  },
  {
    code: 'region-north-america',
    name: 'North America',
    aliases: ['North America', 'Amérique du Nord'],
    point: project(-100, 42),
  },
  {
    code: 'region-south-america',
    name: 'South America',
    aliases: ['South America', 'Amérique du Sud'],
    point: project(-60, -18),
  },
  {
    code: 'region-latam',
    name: 'Latin America',
    aliases: ['LATAM', 'Latin America', 'Amérique latine'],
    point: project(-70, -8),
  },
  { code: 'region-asia', name: 'Asia', aliases: ['Asia', 'Asie'], point: project(100, 35) },
  {
    code: 'region-apac',
    name: 'Asia Pacific',
    aliases: ['APAC', 'Asia Pacific', 'Asie Pacifique'],
    point: project(120, 5),
  },
  { code: 'region-africa', name: 'Africa', aliases: ['Africa', 'Afrique'], point: project(20, 5) },
  { code: 'region-oceania', name: 'Oceania', aliases: ['Oceania', 'Océanie'], point: project(145, -25) },
  {
    code: 'region-middle-east',
    name: 'Middle East',
    aliases: ['Middle East', 'Moyen-Orient'],
    point: project(45, 28),
  },
  { code: 'region-emea', name: 'EMEA', aliases: ['EMEA'], point: project(25, 30) },
]

export function locateRegions(rows: RegionActivity[], geography: Geography[]) {
  const aliases = new Map<string, Geography | (typeof macroregions)[number] | null>()
  for (const country of [...geography, ...macroregions]) {
    for (const alias of [...country.aliases, country.name, country.code]) {
      const key = normalizeRegion(alias)
      if (!key) continue
      const existing = aliases.get(key)
      if (aliases.has(key) && existing?.code !== country.code) aliases.set(key, null)
      else aliases.set(key, country)
    }
  }
  const additional = {
    uk: 'GB',
    usa: 'US',
    'u s a': 'US',
    'united states': 'US',
    uae: 'AE',
    'south korea': 'KR',
    'north korea': 'KP',
  }
  for (const [alias, code] of Object.entries(additional)) {
    const country = geography.find((item) => item.code === code)
    if (country) aliases.set(alias, country)
  }
  const mapped = new Map<string, MapLocation>()
  const unmapped: RegionActivity[] = []
  for (const row of rows) {
    const country = aliases.get(normalizeRegion(row.name))
    if (!country) {
      unmapped.push(row)
      continue
    }
    const item = mapped.get(country.code) ?? {
      id: country.code,
      name: country.name,
      point: country.point,
      kind: country.code.startsWith('region-') ? 'region' : 'country',
      regions: [],
      activeUsers: 0,
      views: 0,
      downloads: 0,
    }
    item.activeUsers += row.activeUsers
    item.views += row.views
    item.downloads += row.downloads
    item.regions.push(row.name)
    mapped.set(country.code, item)
  }
  return { mapped: Array.from(mapped.values()), unmapped }
}

export type MapCluster = { id: string; point: number[]; locations: MapLocation[]; value: number }
export function clusterLocations(
  locations: MapLocation[],
  metric: MapMetric,
  scale: number,
  viewportWidth: number,
): MapCluster[] {
  const clusters: MapCluster[] = []
  const distance = 48 / ((scale * Math.max(viewportWidth, 1)) / 1000)
  for (const location of [...locations]
    .filter((row) => row[metric] > 0)
    .sort((a, b) => b[metric] - a[metric] || a.id.localeCompare(b.id))) {
    const cluster = clusters.find(
      (item) => Math.hypot(location.point[0] - item.point[0], location.point[1] - item.point[1]) < distance,
    )
    if (cluster) {
      const count = cluster.locations.length
      cluster.point = [
        (cluster.point[0] * count + location.point[0]) / (count + 1),
        (cluster.point[1] * count + location.point[1]) / (count + 1),
      ]
      cluster.locations.push(location)
      cluster.value += location[metric]
    } else
      clusters.push({
        id: location.id,
        point: [...location.point],
        locations: [location],
        value: location[metric],
      })
  }
  return clusters
}
