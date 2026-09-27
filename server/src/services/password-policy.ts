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
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { logger, passwordBreachCheck } from '../env'

export const PASSWORD_MIN_LENGTH = 12
export const PASSWORD_MAX_LENGTH = 128

export const newPasswordSchema = z.string()
	.min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters.`)
	.max(PASSWORD_MAX_LENGTH, `Use at most ${PASSWORD_MAX_LENGTH} characters.`)

// Asks Have I Been Pwned whether the password appears in a known breach,
// sending only the first five characters of its SHA-1 (k-anonymity). The
// check fails open: an unreachable service does not block a password change.
export async function passwordIsBreached(password: string, fetcher: typeof fetch = fetch): Promise<boolean> {
	const hash = createHash('sha1').update(password).digest('hex').toUpperCase()
	const prefix = hash.slice(0, 5)
	const suffix = hash.slice(5)
	try {
		const response = await fetcher(`https://api.pwnedpasswords.com/range/${prefix}`, {
			headers: { 'Add-Padding': 'true' },
			signal: AbortSignal.timeout(3000),
		})
		if (!response.ok) throw new Error(`HTTP ${response.status}`)
		const body = await response.text()
		return body.split('\n').some((line) => {
			const [candidate, count] = line.trim().split(':')
			return candidate === suffix && Number(count) > 0
		})
	} catch (error) {
		logger.warn('password.breach-check-unavailable', { error })
		return false
	}
}

export async function assertAcceptablePassword(password: string, email: string) {
	if (password.trim().toLowerCase() === email.trim().toLowerCase()) {
		throw new TRPCError({ code: 'BAD_REQUEST', message: 'Your password cannot be your email address.' })
	}
	if (passwordBreachCheck() && await passwordIsBreached(password)) {
		throw new TRPCError({ code: 'BAD_REQUEST', message: 'This password appears in a known data breach. Choose another one.' })
	}
}
