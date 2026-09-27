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
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'
import { Secret, TOTP } from 'otpauth'
import { secret } from '../env'
import { hashToken } from './credentials'

const PERIOD = 30

// TOTP secrets are stored encrypted with a key derived from APP_SECRET, so a
// database dump alone does not reveal them.
function encryptionKey(): Buffer {
	return Buffer.from(hkdfSync('sha256', secret(), 'damvia', 'mfa-secret', 32))
}

export function encryptMfaSecret(base32: string): string {
	const iv = randomBytes(12)
	const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
	const encrypted = Buffer.concat([cipher.update(base32, 'utf8'), cipher.final()])
	return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join(':')
}

export function decryptMfaSecret(stored: string): string {
	const [version, iv, tag, encrypted] = stored.split(':')
	if (version !== 'v1' || !iv || !tag || !encrypted) throw new Error('Unknown MFA secret format')
	const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64url'))
	decipher.setAuthTag(Buffer.from(tag, 'base64url'))
	return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64url')), decipher.final()]).toString('utf8')
}

export function generateMfaSecret(): string {
	return new Secret({ size: 20 }).base32
}

function totp(base32: string, label = '', issuer = '') {
	return new TOTP({ issuer, label, algorithm: 'SHA1', digits: 6, period: PERIOD, secret: Secret.fromBase32(base32) })
}

export function mfaUri(base32: string, email: string, issuer: string): string {
	return totp(base32, email, issuer).toString()
}

// Returns the time step the code belongs to, or null. A step at or before
// `lastStep` is refused so a code cannot be replayed.
export function verifyTotp(base32: string, code: string, lastStep: number | null, now = Date.now()): number | null {
	if (!/^\d{6}$/.test(code)) return null
	const delta = totp(base32).validate({ token: code, timestamp: now, window: 1 })
	if (delta === null) return null
	const step = Math.floor(now / 1000 / PERIOD) + delta
	if (lastStep !== null && step <= lastStep) return null
	return step
}

export function generateRecoveryCodes(): { codes: string[], hashes: string[] } {
	// 80 bits each, written as four groups of five hex digits.
	const codes = Array.from({ length: 10 }, () => randomBytes(10).toString('hex').match(/.{5}/g)!.join('-'))
	return { codes, hashes: codes.map(hashRecoveryCode) }
}

export function hashRecoveryCode(code: string): string {
	return hashToken(code.trim().toLowerCase())
}
