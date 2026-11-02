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
import type { FastifyInstance } from 'fastify'
import { MonitoringSettings, monitoringSettings, projectOfDsn } from './monitoring'
import { hit } from './services/rate-limit'

const MAX_ENVELOPE_BYTES = 1024 * 1024

// The client sends its error reports here rather than straight to the error
// tracker: its Content Security Policy needs no new host, blockers leave the
// reports alone, and the tracker never sees the address of the people using
// Damvia. Only reports for a project of the server's own tracker are passed
// on, so the route cannot be used to post anywhere else.
export function registerMonitoringTunnel(server: FastifyInstance, settings: MonitoringSettings | null = monitoringSettings(), send: typeof fetch = fetch) {
	if (!settings) return
	const tracker = projectOfDsn(settings.dsn)!
	server.register(async (scope) => {
		// The browser posts the envelope as text/plain, or without a type.
		scope.removeAllContentTypeParsers()
		scope.addContentTypeParser('*', { parseAs: 'buffer', bodyLimit: MAX_ENVELOPE_BYTES }, (_req, body, done) => done(null, body))
		scope.post('/v1/monitoring', async (req, res) => {
			if (!hit(`monitoring:${req.ip}`, 120, 60 * 1000)) return res.code(429).send()
			const project = Buffer.isBuffer(req.body) ? projectOfEnvelope(req.body) : null
			if (!project || project.origin !== tracker.origin || project.path !== tracker.path) return res.code(400).send()
			const url = `${project.origin}${project.path}/api/${project.projectId}/envelope/?sentry_version=7&sentry_key=${encodeURIComponent(project.key)}`
			const reply = await send(url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-sentry-envelope' },
				body: req.body as Buffer,
				redirect: 'error',
				signal: AbortSignal.timeout(10_000),
			}).catch(() => null)
			if (!reply) return res.code(502).send()
			// The SDK slows down when the tracker asks it to.
			res.header('Access-Control-Expose-Headers', 'Retry-After, X-Sentry-Rate-Limits')
			for (const name of ['retry-after', 'x-sentry-rate-limits']) {
				const value = reply.headers.get(name)
				if (value) res.header(name, value)
			}
			return res.code(reply.status).send()
		})
	})
}

// The first line of an envelope is a JSON header naming the DSN it is for.
function projectOfEnvelope(body: Buffer) {
	const end = body.indexOf(0x0a)
	try {
		const dsn = JSON.parse(body.subarray(0, end === -1 ? body.length : end).toString('utf8'))?.dsn
		return typeof dsn === 'string' ? projectOfDsn(dsn) : null
	} catch {
		return null
	}
}
