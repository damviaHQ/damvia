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
// Same rules as server/src/mail/color.ts, so the portal and the emails agree.
export const HEX_COLOR = /^#[0-9a-f]{6}$/i

function channels(hex: string): [number, number, number] {
  return [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16)) as [number, number, number]
}

function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((value) => {
    const c = value / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (light + 0.05) / (dark + 0.05)
}

export function textOn(hex: string): string {
  return contrast(hex, '#ffffff') >= 3 ? '#ffffff' : '#111111'
}

// The "h s% l%" triplet the shadcn variables hold.
export function hslTriplet(hex: string): string {
  const [r, g, b] = channels(hex).map((value) => value / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  let h = 0
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
  }
  h = Math.round(h * 60 + 360) % 360
  return `${h} ${(s * 100).toFixed(1)}% ${(l * 100).toFixed(1)}%`
}

export function darken(hex: string, amount = 0.12): string {
  return '#' + channels(hex).map((value) => Math.round(value * (1 - amount)).toString(16).padStart(2, '0')).join('')
}

// CSS variables that recolour the client portal's actions.
export function accentVariables(hex: string | null | undefined): Record<string, string> {
  if (!hex || !HEX_COLOR.test(hex)) return {}
  const foreground = textOn(hex)
  return {
    '--dv-color-blue': hex,
    '--dv-color-blue-hover': darken(hex),
    '--primary': hslTriplet(hex),
    '--primary-foreground': hslTriplet(foreground),
    '--ring': hslTriplet(hex),
    // The build-time `brand` Tailwind colours read these first.
    '--tenant-brand-color': hex,
    '--tenant-brand-foreground': foreground,
    '--tenant-brand-hover': darken(hex),
    '--tenant-brand-strong': darken(hex, 0.3),
  }
}
