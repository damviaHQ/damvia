<!-- Damvia - Open Source Digital Asset Manager
Copyright (C) 2024 Arnaud DE SAINT JEAN
This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>. -->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ArrowLeft, ArrowUpRight, Download, Globe2, MapPin, Minus, Plus, RotateCcw, X } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import geography from '@/assets/maps/world.json'
import { clusterLocations, locateRegions } from '@/utils/activityMap'
import type { MapCluster, MapLocation, MapMetric, RegionActivity } from '@/utils/activityMap'
import '@/styles/activity-map.css'

const props = defineProps<{ rows: RegionActivity[] }>()
defineEmits<{ export: [] }>()
const metric = ref<MapMetric>('activeUsers')
const metrics: { key: MapMetric; label: string }[] = [
  { key: 'activeUsers', label: 'Active users' },
  { key: 'downloads', label: 'Downloads' },
  { key: 'views', label: 'Views' },
]
const metricLabel = computed(() => metrics.find((item) => item.key === metric.value)!.label)
const located = computed(() => locateRegions(props.rows, geography))
const total = computed(() => props.rows.reduce((sum, row) => sum + row[metric.value], 0))
const mappedTotal = computed(() => located.value.mapped.reduce((sum, row) => sum + row[metric.value], 0))
const coverage = computed(() => (total.value ? Math.round((mappedTotal.value / total.value) * 100) : 0))
const selection = ref('')
const selected = computed(() => located.value.mapped.find((row) => row.id === selection.value))
const focusIds = ref<string[]>([])
const ranking = computed(() =>
  located.value.mapped
    .filter((row) => !focusIds.value.length || focusIds.value.includes(row.id))
    .sort((a, b) => b[metric.value] - a[metric.value] || a.name.localeCompare(b.name)),
)
const zoom = ref(1)
const centre = ref([500, 224])
const svg = ref<SVGSVGElement>()
const width = ref(800)
const hover = ref<MapCluster | null>(null)
const clusters = computed(() => clusterLocations(located.value.mapped, metric.value, zoom.value, width.value))
const visibleClusters = computed(() => clusters.value.filter((cluster) => {
  const [x, y] = screenPoint(cluster.point)
  return x >= 0 && x <= 1000 && y >= 0 && y <= 448
}))
const largest = computed(() => Math.max(1, ...clusters.value.map((row) => row.value)))
const radius = (value: number) => ((12 + 15 * Math.sqrt(value / largest.value)) * 1000) / width.value
const compact = (value: number) =>
  new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
