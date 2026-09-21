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
import { describeRule, editableSettings, emptyRule, isRestricted, type ActionBarRule } from '@/utils/actionBar'

const names = {
  groups: new Map([['g1', 'Design'], ['g2', 'Sales'], ['g3', 'Legal']]),
  users: new Map([['u1', 'Ada'], ['u2', 'Grace']]),
}
const rule = (mode: ActionBarRule['mode'], audience: Partial<ActionBarRule> = {}): ActionBarRule => ({ ...emptyRule(mode), ...audience })

describe('action bar rules', () => {
  test('each rule reads as one plain sentence', () => {
    expect(describeRule(undefined, names)).toBe('Visible to everyone')
    expect(describeRule(rule('nobody'), names)).toBe('Hidden from everyone')
    expect(describeRule(rule('only', { roles: ['member'], groupIds: ['g1'], userIds: ['u1'] }), names)).toBe('Visible to Members, Design and Ada only')
    expect(describeRule(rule('except', { roles: ['guest', 'manager'] }), names)).toBe('Hidden from Managers and Guests')
    expect(describeRule(rule('only', { groupIds: ['g1', 'g2', 'g3'] }), names)).toBe('Visible to 3 groups only')
    expect(describeRule(rule('only'), names)).toBe('Hidden from everyone until you pick who sees it')
    expect(describeRule(rule('except'), names)).toBe('Visible to everyone')
  })

  test('only a rule that hides the action from someone counts as restricted', () => {
    expect(isRestricted(undefined)).toBe(false)
    expect(isRestricted(rule('everyone'))).toBe(false)
    expect(isRestricted(rule('except'))).toBe(false)
    expect(isRestricted(rule('except', { userIds: ['u2'] }))).toBe(true)
    expect(isRestricted(rule('only'))).toBe(true)
    expect(isRestricted(rule('nobody'))).toBe(true)
  })

  test('the form gets a rule per action and never shares arrays with its source', () => {
    const source = { filter: rule('only', { roles: ['guest'] }) }
    const settings = editableSettings(source)
    expect(settings.search).toEqual(emptyRule())
    settings.filter.roles.push('member')
    expect(source.filter.roles).toEqual(['guest'])
  })
})
