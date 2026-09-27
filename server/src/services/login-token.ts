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
import { randomBytes } from 'node:crypto'
import { LoginToken, LoginTokenPurpose } from '../entity/login-token'
import { dataSource } from '../env'
import { hashToken } from './credentials'

const lifetimes: Record<LoginTokenPurpose, number> = {
	[LoginTokenPurpose.LOGIN]: 10 * 60 * 1000,
	[LoginTokenPurpose.APPROVED]: 7 * 24 * 3600 * 1000,
}

export async function createLoginToken(userId: string, purpose: LoginTokenPurpose): Promise<string> {
	const token = randomBytes(32).toString('base64url')
	await dataSource.getRepository(LoginToken).insert({
		userId,
		purpose,
		tokenHash: hashToken(token),
		expiresAt: new Date(Date.now() + lifetimes[purpose]),
	})
	return token
}

// Marks the token used and returns its user id, or null when the token is
// unknown, expired or already used. The update is the check, so two
// concurrent exchanges of one link cannot both succeed.
export async function consumeLoginToken(token: string): Promise<string | null> {
	const [rows] = await dataSource.query(
		`UPDATE login_tokens SET used_at = now()
		WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
		RETURNING user_id`,
		[hashToken(token)],
	)
	return rows[0]?.user_id ?? null
}
