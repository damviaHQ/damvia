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
import { describe, expect, test, vi } from 'vitest'
import { defineComponent } from 'vue'

const Note = defineComponent({ name: 'Note', render: () => null })
vi.mock('virtual:damvia-modules', () => ({
  default: [
    { name: 'hello', routes: [{ path: '/notes', component: Note }], nav: [{ label: 'Notes', to: '/notes' }], adminNav: [{ section: 'users', label: 'All notes', to: '/admin/notes' }] },
    { name: 'other', adminNav: [{ section: 'content', label: 'Other', to: '/admin/other' }] },
    { name: 'empty' },
  ],
}))

describe('client modules', () => {
  test('routes and menu entries are gathered from every module, in the order they are listed', async () => {
    const { clientModules, moduleAdminNav, moduleNav, moduleRoutes } = await import('@/modules')
    expect(clientModules.map(module => module.name)).toEqual(['hello', 'other', 'empty'])
    expect(moduleRoutes.map(route => route.path)).toEqual(['/notes'])
    expect(moduleNav.map(item => item.label)).toEqual(['Notes'])
    expect(moduleAdminNav('users').map(item => item.label)).toEqual(['All notes'])
    expect(moduleAdminNav('content').map(item => item.label)).toEqual(['Other'])
    expect(moduleAdminNav('settings')).toEqual([])
  })

  test('a module client prefixes its procedures with modules.<name>', async () => {
    const { moduleClient } = await import('@/modules')
    const fetch = vi.fn(async () => new Response(JSON.stringify({ result: { data: [] } })))
    vi.stubGlobal('fetch', fetch)
    try {
      await (moduleClient('hello') as any).list.query()
    } finally { vi.unstubAllGlobals() }
    expect(String((fetch.mock.calls[0] as unknown[])[0])).toMatch(/\/trpc\/modules\.hello\.list(\?|$)/)
    expect((fetch.mock.calls[0] as unknown[])[1]).toMatchObject({ credentials: 'include' })
  })
})
