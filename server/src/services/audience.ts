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
import { EntityManager } from "typeorm"
import { z } from "zod"
import { AudienceFilter } from "../entity/audience"
import { UserRole } from "../entity/user"
import { dataSource } from "../env"

const ids = z.array(z.uuid()).max(5000).default([])
export const audienceFilter = z.object({
	everyone: z.boolean().default(false),
	roles: z.array(z.enum(Object.values(UserRole) as [`${UserRole}`, ...`${UserRole}`[]])).max(4).default([]),
	groupIds: ids,
	regionIds: ids,
	includeUserIds: ids,
	excludeUserIds: ids,
}) satisfies z.ZodType<AudienceFilter, any>

export const EMPTY_AUDIENCE: AudienceFilter = { everyone: false, roles: [], groupIds: [], regionIds: [], includeUserIds: [], excludeUserIds: [] }

// Who can receive a newsletter at all, whatever the filter says: an account
// that is approved, verified, not suspended, has not unsubscribed and whose
// address the mail provider has not reported as undeliverable.
export const REACHABLE = 'u.approved AND u.email_verified AND u.suspended_at IS NULL AND u.newsletter_opt_out_at IS NULL AND u.email_bounced_at IS NULL'

// A condition on users aliased `u`, with its values added to `params`.
// A filter with nothing chosen matches nobody, so a slip never mails everyone.
export function audienceCondition(filter: AudienceFilter, params: unknown[]): string {
	const value = (item: unknown) => { params.push(item); return `$${params.length}` }
	let matched = 'TRUE'
	if (!filter.everyone) {
		const criteria: string[] = []
		if (filter.roles.length) criteria.push(`u.role = ANY(${value(filter.roles)}::varchar[])`)
		if (filter.groupIds.length) criteria.push(`EXISTS (SELECT 1 FROM user_groups ug WHERE ug.user_id = u.id AND ug.group_id = ANY(${value(filter.groupIds)}::uuid[]))`)
		if (filter.regionIds.length) criteria.push(`u.region_id = ANY(${value(filter.regionIds)}::uuid[])`)
		matched = criteria.length ? `(${criteria.join(' AND ')})` : 'FALSE'
		if (filter.includeUserIds.length) matched = `(${matched} OR u.id = ANY(${value(filter.includeUserIds)}::uuid[]))`
	}
	const excluded = filter.excludeUserIds.length ? ` AND NOT (u.id = ANY(${value(filter.excludeUserIds)}::uuid[]))` : ''
	return `${REACHABLE} AND ${matched}${excluded}`
}

export async function countAudience(filter: AudienceFilter) {
	const params: unknown[] = []
	const where = audienceCondition(filter, params)
	const [[{ count }], sample] = await Promise.all([
		dataSource.query(`SELECT count(*)::int AS count FROM users u WHERE ${where}`, params),
		dataSource.query(`SELECT u.id, u.name, u.email FROM users u WHERE ${where} ORDER BY lower(u.name), u.id LIMIT 8`, params),
	])
	return { count: count as number, sample: sample as { id: string, name: string, email: string }[] }
}

// Freezes the list when sending starts: people who join or leave the audience
// afterwards are not added or taken off.
export async function snapshotRecipients(em: EntityManager, newsletterId: string, filter: AudienceFilter): Promise<number> {
	const params: unknown[] = [newsletterId]
	const where = audienceCondition(filter, params)
	const [{ count }] = await em.query(`
		WITH inserted AS (
			INSERT INTO newsletter_recipients (newsletter_id, user_id, email, name)
			SELECT $1, u.id, u.email, u.name FROM users u WHERE ${where}
			ON CONFLICT (newsletter_id, user_id) DO NOTHING
			RETURNING 1
		)
		SELECT count(*)::int AS count FROM inserted
	`, params)
	return count
}
