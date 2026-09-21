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
  const commitMany = vi.fn().mockResolvedValue(undefined)
  const wrapper = mount(RecordsGrid, {
    attachTo: document.body,
    props: { rows, columns, fieldCount: 2, sort: null, selected: [], recordLabel: 'product', keyLabel: 'SKU', commit, commitMany, addOption: vi.fn(), create },
  })
  return { wrapper, commit, commitMany, create }
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
      props: { rows: [{ ...rows[0], metaData: { Tags: 'Eco' } }], columns: [...columns.slice(0, 2), { id: 'field:Tags', kind: 'field', label: 'Tags', width: 200, field: tags }], fieldCount: 1, sort: null, selected: [], recordLabel: 'product', keyLabel: 'SKU', commit, commitMany: vi.fn(), addOption: vi.fn(), create: vi.fn() },
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

  test('Shift+arrows select a range that copies as tab-separated rows and clears at once', async () => {
    const { wrapper, commitMany } = setup()
    await cell(wrapper, 0, 2).trigger('click')
    await cell(wrapper, 0, 2).trigger('keydown', { key: 'ArrowDown', shiftKey: true })
    await cell(wrapper, 0, 2).trigger('keydown', { key: 'ArrowRight', shiftKey: true })
    expect(cell(wrapper, 1, 3).attributes('aria-selected')).toBe('true')
    const setData = vi.fn()
    await cell(wrapper, 0, 2).trigger('copy', { clipboardData: { setData } })
    expect(setData).toHaveBeenCalledWith('text/plain', 'Blue\t10\n\tn/a')
    expect(cell(wrapper, 0, 2).classes()).toContain('copied-top')
    await cell(wrapper, 0, 2).trigger('keydown', { key: 'Delete' })
    expect(commitMany).toHaveBeenCalledWith([
      { record: rows[0], field: colour, value: '' }, { record: rows[0], field: price, value: '' },
      { record: rows[1], field: colour, value: '' }, { record: rows[1], field: price, value: '' },
    ], 0)
    wrapper.unmount()
  })

  test('a pasted block lands from the focused cell, and read-only cells are counted, not written', async () => {
    const { wrapper, commitMany } = setup()
    await cell(wrapper, 0, 2).trigger('click')
    await cell(wrapper, 0, 2).trigger('paste', { clipboardData: { getData: () => 'Red\t5\r\nGreen\t6\r\n' } })
    expect(commitMany).toHaveBeenLastCalledWith([
      { record: rows[0], field: colour, value: 'Red' }, { record: rows[0], field: price, value: '5' },
      { record: rows[1], field: colour, value: 'Green' }, { record: rows[1], field: price, value: '6' },
    ], 0)
    expect(cell(wrapper, 1, 3).attributes('aria-selected')).toBe('true')
    await cell(wrapper, 0, 1).trigger('click')
    await cell(wrapper, 0, 1).trigger('paste', { clipboardData: { getData: () => 'X' } })
    expect(commitMany).toHaveBeenLastCalledWith([], 1)
    wrapper.unmount()
  })

  test('the fill handle and Ctrl+D copy a value into the cells below', async () => {
    const { wrapper, commit } = setup()
    await cell(wrapper, 0, 2).trigger('click')
    await cell(wrapper, 0, 2).get('.records-grid-fill-handle').trigger('dblclick')
    expect(commit).toHaveBeenLastCalledWith(rows[1], colour, 'Blue')
    await cell(wrapper, 0, 3).trigger('click')
    await cell(wrapper, 0, 3).trigger('keydown', { key: 'ArrowDown', shiftKey: true })
    await cell(wrapper, 0, 3).trigger('keydown', { key: 'd', ctrlKey: true })
    expect(commit).toHaveBeenLastCalledWith(rows[1], price, '10')
    wrapper.unmount()
  })
})
