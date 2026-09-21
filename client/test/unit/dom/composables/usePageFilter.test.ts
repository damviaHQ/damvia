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
import { mount } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'
import { providePageFilter, type PageFilter } from '@/composables/usePageFilter'

function withFilter(enabled: () => boolean) {
  let filter!: PageFilter
  mount(defineComponent({ setup() { filter = providePageFilter(enabled); return () => null } }))
  return filter
}

describe('page filter', () => {
  test('a page that hides its filter is never narrowed', () => {
    const enabled = ref(true)
    const filter = withFilter(() => enabled.value)
    const files = [{ name: 'alpha.png' }, { name: 'beta.png' }]
    filter.setName('alpha')
    expect(filter.filterFiles(files)).toEqual([{ name: 'alpha.png' }])
    enabled.value = false
    expect(filter.isActive.value).toBe(false)
    expect(filter.filterFiles(files)).toEqual(files)
  })
})
