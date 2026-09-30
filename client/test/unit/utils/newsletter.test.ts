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
import { describeAudience, emptyAudience, type AudienceFilter } from '@/utils/newsletter'

const names = {
  groups: new Map([['g1', 'Design'], ['g2', 'Sales']]),
  regions: new Map([['r1', 'Europe'], ['r2', 'Asia']]),
  people: new Map([['u1', 'Ada'], ['u2', 'Grace']]),
}
const filter = (overrides: Partial<AudienceFilter>) => ({ ...emptyAudience(), ...overrides })

describe('describeAudience', () => {
  test('nothing chosen reaches nobody', () => {
    expect(describeAudience(emptyAudience(), names)).toBe('Nobody yet')
  })

  test('everyone, with people left out', () => {
    expect(describeAudience(filter({ everyone: true }), names)).toBe('Everyone')
    expect(describeAudience(filter({ everyone: true, includeUserIds: ['u1'], excludeUserIds: ['u2'] }), names)).toBe('Everyone, except 1 person')
  })

  test('roles, groups and regions read as one group of people', () => {
    expect(describeAudience(filter({ roles: ['guest'] }), names)).toBe('Guests')
    expect(describeAudience(filter({ roles: ['admin', 'guest'], regionIds: ['r1'] }), names)).toBe('Admins or guests in the region Europe')
    expect(describeAudience(filter({ groupIds: ['g1', 'g2'], regionIds: ['r1', 'r2'] }), names)).toBe('People in Design or Sales in the regions Europe or Asia')
  })

  test('people picked by hand are added to the rest or stand alone', () => {
    expect(describeAudience(filter({ includeUserIds: ['u1', 'u2'] }), names)).toBe('2 people')
    expect(describeAudience(filter({ roles: ['member'], includeUserIds: ['u1'], excludeUserIds: ['u2', 'x'] }), names)).toBe('Members, plus 1 person, except 2 people')
  })
})
