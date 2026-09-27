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
import { accentVariables, contrast, darken, hslTriplet, textOn } from '@/lib/brand-color'

describe('brand colour', () => {
  test('contrast follows WCAG and is symmetric', () => {
    expect(contrast('#ffffff', '#000000')).toBeCloseTo(21, 5)
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contrast('#777777', '#777777')).toBeCloseTo(1, 5)
  })

  test('buttons keep white text unless the colour is too light for it', () => {
    expect(textOn('#0044f4')).toBe('#ffffff')
    expect(textOn('#e4572e')).toBe('#ffffff')
    expect(textOn('#ffcc00')).toBe('#111111')
    expect(textOn('#f5f5f5')).toBe('#111111')
  })

  test('colours convert to the shadcn HSL triplet and darken for hover', () => {
    expect(hslTriplet('#ff0000')).toBe('0 100.0% 50.0%')
    expect(hslTriplet('#ffffff')).toBe('0 0.0% 100.0%')
    expect(hslTriplet('#0044f4')).toBe('223 100.0% 47.8%')
    expect(darken('#ffffff', 0.5)).toBe('#808080')
  })

  test('only a valid colour overrides the portal variables', () => {
    expect(accentVariables(null)).toEqual({})
    expect(accentVariables('red')).toEqual({})
    expect(accentVariables('#ffcc00')).toMatchObject({ '--dv-color-blue': '#ffcc00', '--primary-foreground': '0 0.0% 6.7%' })
  })
})
