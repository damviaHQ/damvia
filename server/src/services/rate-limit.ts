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
import { TRPCError } from '@trpc/server'

// Fixed-window counters kept in process memory. Damvia runs one API process
// per instance; a restart resets the counters, which only relaxes the limit
// briefly. Per-account lockout is stored on the user and survives restarts.
const windows = new Map<string, { count: number, resetAt: number }>()

function sweep(now: number) {
	for (const [key, window] of windows) {
		if (window.resetAt <= now) windows.delete(key)
	}
}

// Counts one attempt and returns false once the key is over its limit.
export function hit(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
	if (windows.size > 10000) sweep(now)
	const window = windows.get(key)
	if (!window || window.resetAt <= now) {
		windows.set(key, { count: 1, resetAt: now + windowMs })
		return true
	}
	window.count++
	return window.count <= limit
}

export function enforce(key: string, limit: number, windowMs: number) {
	if (!hit(key, limit, windowMs)) {
		throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Too many attempts. Please wait a few minutes and try again.' })
	}
}

export function resetRateLimits() {
	windows.clear()
}

// Consecutive failed sign-ins lock the account for 1, 2, 4… minutes after the
// fifth, capped at an hour.
export const LOCKOUT_THRESHOLD = 5

export function lockoutMinutes(failedCount: number): number {
	if (failedCount < LOCKOUT_THRESHOLD) return 0
	return Math.min(60, 2 ** (failedCount - LOCKOUT_THRESHOLD))
}
