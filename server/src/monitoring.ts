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
import './load-env'
import type * as SentryNode from '@sentry/node'
import type { Breadcrumb, Event, NodeOptions } from '@sentry/node'
import type { FastifyInstance } from 'fastify'
import { maskedPath } from './util/request-path'

// Errors go to any service that speaks the Sentry protocol: GlitchTip, a
// self-hosted Sentry or sentry.io. Without SENTRY_DSN the SDK is never loaded
// and nothing leaves the server. index.ts imports this file first, so the SDK
// instruments http, Fastify and pg before they are loaded.

export type MonitoringSettings = {
	dsn: string
	environment: string
	release?: string
	tracesSampleRate?: number
}

export function parseMonitoringSettings(environment: NodeJS.ProcessEnv): MonitoringSettings | null {
	const dsn = environment.SENTRY_DSN?.trim()
	if (!dsn) return null
	if (!projectOfDsn(dsn)) {
		throw new Error('SENTRY_DSN must be the DSN of a project, such as https://key@glitchtip.example.com/1.')
	}
	const rawRate = environment.SENTRY_TRACES_SAMPLE_RATE?.trim()
	const rate = rawRate ? Number(rawRate) : 0
	if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
		throw new Error('SENTRY_TRACES_SAMPLE_RATE must be a number between 0 and 1.')
	}
	return {
		dsn,
		environment: environment.SENTRY_ENVIRONMENT?.trim() || environment.NODE_ENV?.trim() || 'development',
		release: environment.SENTRY_RELEASE?.trim() || undefined,
		// Unset rather than 0: a rate of 0 would still continue the traces the browser starts.
		tracesSampleRate: rate > 0 ? rate : undefined,
	}
}

// A DSN is http(s)://public-key@host[/path]/project-id.
export function projectOfDsn(dsn: string): { origin: string, path: string, key: string, projectId: string } | null {
	let url: URL
	try {
		url = new URL(dsn)
	} catch {
		return null
	}
	const segments = url.pathname.split('/')
	const projectId = segments.pop() ?? ''
	if (!['http:', 'https:'].includes(url.protocol) || !url.username || !/^\d+$/.test(projectId)) return null
	return { origin: url.origin, path: segments.join('/'), key: decodeURIComponent(url.username), projectId }
}

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,}/gi
const URL_IN_TEXT = /\bhttps?:\/\/[^\s"'<>]+/gi

// Addresses keep their host and path; the query string (signatures of
// presigned links, sign-in codes) and the secret of tokenised paths go.
export function scrubUrl(value: string): string {
	try {
		const url = new URL(value)
		return `${url.origin}${maskedPath(url.pathname)}`
	} catch {
		return maskedPath(value)
	}
}

export function scrubText(value: string): string {
	return value.replace(URL_IN_TEXT, scrubUrl).replace(EMAIL, '[email]')
}

function scrubData(data: Record<string, unknown> | undefined) {
	if (!data) return
	for (const [key, value] of Object.entries(data)) {
		if (/query|fragment|cookie|authorization/i.test(key)) {
			delete data[key]
		} else if (typeof value === 'string') {
			data[key] = /url|target|route|path/i.test(key) ? scrubUrl(value) : scrubText(value)
		}
	}
}

// Last pass before anything is sent. The SDK is set to collect no body,
// cookie or query string already; this also holds if a default changes.
export function scrubEvent<T extends Event>(event: T): T {
	if (event.request) {
		const userAgent = (event.request.headers as Record<string, string> | undefined)?.['user-agent']
		event.request = {
			method: event.request.method,
			url: event.request.url && scrubUrl(event.request.url),
			headers: userAgent ? { 'user-agent': userAgent } : undefined,
		}
	}
	// Only the account id: the person is found in Damvia, not in the error tracker.
	event.user = event.user?.id ? { id: event.user.id } : undefined
	if (event.message) event.message = scrubText(event.message)
	if (event.logentry?.message) event.logentry.message = scrubText(event.logentry.message)
	for (const exception of event.exception?.values ?? []) {
		if (exception.value) exception.value = scrubText(exception.value)
	}
	if (event.transaction) event.transaction = scrubTransactionName(event.transaction)
	scrubData(event.contexts?.trace?.data as Record<string, unknown> | undefined)
	for (const span of event.spans ?? []) {
		if (span.description) span.description = scrubText(span.description)
		scrubData(span.data)
	}
	for (const breadcrumb of event.breadcrumbs ?? []) scrubBreadcrumb(breadcrumb)
	return event
}

function scrubTransactionName(name: string): string {
	const [, method, path] = /^([A-Z]+) (\/.*)$/.exec(name) ?? []
	return method ? `${method} ${maskedPath(path)}` : scrubText(name)
}

export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
	if (breadcrumb.message) breadcrumb.message = scrubText(breadcrumb.message)
	scrubData(breadcrumb.data)
	return breadcrumb
}

