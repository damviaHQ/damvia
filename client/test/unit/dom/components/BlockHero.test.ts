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
import BlockHero from '@/components/page-renderer/blocks/BlockHero.vue'

const link = { kind: 'url', url: 'https://example.com', external: true }

describe('BlockHero', () => {
  test('a linked banner is one link, its button only a cue', () => {
    const wrapper = mount(BlockHero, { props: { data: { title: 'Hi', link, button: { label: 'Go', link: null } } } })
    const anchors = wrapper.findAll('a')
    expect(anchors).toHaveLength(1)
    expect(anchors[0].attributes('href')).toBe('https://example.com')
    expect(anchors[0].find('section').text()).toContain('Go')
    expect(wrapper.find('button').exists()).toBe(false)
  })

  test('without a banner link, only the button links', () => {
    const wrapper = mount(BlockHero, { props: { data: { title: 'Hi', button: { label: 'Go', link } } } })
    expect(wrapper.find('section').element.parentElement?.tagName).not.toBe('A')
    expect(wrapper.find('a').text()).toBe('Go')
  })

  test('while editing, the banner does not link', () => {
    const wrapper = mount(BlockHero, { props: { data: { title: 'Hi', link }, editing: true } })
    expect(wrapper.find('a').exists()).toBe(false)
  })
})