const count = (value: number) => value.toLocaleString()
const screenPoint = (point: number[]) => [
  500 + (point[0] - centre.value[0]) * zoom.value,
  224 + (point[1] - centre.value[1]) * zoom.value,
]
const transform = computed(
  () => `translate(500 224) scale(${zoom.value}) translate(${-centre.value[0]} ${-centre.value[1]})`,
)
const activeCodes = computed(
  () => new Set(located.value.mapped.filter((row) => row[metric.value] > 0).map((row) => row.id)),
)
const meridians = [-120, -60, 0, 60, 120].map((lon) => 20 + ((lon + 180) / 360) * 960)
const parallels = [-30, 0, 30, 60].map((lat) => 24 + ((85 - lat) / 150) * 400)
let observer: ResizeObserver | undefined
let drag: { pointerId: number; x: number; y: number; centre: number[] } | null = null
const dragging = ref(false)
onMounted(() => {
  observer = new ResizeObserver(([entry]) => {
    width.value = Math.max(280, entry.contentRect.width)
  })
  if (svg.value) observer.observe(svg.value)
})
onBeforeUnmount(() => observer?.disconnect())
function clampCentre() {
  const halfWidth = 500 / zoom.value
  const halfHeight = 224 / zoom.value
  centre.value = [
    Math.min(1000 - halfWidth, Math.max(halfWidth, centre.value[0])),
    Math.min(448 - halfHeight, Math.max(halfHeight, centre.value[1])),
  ]
}
function changeZoom(delta: number) {
  zoom.value = Math.min(8, Math.max(1, zoom.value * delta))
  clampCentre()
  hover.value = null
}
function showAllLocations() {
  focusIds.value = []
  selection.value = ''
}
function resetMap() {
  zoom.value = 1
  centre.value = [500, 224]
  selection.value = ''
  focusIds.value = []
  hover.value = null
}
function focusLocation(location: MapLocation) {
  selection.value = location.id
  centre.value = [...location.point]
  zoom.value = 4
  clampCentre()
  hover.value = null
}
function focusCluster(cluster: MapCluster) {
  if (cluster.locations.length === 1) {
    focusLocation(cluster.locations[0])
    return
  }
  focusIds.value = cluster.locations.map((row) => row.id)
  selection.value = ''
  centre.value = [...cluster.point]
  zoom.value = Math.min(8, zoom.value * 2.5)
  clampCentre()
  hover.value = null
}
function startDrag(event: PointerEvent) {
  if (event.button !== 0 || !svg.value) return
  drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, centre: [...centre.value] }
  dragging.value = true
  svg.value.setPointerCapture(event.pointerId)
}
function moveDrag(event: PointerEvent) {
  if (!drag || drag.pointerId !== event.pointerId || !svg.value) return
  const bounds = svg.value.getBoundingClientRect()
  const factor = Math.min(bounds.width / 1000, bounds.height / 448)
  centre.value = [
    drag.centre[0] - (event.clientX - drag.x) / factor / zoom.value,
    drag.centre[1] - (event.clientY - drag.y) / factor / zoom.value,
  ]
  clampCentre()
}
function endDrag(event: PointerEvent) {
  if (svg.value?.hasPointerCapture(event.pointerId)) svg.value.releasePointerCapture(event.pointerId)
  drag = null
  dragging.value = false
}
function keyboard(event: KeyboardEvent) {
  if (event.target !== svg.value) return
  if (['+', '=', '-', 'Home', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key))
    event.preventDefault()
  if (event.key === '+' || event.key === '=') changeZoom(1.5)
  else if (event.key === '-') changeZoom(1 / 1.5)
  else if (event.key === 'Home') resetMap()
  else if (event.key.startsWith('Arrow')) {
    const step = 65 / zoom.value
    centre.value = [
      centre.value[0] + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0),
      centre.value[1] + (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0),
    ]
    clampCentre()
  }
}
watch(
  () => props.rows,
  () => {
    if (!located.value.mapped.some((row) => row.id === selection.value)) selection.value = ''
    focusIds.value = []
    hover.value = null
  },
)
watch(metric, () => {
  hover.value = null
})
</script>