export function sentryOptions(settings: MonitoringSettings): NodeOptions {
	const tracker = projectOfDsn(settings.dsn)!
	const forwarded = `${tracker.origin}${tracker.path}/api/`
	return {
		dsn: settings.dsn,
		environment: settings.environment,
		release: settings.release,
		dataCollection: {
			userInfo: false,
			cookies: false,
			httpHeaders: { request: { allow: ['user-agent'] }, response: false },
			// Request bodies carry passwords and personal data.
			httpBodies: [],
			urlQueryParams: false,
		},
		// SDK 11 streams spans by default; GlitchTip reads whole transactions.
		traceLifecycle: 'static',
		tracesSampleRate: settings.tracesSampleRate,
		// Local variables can hold passwords and personal data. Console lines
		// are the log's, which reaches the reports through reportLog below.
		integrations: (defaults) => defaults.filter((integration) => !['LocalVariables', 'LocalVariablesAsync', 'Console'].includes(integration.name)),
		// The browser's reports pass through the API on their way to the tracker.
		ignoreSpans: ['/v1/monitoring'],
		beforeSend: scrubEvent,
		beforeSendTransaction: scrubEvent,
		beforeBreadcrumb: (breadcrumb) => String(breadcrumb.data?.url ?? '').startsWith(forwarded) ? null : scrubBreadcrumb(breadcrumb),
	}
}

const settings = parseMonitoringSettings(process.env)
let sentry: typeof SentryNode | null = null
if (settings) {
	sentry = require('@sentry/node') as typeof SentryNode
	sentry.init(sentryOptions(settings))
}

export function monitoringSettings(): MonitoringSettings | null {
	return settings
}

export function reportError(error: unknown, context?: { tags: Record<string, string> }) {
	sentry?.captureException(error, context)
}

// Before process.exit(), which would drop the events still being sent.
export async function flushMonitoring() {
	await sentry?.flush(5000)
}

export function monitorFastify(server: FastifyInstance) {
	sentry?.setupFastifyErrorHandler(server)
}

// The SDK gives each request its own scope: what is set here stays on the events of that request.
export function tagRequest(requestId: string) {
	sentry?.getIsolationScope().setTag('request_id', requestId)
}

export function identifyUser(user: { id: string, role: string } | null) {
	if (!sentry || !user) return
	const scope = sentry.getIsolationScope()
	scope.setUser({ id: user.id })
	scope.setTag('role', user.role)
}

export function nameProcedure(path: string) {
	if (!sentry) return
	sentry.getIsolationScope().setTag('procedure', path)
	const span = sentry.getActiveSpan()
	if (span) sentry.updateSpanName(sentry.getRootSpan(span), `trpc ${path}`)
}

export function withMonitoringScope<T>(tags: Record<string, string>, callback: () => T): T {
	if (!sentry) return callback()
	return sentry.withIsolationScope((scope) => {
		scope.setTags(tags)
		return callback()
	})
}

// Lines that are reported on their own, or would only repeat what every report has.
const UNREPORTED_LOGS = new Set(['http.response', 'http.request', 'audit', 'job'])
const UNREPORTED_FIELDS = new Set(['level', 'message', 'timestamp', 'stack', 'stacktrace', 'ip', 'userAgent'])

// The log feeds the reports: a logged error comes with its stack, the other
// lines become the breadcrumbs that show what happened before it.
export function reportLog(info: Record<string, unknown>) {
	if (!sentry) return
	const message = String(info.message ?? '')
	// logger.error(error) logs the error itself; logger.error('message', { error }) carries it.
	const logsError = info instanceof Error
	const error = logsError ? info : Object.values(info).find((value) => value instanceof Error)
	const details: Record<string, string | number | boolean> = {}
	for (const [key, value] of Object.entries(info)) {
		if (UNREPORTED_FIELDS.has(key)) continue
		if (typeof value === 'string') details[key] = scrubText(value)
		else if (typeof value === 'number' || typeof value === 'boolean') details[key] = value
	}
	if (info.level === 'error' && error) {
		sentry.captureException(error, {
			tags: logsError ? undefined : { log: message.slice(0, 200) },
			contexts: { log: details },
		})
		return
	}
	if (UNREPORTED_LOGS.has(message) || !['error', 'warn', 'info'].includes(String(info.level))) return
	sentry.addBreadcrumb({ category: 'log', level: info.level === 'warn' ? 'warning' : info.level as 'error' | 'info', message, data: details })
}
