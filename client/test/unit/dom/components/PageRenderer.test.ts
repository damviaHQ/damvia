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
import PageRenderer from '@/components/page-renderer/PageRenderer.vue'

const stubs = { PageBlockView: { props: ['block'], template: '<div class="block">{{ block.type }}</div>' } }

describe('PageRenderer', () => {
  test('blocks render in order, each spanning its own width', () => {
    const wrapper = mount(PageRenderer, {
      props: {
        blocks: [
          { id: '1', type: 'hero', size: 'full', data: {} },
          { id: '2', type: 'image', size: 'half', data: {} },
          { id: '3', type: 'text', size: 'half', data: {} },
          { id: '4', type: 'files', size: 'third', data: {} },
        ],
        generateRoute: () => ({}),
      },
      global: { stubs },
    })

    const blocks = wrapper.findAll('.block')
    expect(blocks.map((block) => block.text())).toEqual(['hero', 'image', 'text', 'files'])
    expect(wrapper.html()).toContain('md:col-span-6')
    expect(wrapper.html()).toContain('md:col-span-3')
    expect(wrapper.html()).toContain('md:col-span-2')
  })

  // A block that shows nothing used to vanish from the grid, so everything
  // after it moved up and the live page did not match the editor.
  test('a block with nothing to show still holds its place in the layout', () => {
    const wrapper = mount(PageRenderer, {
      props: {
        blocks: [
          { id: '1', type: 'text', size: 'half', data: { html: '<p>Left</p>' } },
          { id: '2', type: 'text', size: 'half', data: { html: '' } },
          { id: '3', type: 'text', size: 'full', data: { html: '<p>Below</p>' } },
        ],
        generateRoute: () => ({}),
      },
    })

    const cells = Array.from(wrapper.find('.page-renderer').element.children)
    expect(cells).toHaveLength(3)
    expect(cells.map((cell) => cell.className)).toEqual(['md:col-span-3', 'md:col-span-3', 'md:col-span-6'])
    expect(cells[1].textContent).toBe('')
    expect(cells[2].textContent).toContain('Below')
  })

  test('an empty page renders an empty grid rather than failing', () => {
    const wrapper = mount(PageRenderer, { props: { blocks: [], generateRoute: () => ({}) }, global: { stubs } })
    expect(wrapper.findAll('.block')).toHaveLength(0)
    expect(wrapper.find('.page-renderer').exists()).toBe(true)
  })
})
