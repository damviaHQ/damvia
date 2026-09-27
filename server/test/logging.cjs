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
// What the logger writes for errors from the database driver.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { Writable } = require('node:stream')
const winston = require('winston')
const env = require('./lib/offline.cjs')

test('logged errors keep the database message and code, nested included', () => {
    const driverError = Object.assign(new Error('deadlock detected'), { code: '40P01', detail: 'Process 1 waits for ShareLock' })
    const queryError = Object.assign(new Error('deadlock detected'), { name: 'QueryFailedError', code: '40P01', query: 'UPDATE "asset_files" SET 1', driverError })
    const at = new Date('2026-09-21T12:00:00Z')
    const lines = []
    const transport = new winston.transports.Stream({ stream: new Writable({ write(chunk, _, done) { lines.push(chunk.toString()); done() } }) })
    const silent = env.logger.silent
    env.logger.add(transport)
    env.logger.silent = false
    try {
        env.logger.error('failed to update assets', { source: 'dropbox', error: queryError, at, list: [driverError] })
    } finally {
        env.logger.remove(transport)
        env.logger.silent = silent
    }
    assert.equal(lines.length, 1)
    const logged = JSON.parse(lines[0].slice(lines[0].indexOf('{')))
    assert.equal(logged.source, 'dropbox')
    assert.equal(logged.error.name, 'QueryFailedError')
    assert.equal(logged.error.message, 'deadlock detected')
    assert.equal(logged.error.code, '40P01')
    assert.equal(logged.error.query, 'UPDATE "asset_files" SET 1')
    assert.equal(logged.at, '2026-09-21T12:00:00.000Z')
    assert.equal(logged.list[0].detail, 'Process 1 waits for ShareLock')
})
