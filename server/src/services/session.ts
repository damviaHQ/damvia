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
import { FastifyReply, FastifyRequest } from 'fastify'
import { randomBytes } from 'node:crypto'
import { EntityManager } from 'typeorm'
import { SessionMethod, UserSession } from '../entity/user-session'
import { User } from '../entity/user'
import { dataSource, secureCookies, sessionCookieSameSite, sessionIdleHours, sessionMaxHours } from '../env'
import { recordAudit } from './audit'
import { hashToken } from './credentials'

export const SESSION_COOKIE = 'damvia_session'

// Sliding expiry is written at most this often, not on every request.
const TOUCH_INTERVAL_MS = 5 * 60 * 1000

function cookieOptions(maxAgeSeconds: number) {
	const sameSite = sessionCookieSameSite()
	return {
		path: '/',
		httpOnly: true,
		secure: secureCookies() || sameSite === 'none',
		sameSite,
		maxAge: maxAgeSeconds,
	} as const
}

export type CreateSessionOptions = {
	invitationId?: string | null
	em?: EntityManager
}

export async function createSession(req: FastifyRequest, res: FastifyReply, user: User, method: SessionMethod, opts: CreateSessionOptions = {}) {
	const token = randomBytes(32).toString('base64url')
	const now = new Date()
	const userAgent = req.headers['user-agent']
	const session = await (opts.em ?? dataSource.manager).getRepository(UserSession).save({
		userId: user.id,
		tokenHash: hashToken(token),
		method,
		invitationId: opts.invitationId ?? null,
		userAgent: userAgent ? userAgent.slice(0, 255) : null,
		lastSeenAt: now,
		expiresAt: new Date(now.getTime() + sessionMaxHours() * 3600 * 1000),
	})
	await recordAudit(opts.em ?? null, {
		actorId: user.id, action: 'session.created', targetType: 'user', targetId: user.id,
		after: { method, invitationId: opts.invitationId ?? null }, req,
	})
	res.setCookie(SESSION_COOKIE, token, cookieOptions(sessionMaxHours() * 3600))
	return session
}

export type RequestSession = { session: UserSession, user: User }

// A session is valid until its absolute expiry, while it keeps being used
// within the idle timeout, and, when opened from an invitation link, while
// that invitation exists and has not expired.
export async function sessionFromRequest(req: FastifyRequest): Promise<RequestSession | null> {
	const token = req.cookies?.[SESSION_COOKIE]
	if (!token) return null
	const session = await dataSource.getRepository(UserSession).createQueryBuilder('session')
		.innerJoinAndSelect('session.user', 'user')
		.leftJoinAndSelect('user.userGroups', 'userGroup')
		.leftJoinAndSelect('userGroup.group', 'group')
		.leftJoin('session.invitation', 'invitation')
		.where('session.tokenHash = :hash', { hash: hashToken(token) })
		.andWhere('session.expiresAt > now()')
		.andWhere('session.lastSeenAt > now() - make_interval(hours => :idle)', { idle: sessionIdleHours() })
		.andWhere('(session.invitationId IS NULL OR invitation.expiresAt > now())')
		.andWhere('user.suspendedAt IS NULL')
		.getOne()
	if (!session) return null
	if (Date.now() - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
		await dataSource.getRepository(UserSession).update(session.id, { lastSeenAt: new Date() })
	}
	return { session, user: session.user }
}

export function clearSessionCookie(res: FastifyReply) {
	res.clearCookie(SESSION_COOKIE, { ...cookieOptions(0), maxAge: undefined })
}

export async function destroySession(res: FastifyReply, session: UserSession) {
	await dataSource.getRepository(UserSession).delete(session.id)
	clearSessionCookie(res)
}

export async function revokeUserSessions(userId: string, opts: { exceptSessionId?: string, em?: EntityManager } = {}) {
	const query = (opts.em ?? dataSource.manager).getRepository(UserSession).createQueryBuilder()
		.delete().where('user_id = :userId', { userId })
	if (opts.exceptSessionId) query.andWhere('id != :id', { id: opts.exceptSessionId })
	await query.execute()
}

export async function pruneExpiredSessions() {
	await dataSource.query(
		`DELETE FROM user_sessions WHERE expires_at <= now() OR last_seen_at <= now() - make_interval(hours => $1)`,
		[sessionIdleHours()],
	)
	await dataSource.query(`DELETE FROM login_tokens WHERE expires_at <= now() - interval '1 day'`)
}
