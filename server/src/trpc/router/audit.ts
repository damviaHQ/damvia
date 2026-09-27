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
import { z } from 'zod'
import { dataSource } from '../../env'
import { recordAudit } from '../../services/audit'
import { authMiddleware, publicProcedure, router, userAdmin } from '../index'

const filters = z.object({
	actor: z.string().max(200).optional(),
	action: z.string().max(100).optional(),
	targetType: z.string().max(50).optional(),
	targetId: z.string().max(255).optional(),
	from: z.coerce.date().optional(),
	to: z.coerce.date().optional(),
})

type Filters = z.infer<typeof filters>

function where(input: Filters): { sql: string, params: unknown[] } {
	const clauses: string[] = []
	const params: unknown[] = []
	const add = (clause: string, value: unknown) => {
		params.push(value)
		clauses.push(clause.replace('?', `$${params.length}`))
	}
	if (input.actor) add(`audit.actor_label ILIKE '%' || ? || '%'`, input.actor)
	if (input.action) add('audit.action = ?', input.action)
	if (input.targetType) add('audit.target_type = ?', input.targetType)
	if (input.targetId) add('audit.target_id = ?', input.targetId)
	if (input.from) add('audit.created_at >= ?', input.from)
	if (input.to) add('audit.created_at < ?', input.to)
	return { sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params }
}

// A user target shows the account's current email next to its id.
const select = `
	SELECT audit.id, audit.created_at AS "createdAt", audit.actor_id AS "actorId", audit.actor_label AS "actorLabel",
		audit.action, audit.target_type AS "targetType", audit.target_id AS "targetId",
		CASE WHEN audit.target_type = 'user' THEN target.email END AS "targetLabel",
		audit.before, audit.after, audit.ip, audit.user_agent AS "userAgent"
	FROM audit_log audit
	LEFT JOIN users target ON audit.target_type = 'user' AND target.id::text = audit.target_id`

function csvCell(value: unknown) {
	const text = value === null || value === undefined ? '' : value instanceof Date ? value.toISOString()
		: typeof value === 'object' ? JSON.stringify(value) : String(value)
	const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
	return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export default router({
	list: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(filters.extend({ page: z.number().int().min(1).default(1), pageSize: z.number().int().min(1).max(100).default(50) }))
		.query(async ({ input }) => {
			const { sql, params } = where(input)
			const [items, [{ count }]] = await Promise.all([
				dataSource.query(`${select} ${sql} ORDER BY audit.created_at DESC, audit.id LIMIT ${input.pageSize} OFFSET ${(input.page - 1) * input.pageSize}`, params),
				dataSource.query(`SELECT count(*)::int AS count FROM audit_log audit ${sql}`, params),
			])
			return { items, total: count as number }
		}),
	actions: publicProcedure
		.use(authMiddleware(userAdmin))
		.query(async () => {
			const rows: { action: string }[] = await dataSource.query('SELECT DISTINCT action FROM audit_log ORDER BY action')
			return rows.map((row) => row.action)
		}),
	// Up to 50,000 entries matching the filters, newest first.
	export: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(filters)
		.mutation(async ({ ctx, input }) => {
			const { sql, params } = where(input)
			const rows = await dataSource.query(`${select} ${sql} ORDER BY audit.created_at DESC, audit.id LIMIT 50000`, params)
			await recordAudit(null, { actorId: ctx.user.id, action: 'audit.exported', targetType: 'audit_log', after: { filters: input, rows: rows.length }, req: ctx.req })
			const columns = ['createdAt', 'actorLabel', 'actorId', 'action', 'targetType', 'targetId', 'targetLabel', 'before', 'after', 'ip', 'userAgent']
			return [columns, ...rows.map((row: Record<string, unknown>) => columns.map((column) => row[column]))]
				.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n'
		}),
})
