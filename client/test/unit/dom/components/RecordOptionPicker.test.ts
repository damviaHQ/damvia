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
import { describe, expect, test } from 'vitest'
import RecordOptionPicker from '@/components/records/RecordOptionPicker.vue'

// A value typed before the field became a select is not one of its options.
// It must stay visible so it can be removed, or every save is refused.
describe('RecordOptionPicker', () => {
  test('a multiple select lists a value that is not an option and unticks it', async () => {
    const wrapper = mount(RecordOptionPicker, { props: { options: ['sfsdf', 'sdfsdfzfe'], multiple: true, modelValue: 'ghj|sfsdf', label: 'Client' } })
    const first = wrapper.findAll('[role=option]')[0]
    expect(first.text()).toContain('ghj')
    expect(first.text()).toContain('not an option')
    await first.trigger('click')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['sfsdf'])
  })

  test('a single select clears such a value when it is picked', async () => {
    const wrapper = mount(RecordOptionPicker, { props: { options: ['Red'], multiple: false, modelValue: 'ghj', label: 'Colour' } })
    await wrapper.findAll('[role=option]')[0].trigger('click')
    expect(wrapper.emitted('commit')?.[0]).toEqual([''])
  })
})
