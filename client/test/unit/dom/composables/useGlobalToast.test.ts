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
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { describe, expect, test, vi } from 'vitest'

vi.mock('vue-sonner', () => {
  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() })
  return { toast }
})

const { toast } = await import('vue-sonner')
const { provideGlobalToast, useGlobalToast } = await import('@/composables/useGlobalToast.ts')

const Child = defineComponent({
  setup() {
    const globalToast = useGlobalToast()
    globalToast.default('plain')
    globalToast.success('done')
    globalToast.error('failed')
    globalToast.info('note')
    return () => h('span')
  },
})
const Provider = defineComponent({ setup() { provideGlobalToast(); return () => h(Child) } })

describe('useGlobalToast', () => {
  test('delegates every level to the toast library once provided', () => {
    mount(Provider)
    expect(toast).toHaveBeenCalledWith('plain')
    expect(toast.success).toHaveBeenCalledWith('done')
    expect(toast.error).toHaveBeenCalledWith('failed')
    expect(toast.info).toHaveBeenCalledWith('note')
  })

  test('throws when no ancestor provided the toast', () => {
    expect(() => mount(Child)).toThrow(/provideGlobalToast/)
  })
})
