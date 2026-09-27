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
import { FastifyRequest } from 'fastify'
import { EntityManager } from 'typeorm'
import { auditLogIp, auditLogStream, auditRetentionDays, dataSource, logger } from '../env'

export type AuditEntry = {
	actorId: string | null
	action: string
	targetType: string
	targetId?: string | null
	before?: unknown
	after?: unknown
	req?: FastifyRequest
}

const SENSITIVE_KEY = /pass|token|secret|code|challenge|authorization|cookie/i

// Values are recorded as given, minus anything that could sign someone in,
// and bounded so one entry cannot grow without limit.
export function redact(value: unknown, depth = 0): unknown {
	if (value === null || value === undefined) return value ?? null
	if (typeof value === 'string') return value.length > 2000 ? `${value.slice(0, 2000)}…` : value
	if (typeof value !== 'object') return value
	if (value instanceof Date) return value.toISOString()
	if (depth >= 6) return '…'
	if (Array.isArray(value)) {
		const items = value.slice(0, 200).map((item) => redact(item, depth + 1))
		return value.length > 200 ? [...items, `… ${value.length - 200} more`] : items
	}
	return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) =>
		[key, SENSITIVE_KEY.test(key) ? '[redacted]' : redact(item, depth + 1)]))
}

// Written in the caller's transaction when one is given, so an action and its
// record commit or roll back together. A failure to record fails the action.
export async function recordAudit(em: EntityManager | null, entry: AuditEntry) {
	const ip = entry.req && auditLogIp() ? entry.req.ip ?? null : null
	const agent = entry.req && auditLogIp() ? entry.req.headers?.['user-agent']?.slice(0, 255) ?? null : null
	const before = entry.before === undefined ? null : JSON.stringify(redact(entry.before))
	const after = entry.after === undefined ? null : JSON.stringify(redact(entry.after))
	await (em ?? dataSource.manager).query(
		`INSERT INTO audit_log (actor_id, actor_label, action, target_type, target_id, before, after, ip, user_agent)
		VALUES ($1, (SELECT email FROM users WHERE id = $1), $2, $3, $4, $5, $6, $7, $8)`,
		[entry.actorId, entry.action, entry.targetType, entry.targetId ?? null, before, after, ip, agent],
	)
	if (auditLogStream()) {
		logger.info('audit', {
			actorId: entry.actorId, action: entry.action, targetType: entry.targetType, targetId: entry.targetId ?? null,
			before: before && JSON.parse(before), after: after && JSON.parse(after), ip,
		})
	}
}

export async function pruneAuditLog(): Promise<number> {
	const days = auditRetentionDays()
	if (days === null) return 0
	return dataSource.transaction(async (em) => {
		await em.query(`SET LOCAL damvia.audit_prune = 'on'`)
		const [, removed] = await em.query(`DELETE FROM audit_log WHERE created_at < now() - make_interval(days => $1)`, [days])
		logger.info('audit.pruned', { removed })
		return removed as number
	})
}
