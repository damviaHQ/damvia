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
import { ref } from 'vue'
import { cn, valueUpdater } from '@/lib/utils.ts'

describe('lib utils', () => {
  test('cn merges tailwind classes and drops falsy inputs', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4')
    expect(cn('text-sm', false && 'hidden', undefined, ['flex', { block: false }])).toBe('text-sm flex')
  })

  test('valueUpdater accepts a function or a plain value', () => {
    const state = ref(1)
    valueUpdater((value: number) => value + 1, state)
    expect(state.value).toBe(2)
    valueUpdater(10, state)
    expect(state.value).toBe(10)
  })
})
