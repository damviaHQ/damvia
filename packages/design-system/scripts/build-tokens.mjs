/* Damvia - Open Source Digital Asset Manager
Copyright (C) 2026 Arnaud DE SAINT JEAN
This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.
You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>. */
import { readFileSync, writeFileSync } from 'node:fs'
const source = JSON.parse(readFileSync(new URL('../src/tokens.json', import.meta.url)))
const tokens = new Map()
function collect(group, path = []) {
  for (const [key, value] of Object.entries(group)) {
    if (key.startsWith('$')) continue
    const next = [...path, key]
    if ('$value' in value) tokens.set(next.join('.'), value)
    else collect(value, next)
  }
}
collect(source)
function cssValue(token) {
  const value = token.$value
  if (typeof value === 'string' && value.startsWith('{')) {
    const target = value.slice(1, -1)
    if (!tokens.has(target)) throw new Error(`Unknown alias: ${target}`)
    return `var(--dv-${target.replaceAll('.', '-')})`
  }
  if (token.$type === 'color') return `rgb(${value.components.map(n => Math.round(n * 255)).join(' ')} / ${value.alpha})`
  if (token.$type === 'dimension') return `${value.value}${value.unit}`
  if (token.$type === 'fontFamily') return value.map(f => f.includes(' ') ? `"${f}"` : f).join(', ')
  throw new Error(`Unsupported token type: ${token.$type}`)
}
// shadcn consumes HSL channels; derive them from the same source tokens.
const adminRoles = {
  background: 'surface.panel', foreground: 'text.primary',
  muted: 'surface.canvas', 'muted-foreground': 'text.secondary',
  popover: 'surface.panel', 'popover-foreground': 'text.primary',
  card: 'surface.panel', 'card-foreground': 'text.primary',
  border: 'color.line', input: 'color.line',
  primary: 'action.primary', 'primary-foreground': 'text.on-dark',
  secondary: 'surface.canvas', 'secondary-foreground': 'text.primary',
  accent: 'surface.canvas', 'accent-foreground': 'text.primary',
  destructive: 'color.danger', 'destructive-foreground': 'text.on-dark',
  ring: 'action.primary',
}
function hslChannels(name) {
  let token = tokens.get(name)
  while (typeof token.$value === 'string') token = tokens.get(token.$value.slice(1, -1))
  const [r, g, b] = token.$value.components
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const delta = max - min, lightness = (max + min) / 2
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1))
  let hue = delta === 0 ? 0 : max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4
  hue = (hue * 60 + 360) % 360
  return `${hue.toFixed(4)} ${(saturation * 100).toFixed(4)}% ${(lightness * 100).toFixed(4)}%`
}
const license = readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0] + '*/\n'
const tokenOutput = `${license}/* Generated from tokens.json. Run npm run build in packages/design-system. */\n.dv-theme {\n${[...tokens].map(([name, token]) => `  --dv-${name.replaceAll('.', '-')}: ${cssValue(token)};`).join('\n')}\n}\n`
const output = tokenOutput + `\n/* Admin-only bridge for shared shadcn controls and teleported overlays. */\n.dv-admin {\n${Object.entries(adminRoles).map(([role, token]) => `  --${role}: ${hslChannels(token)};`).join('\n')}\n}\n`
const destination = new URL('../src/tokens.css', import.meta.url)
if (process.argv.includes('--check')) {
  if (readFileSync(destination, 'utf8') !== output) throw new Error('tokens.css is out of date')
  console.log(`${tokens.size} tokens verified`)
} else {
  writeFileSync(destination, output)
  console.log(`${tokens.size} tokens generated`)
}
