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

// Error reports: what reaches the error tracker, and what never does. A local
// server stands in for GlitchTip and keeps every envelope the SDK sends.
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const http = require('node:http')
const { join } = require('node:path')

const received = []
const tracker = http.createServer((req, res) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => {
        received.push({ url: req.url, body: Buffer.concat(chunks).toString('utf8') })
        res.setHeader('Content-Type', 'application/json')
        res.end('{}')
    })
})

let env, monitoring, server, api, trackerOrigin

before(async () => {
    await new Promise((resolve) => tracker.listen(0, '127.0.0.1', resolve))
    trackerOrigin = `http://127.0.0.1:${tracker.address().port}`
    process.env.SENTRY_DSN = `http://serverkey@127.0.0.1:${tracker.address().port}/7`
    process.env.SENTRY_ENVIRONMENT = 'test'
    env = require('./lib/offline.cjs')
    // Not logger.silent, which would skip the formats that feed the reports.
    for (const transport of env.logger.transports) transport.silent = true
    monitoring = require('../dist/monitoring')
    server = require('../dist/server').default
    await server.listen({ host: '127.0.0.1', port: 0 })
    api = `http://127.0.0.1:${server.server.address().port}`
})

after(async () => {
    await server.close()
    await new Promise((resolve) => tracker.close(resolve))
})

// Built at run time: the reports carry the source lines around each frame,
// and this file must not be what puts an address in them.
const address = (name) => [name, 'example.com'].join('@')

// Each envelope is a header line, then an item header and its payload per item.
function events() {
    return received.flatMap(({ body }) => {
        const lines = body.split('\n')
        const items = []
        for (let index = 1; index + 1 < lines.length; index += 2) {
            const header = JSON.parse(lines[index])
            if (header.type === 'event') items.push(JSON.parse(lines[index + 1]))
        }
        return items
    })
}

async function sent() {
    await monitoring.flushMonitoring()
    return received.map(({ body }) => body).join('\n')
}

