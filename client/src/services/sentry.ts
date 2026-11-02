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
import * as Sentry from "@sentry/vue"
import type { Breadcrumb, Event } from "@sentry/vue"
import { TRPCClientError } from "@trpc/client"
import type { App } from "vue"
import type { Router } from "vue-router"
import { apiBase } from "./server"

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,}/gi
const URL_IN_TEXT = /\bhttps?:\/\/[^\s"'<>]+/gi

// Query strings carry sign-in codes, invitation tokens and the signatures of
// presigned uploads: addresses keep their path only.
export function scrubUrl(value: string): string {
	return value.split(/[?#]/)[0]
}

export function scrubText(value: string): string {
	return value.replace(URL_IN_TEXT, scrubUrl).replace(EMAIL, "[email]")
}

function scrubData(data: Record<string, unknown> | undefined) {
	if (!data) return
	for (const [key, value] of Object.entries(data)) {
		if (/query|fragment/i.test(key)) delete data[key]
		else if (typeof value === "string") data[key] = scrubText(key === "from" || key === "to" || /url/i.test(key) ? scrubUrl(value) : value)
	}
}

export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
	if (breadcrumb.message) breadcrumb.message = scrubText(breadcrumb.message)
	// The message says what was logged; the logged values can be anything.
	if (breadcrumb.category === "console") delete breadcrumb.data
	scrubData(breadcrumb.data)
	return breadcrumb
}

export function scrubEvent<T extends Event>(event: T): T {
	if (event.request) {
		event.request = { url: event.request.url && scrubUrl(event.request.url), headers: event.request.headers?.["User-Agent"] ? { "User-Agent": event.request.headers["User-Agent"] } : undefined }
	}
	// Only the account id: the person is found in Damvia, not in the error tracker.
	event.user = event.user?.id ? { id: event.user.id } : undefined
	if (event.message) event.message = scrubText(event.message)
	for (const exception of event.exception?.values ?? []) {
		if (exception.value) exception.value = scrubText(exception.value)
	}
	scrubData(event.contexts?.trace?.data as Record<string, unknown> | undefined)
	for (const span of event.spans ?? []) {
		if (span.description) span.description = scrubText(span.description)
		scrubData(span.data)
	}
	for (const breadcrumb of event.breadcrumbs ?? []) scrubBreadcrumb(breadcrumb)
	return event
}

// The API reports the errors it answers with; a call that never got an answer
// is the network's. Either way the browser has nothing to add.
export function reportable(error: unknown) {
	return !(error instanceof TRPCClientError)
}

type Integration = ReturnType<typeof Sentry.browserTracingIntegration>

export function sentryOptions(env: Record<string, string | undefined>, app?: App, tracingIntegration?: Integration): NonNullable<Parameters<typeof Sentry.init>[0]> {
	const rate = Number(env.VITE_SENTRY_TRACES_SAMPLE_RATE || 0)
	const tracing = Number.isFinite(rate) && rate > 0 && rate <= 1 && tracingIntegration !== undefined
	return {
		app,
		dsn: env.VITE_SENTRY_DSN,
		environment: env.VITE_SENTRY_ENVIRONMENT || env.MODE,
		release: env.VITE_SENTRY_RELEASE || undefined,
		// Through the API, which passes the reports on: see the server's monitoring-tunnel.ts.
		tunnel: env.VITE_SENTRY_TUNNEL === "false" ? undefined : `${apiBase}/v1/monitoring`,
		// Component props hold names, emails and records.
		attachProps: false,
		// The user agent tells the tracker which browser failed.
		dataCollection: { userInfo: false, cookies: false, httpHeaders: { request: { allow: ["User-Agent"] }, response: false }, httpBodies: [], urlQueryParams: false },
		// SDK 11 streams spans by default; GlitchTip reads whole transactions.
		traceLifecycle: "static",
		tracesSampleRate: tracing ? rate : undefined,
		tracePropagationTargets: tracing ? [apiBase] : [],
		// No release health sessions: they count visits, which Damvia does not track.
		integrations: (defaults) => [
			...defaults.filter((integration) => integration.name !== "BrowserSession"),
			...(tracing ? [tracingIntegration] : []),
		],
		beforeSend: (event, hint) => reportable(hint.originalException) ? scrubEvent(event) : null,
		beforeSendTransaction: scrubEvent,
		beforeBreadcrumb: scrubBreadcrumb,
	}
}

export function startSentry(app: App, router: Router) {
	// Read here rather than from the options' env, so that a build without the
	// variable leaves the tracing code out.
	const tracingIntegration = import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE ? Sentry.browserTracingIntegration({ router }) : undefined
	Sentry.init(sentryOptions(import.meta.env, app, tracingIntegration))
	return {
		setUser: (id: string | null) => Sentry.setUser(id ? { id } : null),
		captureException: (error: unknown) => Sentry.captureException(error),
	}
}
