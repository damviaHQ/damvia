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
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { setup, teardown, server } = require('./lib/helpers.cjs')

before(setup)
after(teardown)

// Input validation errors must reach the HTTP client as a stable shape:
// message "Invalid request." plus data.fieldErrors keyed by input field,
// each value a list of messages. The client renders the first message of
// each field (client/src/services/server.ts extractErrors). createCaller
// bypasses the tRPC errorFormatter, so this goes through Fastify.
test('validation errors expose fieldErrors over HTTP', async () => {
    const response = await server.inject({
        method: 'POST',
        url: '/trpc/user.login',
        payload: { email: 'not-an-email', password: 42 },
    })
    assert.equal(response.statusCode, 400)
    const body = response.json()
    assert.equal(body.error.message, 'Invalid request.')
    const fieldErrors = body.error.data.fieldErrors
    assert.deepEqual(Object.keys(fieldErrors).sort(), ['email', 'password'])
    for (const messages of Object.values(fieldErrors)) {
        assert(Array.isArray(messages) && messages.length > 0 && typeof messages[0] === 'string')
    }
})

test('valid input is not reported as a validation error', async () => {
    const response = await server.inject({
        method: 'POST',
        url: '/trpc/user.login',
        payload: { email: 'nobody@example.test', password: 'wrong-password' },
    })
    assert.notEqual(response.json().error?.message, 'Invalid request.')
    assert.equal(response.json().error?.data?.fieldErrors, undefined)
})