test('a server error inside tRPC reaches the tracker with its reference, without the body, cookie or query string', async () => {
    // Without a database the procedure fails; a session cookie would fail
    // earlier, before the request has a context and its reference.
    const reply = await fetch(`${api}/trpc/auth.login?token=query-secret-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: 'other=cookie-secret-value' },
        body: JSON.stringify({ email: address('person'), password: 'hunter2-password' }),
    })
    assert.equal(reply.status, 500)
    const reference = /reference ([^)]+)\)/.exec((await reply.json()).error.message)[1]
    const everything = await sent()
    for (const secret of ['hunter2-password', 'cookie-secret-value', 'query-secret-token', address('person')]) {
        assert(!everything.includes(secret), `${secret} must not reach the tracker`)
    }
    const event = events().find((candidate) => candidate.tags?.request_id === reference)
    assert(event, 'the event carries the reference the user is shown')
    assert.equal(event.tags.procedure, 'auth.login')
    assert.equal(event.environment, 'test')
    assert(event.exception.values.at(-1).stacktrace.frames.length > 0)
    assert.equal(event.request.url.includes('?'), false)
    assert.equal(event.request.cookies, undefined)
    assert.equal(event.request.data, undefined)
    assert.equal(event.user, undefined)
})

test('requests at the same time keep their own reference and user', async () => {
    // All three are tagged before the first one fails: a scope shared across
    // requests would give every report the last request's tags.
    const { default: fastify } = require('fastify')
    const app = fastify()
    monitoring.monitorFastify(app)
    app.addHook('onRequest', async (req) => monitoring.tagRequest(req.id))
    app.get('/fail/:n', async (req) => {
        const n = Number(req.params.n)
        monitoring.identifyUser({ id: `user-${n}`, role: 'member' })
        await new Promise((resolve) => setTimeout(resolve, 60 - n * 20))
        throw new Error(`concurrent failure ${n}`)
    })
    await app.listen({ host: '127.0.0.1', port: 0 })
    const base = `http://127.0.0.1:${app.server.address().port}`
    await Promise.all([1, 2, 3].map(async (n) => assert.equal((await fetch(`${base}/fail/${n}`)).status, 500)))
    await sent()
    await app.close()
    const reportOf = (n) => events().find((event) => event.exception?.values?.some((value) => value.value === `concurrent failure ${n}`))
    for (const n of [1, 2, 3]) {
        assert(reportOf(n), `failure ${n} is reported`)
        assert.deepEqual(reportOf(n).user, { id: `user-${n}` })
        assert.equal(reportOf(n).tags.role, 'member')
    }
    assert.equal(new Set([1, 2, 3].map((n) => reportOf(n).tags.request_id)).size, 3)
})

test('a server error outside tRPC is reported with the token in its address masked', async () => {
    const downloadId = '0d6f7b0e-5c1a-4b7e-9a51-3b2f1c9e8d70'
    const reply = await fetch(`${api}/v1/downloads/${downloadId}`)
    assert.equal(reply.status, 500)
    const everything = await sent()
    assert(!everything.includes(downloadId))
    assert(events().some((event) => event.request?.url?.endsWith('/v1/downloads/:id')))
})

test('a logged error is reported once, with its stack, the log line and no email address', async () => {
    const error = new Error(`listing refused for ${address('owner')}`)
    env.logger.error('failed to update assets', { source: 'dropbox', error })
    monitoring.reportError(error)
    const everything = await sent()
    assert(!everything.includes(address('owner')))
    const reported = events().filter((event) => event.exception?.values?.some((value) => value.value === 'listing refused for [email]'))
    assert.equal(reported.length, 1)
    assert.equal(reported[0].tags.log, 'failed to update assets')
    assert.equal(reported[0].contexts.log.source, 'dropbox')
    assert(reported[0].exception.values[0].stacktrace.frames.length > 0)
})

test('the log lines before an error become its breadcrumbs, request lines excepted', async () => {
    env.logger.info('asset source initialized', { source: 'dropbox', ip: '203.0.113.9' })
    env.logger.info('http.response', { path: '/trpc/user.me', ip: '203.0.113.9' })
    env.logger.error('failed to start asset updater', { error: new Error('breadcrumb check') })
    await sent()
    const event = events().find((candidate) => candidate.exception?.values?.some((value) => value.value === 'breadcrumb check'))
    const messages = event.breadcrumbs.map((breadcrumb) => breadcrumb.message)
    assert(messages.includes('asset source initialized'))
    assert(!messages.includes('http.response'))
    assert(!JSON.stringify(event.breadcrumbs).includes('203.0.113.9'))
})

test('the tunnel passes the browser reports on to a project of the same tracker', async () => {
    const before = received.length
    const envelope = `${JSON.stringify({ dsn: `http://browserkey@127.0.0.1:${tracker.address().port}/8` })}\n{"type":"event"}\n{"message":"from the browser"}\n`
    const reply = await fetch(`${api}/v1/monitoring`, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8', Origin: env.appURL() }, body: envelope })
    assert.equal(reply.status, 200)
    assert.equal(received.length, before + 1)
    assert.equal(received.at(-1).url, '/api/8/envelope/?sentry_version=7&sentry_key=browserkey')
    assert.equal(received.at(-1).body, envelope)
    assert.equal(reply.headers.get('access-control-allow-origin'), env.appURL())
})

test('the tunnel refuses reports for another host and anything that is not an envelope', async () => {
    const before = received.length
    for (const body of [
        `${JSON.stringify({ dsn: 'https://key@tracker.example.org/8' })}\n{}\n{}`,
        `${JSON.stringify({ dsn: `http://key@127.0.0.1:${tracker.address().port}/other/8` })}\n{}\n{}`,
        `${JSON.stringify({ dsn: `${trackerOrigin}/8` })}\n{}\n{}`,
        'not an envelope',
        '',
    ]) {
        const reply = await fetch(`${api}/v1/monitoring`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body })
        assert.equal(reply.status, 400, body)
    }
    assert.equal(received.length, before)
})

test('the tunnel mirrors the rate limits the tracker sets, and works without a content type', async () => {
    const { default: fastify } = require('fastify')
    const { registerMonitoringTunnel } = require('../dist/monitoring-tunnel')
    const calls = []
    const app = fastify()
    registerMonitoringTunnel(app, monitoring.parseMonitoringSettings({ SENTRY_DSN: 'https://serverkey@errors.example.com/glitchtip/7' }), async (url, init) => {
        calls.push({ url, init })
        return new Response(null, { status: 429, headers: { 'Retry-After': '60', 'X-Sentry-Rate-Limits': '60:error:organization' } })
    })
    const payload = Buffer.from(`${JSON.stringify({ dsn: 'https://browser%20key@errors.example.com/glitchtip/8' })}\n{}\n{}`)
    const reply = await app.inject({ method: 'POST', url: '/v1/monitoring', payload })
    assert.equal(reply.statusCode, 429)
    assert.equal(reply.headers['retry-after'], '60')
    assert.equal(reply.headers['x-sentry-rate-limits'], '60:error:organization')
    assert.equal(calls[0].url, 'https://errors.example.com/glitchtip/api/8/envelope/?sentry_version=7&sentry_key=browser%20key')
    assert.equal(calls[0].init.redirect, 'error')
    await app.close()
})

test('settings: DSN and sample rate are checked, the environment follows NODE_ENV', () => {
    assert.equal(monitoring.parseMonitoringSettings({}), null)
    assert.equal(monitoring.parseMonitoringSettings({ SENTRY_DSN: ' ' }), null)
    assert.throws(() => monitoring.parseMonitoringSettings({ SENTRY_DSN: 'glitchtip.example.com' }), /SENTRY_DSN/)
    assert.throws(() => monitoring.parseMonitoringSettings({ SENTRY_DSN: 'https://glitchtip.example.com/1' }), /SENTRY_DSN/)
    assert.throws(() => monitoring.parseMonitoringSettings({ SENTRY_DSN: 'https://key@glitchtip.example.com/1', SENTRY_TRACES_SAMPLE_RATE: '2' }), /SENTRY_TRACES_SAMPLE_RATE/)
    const settings = monitoring.parseMonitoringSettings({ SENTRY_DSN: 'https://key@glitchtip.example.com/1', NODE_ENV: 'production', SENTRY_TRACES_SAMPLE_RATE: '0' })
    assert.deepEqual(settings, { dsn: 'https://key@glitchtip.example.com/1', environment: 'production', release: undefined, tracesSampleRate: undefined })
    const options = monitoring.sentryOptions(settings)
    assert.equal(options.traceLifecycle, 'static')
    assert.deepEqual(options.dataCollection.httpBodies, [])
})

test('addresses lose their query string and secrets, text loses email addresses', () => {
    assert.equal(monitoring.scrubUrl('https://s3.example.com/assets/photo.jpg?X-Amz-Signature=abc&X-Amz-Credential=key'), 'https://s3.example.com/assets/photo.jpg')
    assert.equal(monitoring.scrubUrl('/v1/unsubscribe/abc.def?x=1'), '/v1/unsubscribe/:token')
    assert.equal(monitoring.scrubUrl('https://dam.example.com/v1/email-events/very-secret'), 'https://dam.example.com/v1/email-events/:secret')
    assert.equal(monitoring.scrubText('GET https://s3.example.com/a.jpg?sig=1 failed for jane.doe@example.co.uk'), 'GET https://s3.example.com/a.jpg failed for [email]')
})

test('without SENTRY_DSN the SDK is not even loaded', () => {
    const script = "require(process.argv[1]); console.log(Object.keys(require.cache).some((path) => path.includes('@sentry')))"
    const output = execFileSync(process.execPath, ['-e', script, join(__dirname, '../dist/monitoring.js')], {
        env: { ...process.env, SENTRY_DSN: '', DOTENV_CONFIG_PATH: '/dev/null' },
    })
    assert.equal(output.toString().trim(), 'false')
})
