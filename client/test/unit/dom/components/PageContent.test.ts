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
/* Damvia - Open Source Digital Asset Manager
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
along with this program. If not, see <https://www.gnu.org/licenses/>. */
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick, reactive, ref } from 'vue'
import { expect, test, vi } from 'vitest'
import type { SelectionItem } from '@/stores/globalStore'
import { usePageContent } from '@/composables/usePageContent'
import { registerPageListing, type PageListing } from '@/composables/usePageListings'
import PageSelectionContext from '@/components/PageSelectionContext.vue'

const { getStore } = vi.hoisted(() => ({ getStore: vi.fn() }))
vi.mock('@/stores/globalStore', () => ({ useGlobalStore: getStore }))

test('selection follows displayed blocks, deduplicates items and preserves selections outside the filter', async () => {
  const store = reactive({
    selection: [{ type: 'file', id: 'elsewhere' }] as SelectionItem[],
    addToSelection(item: SelectionItem) { this.selection.push(item) },
    removeFromSelection(item: SelectionItem) { this.selection = this.selection.filter(other => other.type !== item.type || other.id !== item.id) },
  })
  getStore.mockReturnValue(store)
  const listing = ref<PageListing>({ collections: [{ id: 'shown', name: 'Chair' }, { id: 'shown', name: 'Chair' }, { id: 'hidden', name: 'Table' }] })
  const pageKey = ref('home')
  const child = defineComponent({ setup() { registerPageListing(listing); return () => h('div') } })
  let content!: ReturnType<typeof usePageContent>
  const wrapper = mount(defineComponent({ setup() {
    content = usePageContent({ filterEnabled: ref(true), pageKey, blocks: ref([]) })
    return () => h(child)
  } }))
  await nextTick()
  content.pageFilter.setName('Chair')
  content.toggleSelection()
  expect(store.selection).toEqual([{ type: 'file', id: 'elsewhere' }, { type: 'collection', id: 'shown' }])
  content.toggleSelection()
  expect(store.selection).toEqual([{ type: 'file', id: 'elsewhere' }])
  pageKey.value = 'next'
  await nextTick()
  expect(content.selectable.value).toHaveLength(2)
  listing.value = {}
  await nextTick()
  expect(content.selectable.value).toEqual([])
  wrapper.unmount()
})

test('the shared context labels empty, partial and complete selection consistently', async () => {
  const wrapper = mount(PageSelectionContext, {
    props: { items: [{ id: 'home', label: 'Home' }], selectedCount: 0, selectableCount: 2, selectionLabel: 'Select all items on this page' },
    global: { stubs: { PathBreadcrumb: true } },
  })
  const container = () => wrapper.get('.collection__selection-container')
  const button = () => container().get('button.text-sm')
  expect(button().text()).toBe('Select All in')
  await button().trigger('click')
  expect(wrapper.emitted('toggle')).toHaveLength(1)
  await wrapper.setProps({ selectedCount: 1 })
  expect(button().text()).toBe('1 item selected in')
  await container().trigger('mouseenter')
  expect(button().text()).toBe('Select All in')
  await container().trigger('mouseleave')
  await wrapper.setProps({ selectedCount: 2 })
  expect(button().text()).toBe('2 items selected in')
  await container().trigger('mouseenter')
  expect(button().text()).toBe('Remove Selection in')
  await wrapper.setProps({ selectableCount: 0, selectedCount: 0 })
  expect(wrapper.find('.collection__selection-container').exists()).toBe(false)
  expect(wrapper.find('button').exists()).toBe(false)
  wrapper.unmount()
})
