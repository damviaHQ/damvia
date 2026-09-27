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
import { analyticsRetentionDays, analyticsSearchMode, dataSource, logger } from "../env"

export async function pruneActivityEvents(): Promise<number> {
	const days = analyticsRetentionDays()
	if (days === null) {
		return 0
	}
	const [, removed] = await dataSource.query(`DELETE FROM activity_events WHERE created_at < now() - make_interval(days => $1)`, [days])
	logger.info('activity.pruned', { removed, days })
	return removed
}

// One event per distinct search, not repeated within a minute by the same
// searcher, or by anyone when searches are stored without the searcher.
export async function recordSearchEvent(userId: string, collectionId: string | null, term: string, total: number) {
	const mode = analyticsSearchMode()
	if (mode === 'off') return
	const searcher = mode === 'named' ? userId : null
	await dataSource.query(`
		INSERT INTO activity_events (user_id, type, collection_id, metadata)
		SELECT $1::uuid, 'search', $2, $3::jsonb
		WHERE NOT EXISTS (
			SELECT 1 FROM activity_events
			WHERE user_id IS NOT DISTINCT FROM $1::uuid AND type = 'search' AND metadata ->> 'query' = $4 AND created_at > now() - interval '1 minute'
		)
	`, [searcher, collectionId, JSON.stringify({ query: term, total }), term])
}
