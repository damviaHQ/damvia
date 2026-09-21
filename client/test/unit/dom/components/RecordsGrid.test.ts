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
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, test, vi } from 'vitest'
import RecordsGrid, { type GridColumn, type GridField } from '@/components/records/RecordsGrid.vue'

const colour: GridField = { id: 'f1', name: 'Colour', displayName: null, valueType: 'text', options: [] }
const price: GridField = { id: 'f2', name: 'Price', displayName: null, valueType: 'number', options: [] }
const columns: GridColumn[] = [
  { id: 'thumbnail', kind: 'thumbnail', label: 'Picture', width: 56 },
  { id: 'key', kind: 'key', label: 'SKU', width: 180, sortKey: 'recordKey' },
  { id: 'field:Colour', kind: 'field', label: 'Colour', width: 180, sortKey: 'Colour', field: colour },
  { id: 'field:Price', kind: 'field', label: 'Price', width: 120, sortKey: 'Price', field: price },
]
const rows = [
  { id: 'r1', recordKey: 'A-1', metaData: { Colour: 'Blue', Price: '10' }, thumbnailURL: null, fileCount: 0, filledCount: 2 },
  { id: 'r2', recordKey: 'A-2', metaData: { Colour: '', Price: 'n/a' }, thumbnailURL: null, fileCount: 3, filledCount: 1 },
]

function setup(commit = vi.fn().mockResolvedValue(undefined), create = vi.fn().mockResolvedValue(undefined)) {
  const wrapper = mount(RecordsGrid, {
    attachTo: document.body,
    props: { rows, columns, fieldCount: 2, sort: null, selected: [], recordLabel: 'product', keyLabel: 'SKU', commit, addOption: vi.fn(), create },
  })
  return { wrapper, commit, create }
}
const cell = (wrapper: ReturnType<typeof setup>['wrapper'], row: number, column: number) => wrapper.get(`[data-cell="${row}-${column}"]`)

describe('RecordsGrid', () => {
  test('Enter edits the focused cell, Enter again saves it and moves down', async () => {
    const { wrapper, commit } = setup()
    await cell(wrapper, 0, 2).trigger('click')
    await cell(wrapper, 0, 2).trigger('keydown', { key: 'Enter' })
    const input = wrapper.get('input.record-cell-input')
    expect((input.element as HTMLInputElement).value).toBe('Blue')
    await input.setValue('Red')
    await input.trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(commit).toHaveBeenCalledWith(rows[0], colour, 'Red')
    expect(wrapper.find('input.record-cell-input').exists()).toBe(false)
    expect(cell(wrapper, 1, 2).attributes('tabindex')).toBe('0')
    wrapper.unmount()
  })

  test('typing on a cell replaces its value, Escape leaves it untouched', async () => {
    const { wrapper, commit } = setup()
    await cell(wrapper, 0, 2).trigger('click')
    await cell(wrapper, 0, 2).trigger('keydown', { key: 'G' })
    expect((wrapper.get('input.record-cell-input').element as HTMLInputElement).value).toBe('G')
    await wrapper.get('input.record-cell-input').trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('input.record-cell-input').exists()).toBe(false)
    expect(commit).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  test('a refused value reopens the editor with the text the admin typed', async () => {
    const { wrapper } = setup(vi.fn().mockRejectedValue(new Error('Price must be a number')))
    await cell(wrapper, 0, 3).trigger('click')
    await cell(wrapper, 0, 3).trigger('keydown', { key: 'Enter' })
    await wrapper.get('input.record-cell-input').setValue('cheap')
    await wrapper.get('input.record-cell-input').trigger('keydown', { key: 'Tab' })
    await flushPromises()
    expect((wrapper.get('input.record-cell-input').element as HTMLInputElement).value).toBe('cheap')
    wrapper.unmount()
  })

  test('a value that breaks its type is marked, and the key column cannot be edited', async () => {
    const { wrapper } = setup()
    const invalid = cell(wrapper, 1, 3).get('.record-value')
    expect(invalid.classes()).toContain('is-invalid')
    expect(invalid.attributes('title')).toMatch(/must be a number/)
    await cell(wrapper, 0, 1).trigger('click')
    await cell(wrapper, 0, 1).trigger('keydown', { key: 'x' })
    expect(wrapper.find('input.record-cell-input').exists()).toBe(false)
    expect(wrapper.emitted('open')).toBeUndefined()
    await cell(wrapper, 0, 1).trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('open')?.[0]).toEqual([rows[0]])
    wrapper.unmount()
  })

  test('the last row creates a record from its key and shows why a key is refused', async () => {
    const { wrapper, create } = setup(undefined, vi.fn().mockRejectedValueOnce(new Error('A record with key A-1 already exists.')).mockResolvedValue(undefined))
    const input = wrapper.get('.records-grid-new input')
    await input.setValue('A-1')
    await wrapper.get('.records-grid-new form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('#new-record-error').text()).toBe('A record with key A-1 already exists.')
    await input.setValue(' A-3 ')
    await wrapper.get('.records-grid-new form').trigger('submit')
    await flushPromises()
    expect(create).toHaveBeenLastCalledWith('A-3')
    expect((input.element as HTMLInputElement).value).toBe('')
    wrapper.unmount()
  })

  test('ticking an option shows in the cell at once and saves when the list closes', async () => {
    const tags: GridField = { id: 'f3', name: 'Tags', displayName: null, valueType: 'multi_select', options: ['Eco', 'Sale'] }
    const commit = vi.fn().mockResolvedValue(undefined)
    const wrapper = mount(RecordsGrid, {
      attachTo: document.body,
      props: { rows: [{ ...rows[0], metaData: { Tags: 'Eco' } }], columns: [...columns.slice(0, 2), { id: 'field:Tags', kind: 'field', label: 'Tags', width: 200, field: tags }], fieldCount: 1, sort: null, selected: [], recordLabel: 'product', keyLabel: 'SKU', commit, addOption: vi.fn(), create: vi.fn() },
    })
    await cell(wrapper, 0, 2).trigger('click')
    await cell(wrapper, 0, 2).trigger('keydown', { key: 'Enter' })
    await flushPromises()
    const sale = [...document.body.querySelectorAll('[role=option]')].find((option) => option.textContent?.includes('Sale')) as HTMLElement
    sale.click()
    await flushPromises()
    expect(cell(wrapper, 0, 2).text()).toContain('Sale')
    expect(commit).not.toHaveBeenCalled()
    ;(document.body.querySelector('.record-option-done') as HTMLElement).click()
    await flushPromises()
    expect(commit).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1' }), tags, 'Eco|Sale')
    wrapper.unmount()
  })
})
