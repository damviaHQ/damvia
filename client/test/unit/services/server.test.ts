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
import { TRPCClientError } from '@trpc/client'
import { describe, expect, test } from 'vitest'
import { extractErrors } from '@/services/server.ts'

describe('extractErrors', () => {
  test('plain errors carry the message and no field errors', () => {
    expect(extractErrors(new Error('boom'))).toEqual({ message: 'boom', fieldErrors: {} })
  })

  test('tRPC field errors keep the first message per field', () => {
    const error = new TRPCClientError('Invalid input', { result: { error: { code: -32600, message: 'Invalid input', data: { fieldErrors: { name: ['Required', 'Too short'], email: ['Invalid email'] } } } } })
    expect(extractErrors(error)).toEqual({ message: 'Invalid input', fieldErrors: { name: 'Required', email: 'Invalid email' } })
  })

  test('tRPC errors without field data yield no field errors', () => {
    const error = new TRPCClientError('Unauthorized', { result: { error: { code: -32001, message: 'Unauthorized', data: { code: 'UNAUTHORIZED' } } } })
    expect(extractErrors(error)).toEqual({ message: 'Unauthorized', fieldErrors: {} })
  })
})
