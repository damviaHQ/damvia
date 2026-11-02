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
import type { App } from "vue"
import type { Router } from "vue-router"
import { startSentry } from "./sentry"

// Errors go to any service that speaks the Sentry protocol, such as GlitchTip,
// when the client is built with VITE_SENTRY_DSN. The variable is replaced at
// build time: without it the condition is always false and the build drops
// the SDK.
export const monitoringEnabled = Boolean(import.meta.env.VITE_SENTRY_DSN)

let monitor: ReturnType<typeof startSentry> | null = null

// Before app.mount(), so errors of the first render are reported too.
export function startMonitoring(app: App, router: Router) {
	if (import.meta.env.VITE_SENTRY_DSN) monitor = startSentry(app, router)
}

export function setMonitoringUser(id: string | null) {
	monitor?.setUser(id)
}

// For errors the app catches but did not expect, such as a failed query.
export function reportError(error: unknown) {
	monitor?.captureException(error)
}
