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
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'

const parameters = { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 }

function derive(password: string, salt: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        scrypt(password, salt, 64, parameters, (error, key) => error ? reject(error) : resolve(key))
    })
}

export async function hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16).toString('hex')
    const key = await derive(password, salt)
    return `scrypt$${salt}$${key.toString('hex')}`
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
    if (!stored) return false
    if (/^[a-f0-9]{128}$/.test(stored)) {
        const legacy = createHash('sha512').update(password).digest()
        return timingSafeEqual(legacy, Buffer.from(stored, 'hex'))
    }
    const parts = /^scrypt\$([a-f0-9]{32})\$([a-f0-9]{128})$/.exec(stored)
    if (!parts) return false
    return timingSafeEqual(await derive(password, parts[1]), Buffer.from(parts[2], 'hex'))
}

export function hashResetToken(token: string): string {
    return createHash('sha256').update(token).digest('hex')
}

export function validateAppSecret(value: string | undefined): string {
    if (!value || Buffer.byteLength(value.trim()) < 32 || value === 'Damvia App Secret') {
        throw new Error('APP_SECRET must be a randomly generated secret of at least 32 bytes.')
    }
    return value
}