<template>
  <section class="insight-report activity-map" aria-label="User activity around the world">
    <header class="report-heading">
      <div>
        <span class="map-eyebrow"><Globe2 :size="13" /> Audience geography</span>
        <h3>Your library, around the world</h3>
        <p>Activity by assigned user region during the selected period.</p>
      </div>
      <Button
        variant="outline"
        size="sm"
        :disabled="!rows.length"
        aria-label="Export activity by region as CSV"
        @click="$emit('export')"
        ><Download :size="14" /> CSV</Button
      >
    </header>
    <div class="map-toolbar">
      <div class="map-metrics" aria-label="Map metric">
        <button
          v-for="item in metrics"
          :key="item.key"
          :aria-pressed="metric === item.key"
          :class="{ selected: metric === item.key }"
          @click="metric = item.key"
        >
          {{ item.label }}
        </button>
      </div>
      <span><i></i>{{ located.mapped.filter((row) => row[metric] > 0).length }} mapped locations</span>
    </div>
    <div class="map-layout">
      <div class="map-surface">
        <div class="map-corner-label">
          <Globe2 :size="13" /><span>{{ zoom > 1 ? `${zoom.toFixed(1)}× zoom` : 'World view' }}</span>
        </div>
        <svg
          ref="svg"
          viewBox="0 0 1000 448"
          class="world-map"
          :class="{ dragging }"
          role="group"
          tabindex="0"
          aria-label="Interactive activity map. Use plus and minus to zoom, arrow keys to pan, Home to reset. Select a bubble or a location in the list for details."
          @pointerdown="startDrag"
          @pointermove="moveDrag"
          @pointerup="endDrag"
          @pointercancel="endDrag"
          @keydown="keyboard"
          @pointerleave="hover = null"
        >
          <g :transform="transform" class="map-geography" aria-hidden="true">
            <g class="map-graticule">
              <line v-for="x in meridians" :key="`x${x}`" :x1="x" y1="0" :x2="x" y2="448" />
              <line v-for="y in parallels" :key="`y${y}`" x1="0" :y1="y" x2="1000" :y2="y" />
            </g>
            <path
              v-for="country in geography"
              :key="country.code"
              :d="country.path"
              fill-rule="evenodd"
              class="map-country"
              :class="{ active: activeCodes.has(country.code), selected: selection === country.code }"
              vector-effect="non-scaling-stroke"
            />
          </g>
          <g
            v-for="cluster in visibleClusters"
            :key="cluster.id"
            :transform="`translate(${screenPoint(cluster.point).join(' ')})`"
            class="map-marker"
            :class="{
              selected: cluster.locations.some((row) => row.id === selection),
              'is-cluster': cluster.locations.length > 1,
            }"
            role="button"
            tabindex="0"
            :aria-label="`${cluster.locations.map((row) => row.name).join(', ')}: ${count(cluster.value)} ${metricLabel.toLowerCase()}. ${cluster.locations.length > 1 ? 'Zoom into these locations.' : 'View location details.'}`"
            @pointerdown.stop
            @click.stop="focusCluster(cluster)"
            @keydown.enter.prevent.stop="focusCluster(cluster)"
            @keydown.space.prevent.stop="focusCluster(cluster)"
            @pointerenter="hover = cluster"
            @pointerleave="hover = null"
            @focus="hover = cluster"
            @blur="hover = null"
          >
            <circle :r="radius(cluster.value) + (7 * 1000) / width" class="map-marker-halo" />
            <circle :r="radius(cluster.value)" class="map-marker-core" />
            <text
              text-anchor="middle"
              dominant-baseline="central"
              :font-size="(12 * 1000) / width"
              font-weight="600"
            >
              {{ compact(cluster.value) }}
            </text>
            <circle
              v-if="cluster.locations.length > 1"
              :cx="radius(cluster.value) * 0.72"
              :cy="-radius(cluster.value) * 0.72"
              :r="(7 * 1000) / width"
              class="map-cluster-dot"
            />
            <text
              v-if="cluster.locations.length > 1"
              :x="radius(cluster.value) * 0.72"
              :y="-radius(cluster.value) * 0.72"
              :font-size="(9 * 1000) / width"
              text-anchor="middle"
              dominant-baseline="central"
              class="map-cluster-count"
            >
              {{ cluster.locations.length }}
            </text>
          </g>
        </svg>
        <div v-if="hover" class="map-tooltip" role="status">
          <strong>{{
            hover.locations.length === 1
              ? hover.locations[0].name
              : `${hover.locations.length} nearby locations`
          }}</strong
          ><span>{{ count(hover.value) }} {{ metricLabel.toLowerCase() }}</span
          ><small>{{ hover.locations.map((row) => row.name).join(' · ') }}</small>
        </div>
        <div v-if="!mappedTotal" class="map-no-data">
          <MapPin :size="22" /><strong>{{
            total ? 'These regions are not mapped yet' : 'No activity for this metric'
          }}</strong>
          <p>
            {{
              total
                ? 'Country names, country codes and common world regions are recognized. Custom region names stay in the list below.'
                : 'Choose another period or metric to explore your audience.'
            }}
          </p>
        </div>
        <div class="map-controls" aria-label="Map controls">
          <button aria-label="Zoom in" :disabled="zoom >= 8" @click="changeZoom(1.5)">
            <Plus :size="17" /></button
          ><button aria-label="Zoom out" :disabled="zoom <= 1" @click="changeZoom(1 / 1.5)">
            <Minus :size="17" /></button
          ><button aria-label="Reset map to world view" @click="resetMap"><RotateCcw :size="15" /></button>
        </div>
        <div class="map-legend">
          <span class="map-legend-circles"><i></i><i></i><i></i></span
          ><span>Bubble size = {{ metricLabel.toLowerCase() }}</span>
        </div>
        <a
          class="map-attribution"
          href="https://www.naturalearthdata.com/"
          target="_blank"
          rel="noopener noreferrer"
          >Natural Earth</a
        >
      </div>
      <aside class="map-ranking" aria-label="Activity by mapped location">
        <div class="map-ranking-summary">
          <span>{{ metricLabel }}</span
          ><strong>{{ count(mappedTotal) }}</strong>
          <p>{{ coverage }}% of {{ metricLabel.toLowerCase() }} mapped</p>
        </div>
        <div class="map-ranking-heading">
          <button
            v-if="focusIds.length"
            class="map-back"
            @click="showAllLocations"
          >
            <ArrowLeft :size="13" /> All locations</button
          ><span v-else>Top locations</span><span>{{ metricLabel }}</span>
        </div>
        <div class="map-ranking-list">
          <button
            v-for="(location, index) in ranking"
            :key="location.id"
            :aria-pressed="selection === location.id"
            :class="{ selected: selection === location.id }"
            @click="focusLocation(location)"
          >
            <span class="map-rank">{{ index + 1 }}</span
            ><span class="map-rank-name"
              >{{ location.name }}<small v-if="location.kind === 'region'">Regional centre</small
              ><i
                :style="{
                  width: `${ranking[0]?.[metric] ? (location[metric] / ranking[0][metric]) * 100 : 0}%`,
                }"
              ></i></span
            ><strong>{{ count(location[metric]) }}</strong
            ><ArrowUpRight :size="13" />
          </button>
          <p v-if="!ranking.length" class="map-ranking-empty">No mapped locations in this period.</p>
        </div>
        <div v-if="selected" class="map-location-detail" aria-live="polite">
          <header>
            <strong>{{ selected.name }}</strong
            ><button aria-label="Clear selected location" @click="selection = ''"><X :size="13" /></button>
          </header>
          <p>
            {{ selected.kind === 'region' ? 'Regional centre' : 'Country reference point' }} ·
            {{ selected.regions.join(', ') }}
          </p>
          <dl>
            <div>
              <dt>Active users</dt>
              <dd>{{ count(selected.activeUsers) }}</dd>
            </div>
            <div>
              <dt>Downloads</dt>
              <dd>{{ count(selected.downloads) }}</dd>
            </div>
            <div>
              <dt>Views</dt>
              <dd>{{ count(selected.views) }}</dd>
            </div>
          </dl>
        </div>
      </aside>
    </div>
    <details v-if="located.unmapped.length" class="map-unmapped">
      <summary>
        {{ located.unmapped.length }} {{ located.unmapped.length === 1 ? 'region' : 'regions' }} not mapped ·
        {{ count(total - mappedTotal) }} {{ metricLabel.toLowerCase() }}
      </summary>
      <p>
        These names do not identify a supported geographic area. Their activity is still included in report
        totals.
      </p>
      <ul>
        <li v-for="row in located.unmapped" :key="row.name">
          <span>{{ row.name }}</span
          ><strong>{{ count(row[metric]) }}</strong>
        </li>
      </ul>
    </details>
    <footer class="map-footnote">
      <MapPin :size="12" /><span
        >Based on the region assigned to each account. Markers show country or regional reference points, not
        a user's exact or live location.</span
      >
    </footer>
  </section>
</template>
