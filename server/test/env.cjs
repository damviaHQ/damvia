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
// Configuration parsing: sizes, mounted secrets and transport warnings.
// See docs/reference/environment-variables.md.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const env = require('./lib/offline.cjs')
const { loadFileVariables } = require('../dist/load-env')
const { transportWarnings } = require('../dist/services/security-checks')

test('STORAGE_QUOTA accepts decimal sizes and rejects anything else', () => {
    assert.equal(env.parseStorageQuota('1.5TB'), 1500000000000)
    assert.equal(env.parseStorageQuota('1500GB'), 1500000000000)
    assert.equal(env.parseStorageQuota('1500 gb'), 1500000000000)
    assert.equal(env.parseStorageQuota('2000000000000'), 2000000000000)
    assert.equal(env.parseStorageQuota(''), null)
    assert.equal(env.parseStorageQuota(undefined), null)
    for (const value of ['abc', '-5GB', '0', '1.5 TiB', '10GB extra']) assert.throws(() => env.parseStorageQuota(value), /STORAGE_QUOTA/)
})

test('FOO_FILE loads FOO from a mounted secret unless FOO is set', () => {
    const files = { '/run/secrets/app': 'from-file\n', '/run/secrets/smtp': 'smtp-secret\r\n' }
    const environment = { APP_SECRET_FILE: '/run/secrets/app', SMTP_PASS: '', SMTP_PASS_FILE: '/run/secrets/smtp', KEEP: 'set', KEEP_FILE: '/missing', EMPTY_FILE: '' }
    loadFileVariables(environment, path => { if (!(path in files)) throw new Error(`read ${path}`); return files[path] })
    assert.equal(environment.APP_SECRET, 'from-file')
    assert.equal(environment.SMTP_PASS, 'smtp-secret')
    assert.equal(environment.KEEP, 'set')
    assert.equal(environment.EMPTY, undefined)
})

test('insecure transport is reported at startup', () => {
    const safe = { NODE_ENV: 'production', APP_URL: 'https://dam.example.com', API_URL: 'https://api.dam.example.com', MAIN_S3_URL: 'https://k:s@s3.example.com/a', ASSETS_S3_URL: 'http://k:s@localhost:9000/b', SMTP_HOST: 'smtp.example.com', SMTP_REQUIRE_TLS: 'true' }
    assert.deepEqual(transportWarnings(safe), [])
    assert.deepEqual(transportWarnings({ ...safe, SMTP_REQUIRE_TLS: undefined, SMTP_PORT: '465' }), [])
    const warnings = transportWarnings({ ...safe, API_URL: 'http://api.dam.example.com', MAIN_S3_URL: 'http://k:s@minio.internal:9000/a', SMTP_REQUIRE_TLS: undefined })
    assert.equal(warnings.length, 3)
    assert.match(warnings[0], /^API_URL is not HTTPS/)
    assert.match(warnings[1], /^MAIN_S3_URL is not HTTPS/)
    assert.match(warnings[2], /SMTP_REQUIRE_TLS/)
    assert.deepEqual(transportWarnings({ APP_URL: 'http://dam.example.com', SMTP_HOST: 'localhost' }), [], 'development is quiet')
})
