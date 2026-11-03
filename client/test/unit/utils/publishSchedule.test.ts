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
import { localInput, publishTimeProblem } from '@/utils/publishSchedule'

describe('publish schedule', () => {
  test('a time goes to a datetime-local value and back, to the minute, in the local zone', () => {
    const at = new Date('2030-03-01T09:00:00.000Z')
    const value = localInput(at)
    expect(value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
    expect(new Date(value).getTime()).toBe(at.getTime())
    expect(localInput(at.toISOString())).toBe(value)
  })

  test('a time must be picked and lie ahead', () => {
    const now = new Date('2030-01-01T12:00:00').getTime()
    expect(publishTimeProblem('', now)).toMatch(/Pick the date and time/)
    expect(publishTimeProblem('2030-01-01T12:00', now)).toMatch(/in the future/)
    expect(publishTimeProblem('2029-12-31T23:59', now)).toMatch(/in the future/)
    expect(publishTimeProblem('2030-01-01T12:01', now)).toBeNull()
  })
})
