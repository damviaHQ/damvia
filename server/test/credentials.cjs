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
// Password hashing, reset tokens and the app secret.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createHash } = require('node:crypto')
require('./lib/offline.cjs')
const credentials = require('../dist/services/credentials')

test('passwords are hashed with a fresh salt and verified in constant-time form', async () => {
    const password = 'fixture-password'
    const first = await credentials.hashPassword(password)
    const second = await credentials.hashPassword(password)
    assert.notEqual(first, second)
    assert.match(first, /^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/)
    assert.equal(await credentials.verifyPassword(password, first), true)
    assert.equal(await credentials.verifyPassword('wrong', first), false)
    assert.equal(await credentials.verifyPassword(password, null), false)
    assert.equal(await credentials.verifyPassword(password, 'scrypt$invalid'), false)
    assert.equal(await credentials.verifyPassword(password, 'not-a-hash'), false)
})

test('unsalted sha512 hashes from before scrypt no longer verify', async () => {
    const legacy = createHash('sha512').update('legacy-password').digest('hex')
    assert.equal(await credentials.verifyPassword('legacy-password', legacy), false)
})

test('reset tokens are stored as sha256 and the app secret must be long and non-default', () => {
    assert.equal(credentials.hashResetToken('token'), createHash('sha256').update('token').digest('hex'))
    assert.equal(credentials.validateAppSecret('x'.repeat(32)), 'x'.repeat(32))
    for (const value of [undefined, '', '   ', 'short', 'Damvia App Secret', `${'y'.repeat(31)} `]) {
        assert.throws(() => credentials.validateAppSecret(value), /APP_SECRET/)
    }
})
