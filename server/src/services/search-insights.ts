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
import { dataSource } from '../env'

type Range = { from: Date; to: Date }
type DailyRow = {
  term: string
  day: string
  count: string
  zero: string
  current: string
  currentZero: string
}

export async function searchInsights({ from, to }: Range) {
  const previousFrom = new Date(from.getTime() - (to.getTime() - from.getTime()))
  const historyFrom = new Date(
    new Date(from.toISOString().slice(0, 10) + 'T00:00:00Z').getTime() - 7 * 86400000,
  )
  const [terms, daily, [totals]] = await Promise.all([
    dataSource.query(
      `
			SELECT metadata ->> 'query' AS term,
				count(*) FILTER (WHERE created_at >= $1) AS searches,
				count(*) FILTER (WHERE created_at < $1 AND created_at >= $3) AS previous,
				count(DISTINCT user_id) FILTER (WHERE created_at >= $1) AS users,
				coalesce(round(avg((metadata ->> 'total')::int) FILTER (WHERE created_at >= $1)), 0) AS average,
				count(*) FILTER (WHERE created_at >= $1 AND (metadata ->> 'total')::int = 0) AS zero
			FROM activity_events WHERE type = 'search' AND created_at >= $3 AND created_at < $2
				AND nullif(metadata ->> 'query', '') IS NOT NULL
			GROUP BY 1 HAVING count(*) FILTER (WHERE created_at >= $1) > 0
			ORDER BY searches DESC, term
		`,
      [from, to, previousFrom],
    ) as Promise<
      { term: string; searches: string; previous: string; users: string; average: string; zero: string }[]
    >,
    dataSource.query(
      `
			SELECT metadata ->> 'query' AS term, to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
				count(*) AS count, count(*) FILTER (WHERE (metadata ->> 'total')::int = 0) AS zero,
				count(*) FILTER (WHERE created_at >= $3) AS current,
				count(*) FILTER (WHERE created_at >= $3 AND (metadata ->> 'total')::int = 0) AS "currentZero"
			FROM activity_events WHERE type = 'search' AND created_at >= $1 AND created_at < $2
				AND nullif(metadata ->> 'query', '') IS NOT NULL
			GROUP BY 1, 2 ORDER BY 2
		`,
      [historyFrom, to, from],
    ) as Promise<DailyRow[]>,
    dataSource.query(
      `
			SELECT count(*) AS searches, count(DISTINCT user_id) AS users,
				count(*) FILTER (WHERE (metadata ->> 'total')::int = 0) AS zero
			FROM activity_events WHERE type = 'search' AND created_at >= $1 AND created_at < $2
		`,
      [from, to],
    ) as Promise<{ searches: string; users: string; zero: string }[]>,
  ])
  const byTerm = new Map<string, DailyRow[]>()
  const volume = new Map<string, { day: string; count: number; zeroResults: number }>()
  for (const row of daily) {
    if (!byTerm.has(row.term)) byTerm.set(row.term, [])
    byTerm.get(row.term)!.push(row)
    if (Number(row.current) > 0) {
      const item = volume.get(row.day) ?? { day: row.day, count: 0, zeroResults: 0 }
      item.count += Number(row.current)
      item.zeroResults += Number(row.currentZero)
      volume.set(row.day, item)
    }
  }
  const allTerms = terms.map((row) => {
    const history = byTerm.get(row.term) ?? []
    const counts = new Map(history.map((day) => [day.day, Number(day.count)]))
    let spike: { day: string; count: number; baseline: number } | null = null
    for (const day of history.filter((day) => Number(day.current) > 0)) {
      let prior = 0
      for (let offset = 1; offset <= 7; offset++) {
        prior += counts.get(new Date(Date.parse(day.day) - offset * 86400000).toISOString().slice(0, 10)) ?? 0
      }
      const baseline = prior / 7
      const count = Number(day.current)
      if (count >= 5 && count >= baseline * 3 && count - baseline >= 5 && (!spike || count > spike.count)) {
        spike = { day: day.day, count, baseline: Math.round(baseline * 10) / 10 }
      }
    }
    return {
      term: row.term,
      searches: Number(row.searches),
      previousSearches: Number(row.previous),
      users: Number(row.users),
      avgResults: Number(row.average),
      zeroResults: Number(row.zero),
      spike,
    }
  })
  const signals = allTerms
    .filter((row) => row.spike || row.zeroResults >= 3)
    .sort(
      (a, b) =>
        Number(!!b.spike) - Number(!!a.spike) || b.zeroResults - a.zeroResults || b.searches - a.searches,
    )
  return {
    totals: {
      searches: Number(totals.searches),
      users: Number(totals.users),
      zeroResults: Number(totals.zero),
      terms: allTerms.length,
      spikes: allTerms.filter((row) => row.spike).length,
    },
    topTerms: allTerms.slice(0, 50),
    signals: signals.slice(0, 50),
    signalCount: signals.length,
    zeroResultTerms: allTerms
      .filter((row) => row.zeroResults > 0)
      .sort((a, b) => b.zeroResults - a.zeroResults)
      .slice(0, 50)
      .map((row) => ({ term: row.term, searches: row.zeroResults })),
    volume: Array.from(volume.values()),
  }
}

export async function searchTermDetails({ from, to, term }: Range & { term: string }) {
  const params = [from, to, term]
  const [volume, audience, [summary]] = await Promise.all([
    dataSource.query(
      `
			SELECT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, count(*) AS count,
				count(*) FILTER (WHERE (metadata ->> 'total')::int = 0) AS zero
			FROM activity_events WHERE type = 'search' AND created_at >= $1 AND created_at < $2 AND metadata ->> 'query' = $3
			GROUP BY 1 ORDER BY 1
		`,
      params,
    ) as Promise<{ day: string; count: string; zero: string }[]>,
    dataSource.query(
      `
			SELECT u.id, u.name, u.email, count(*) AS searches,
				count(*) FILTER (WHERE (e.metadata ->> 'total')::int = 0) AS zero, max(e.created_at) AS "lastSearchAt"
			FROM activity_events e JOIN users u ON u.id = e.user_id
			WHERE e.type = 'search' AND e.created_at >= $1 AND e.created_at < $2 AND e.metadata ->> 'query' = $3
				AND u.approved = true AND u.email_verified = true AND u.role <> 'guest'
			GROUP BY u.id ORDER BY searches DESC, u.id LIMIT 200
		`,
      params,
    ) as Promise<
      { id: string; name: string; email: string; searches: string; zero: string; lastSearchAt: Date }[]
    >,
    dataSource.query(
      `
			SELECT count(DISTINCT u.id) AS count FROM activity_events e JOIN users u ON u.id = e.user_id
			WHERE e.type = 'search' AND e.created_at >= $1 AND e.created_at < $2 AND e.metadata ->> 'query' = $3
				AND u.approved = true AND u.email_verified = true AND u.role <> 'guest'
		`,
      params,
    ) as Promise<{ count: string }[]>,
  ])
  return {
    volume: volume.map((row) => ({ day: row.day, count: Number(row.count), zeroResults: Number(row.zero) })),
    audience: audience.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      searches: Number(row.searches),
      zeroResults: Number(row.zero),
      lastSearchAt: row.lastSearchAt,
    })),
    audienceCount: Number(summary.count),
  }
}
