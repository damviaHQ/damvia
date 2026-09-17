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
import { TRPCError } from "@trpc/server"
import { z } from "zod"
import { ActivityEvent, ActivityEventType } from "../../entity/activity-event"
import { dataSource } from "../../env"
import { userCollectionFilesQuery } from "../../services/collection"
import { authMiddleware, publicProcedure, router, userAdmin, userApproved } from "../index"

const rangeInput = z.object({
	from: z.coerce.date(),
	to: z.coerce.date(),
})

type CountRow = { day: string, count: string }

function formatSeries(rows: CountRow[]) {
	return rows.map((row) => ({ day: row.day, count: Number(row.count) }))
}

function dailyCount(table: string) {
	return `
		SELECT date_trunc('day', created_at)::date AS day, count(*) AS count
		FROM ${table} WHERE created_at >= $1 AND created_at < $2
		GROUP BY 1 ORDER BY 1
	`
}

const activityByEntity = `
	count(DISTINCT e.user_id) AS active_users,
	count(*) FILTER (WHERE e.type = 'asset_download') AS downloads,
	count(*) FILTER (WHERE e.type = 'asset_view') AS views
`

export default router({
	overview: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(rangeInput)
		.query(async ({ input }) => {
			const params = [input.from, input.to]
			const [typeRows, [activeRow], seriesRows, [newUsersRow], [newFilesRow]] = await Promise.all([
				dataSource.query(`
					SELECT type, count(*) AS count, count(DISTINCT metadata ->> 'downloadId') AS requests
					FROM activity_events WHERE created_at >= $1 AND created_at < $2
					GROUP BY type
				`, params) as Promise<{ type: string, count: string, requests: string }[]>,
				dataSource.query(`
					SELECT count(DISTINCT user_id) AS count FROM activity_events
					WHERE created_at >= $1 AND created_at < $2 AND user_id IS NOT NULL
				`, params) as Promise<{ count: string }[]>,
				dataSource.query(`
					SELECT date_trunc('day', created_at)::date AS day, type, count(*) AS count, count(DISTINCT user_id) AS users
					FROM activity_events WHERE created_at >= $1 AND created_at < $2
					GROUP BY 1, 2 ORDER BY 1
				`, params) as Promise<{ day: string, type: string, count: string, users: string }[]>,
				dataSource.query(`SELECT count(*) AS count FROM users WHERE created_at >= $1 AND created_at < $2`, params) as Promise<{ count: string }[]>,
				dataSource.query(`SELECT count(*) AS count FROM asset_files WHERE created_at >= $1 AND created_at < $2`, params) as Promise<{ count: string }[]>,
			])
			const byType = Object.fromEntries(typeRows.map((row) => [row.type, Number(row.count)]))
			const series: Record<string, { day: string, views: number, downloads: number, logins: number, searches: number, activeUsers: number }> = {}
			for (const row of seriesRows) {
				series[row.day] ??= { day: row.day, views: 0, downloads: 0, logins: 0, searches: 0, activeUsers: 0 }
				if (row.type === ActivityEventType.ASSET_VIEW) series[row.day].views = Number(row.count)
				if (row.type === ActivityEventType.ASSET_DOWNLOAD) series[row.day].downloads = Number(row.count)
				if (row.type === ActivityEventType.LOGIN) series[row.day].logins = Number(row.count)
				if (row.type === ActivityEventType.SEARCH) series[row.day].searches = Number(row.count)
				series[row.day].activeUsers = Math.max(series[row.day].activeUsers, Number(row.users))
			}
			return {
				totals: {
					views: byType[ActivityEventType.ASSET_VIEW] ?? 0,
					downloads: byType[ActivityEventType.ASSET_DOWNLOAD] ?? 0,
					downloadRequests: Number(typeRows.find((row) => row.type === ActivityEventType.ASSET_DOWNLOAD)?.requests ?? 0),
					logins: byType[ActivityEventType.LOGIN] ?? 0,
					activeUsers: Number(activeRow.count),
					searches: byType[ActivityEventType.SEARCH] ?? 0,
					shares: byType[ActivityEventType.COLLECTION_SHARE] ?? 0,
					favorites: byType[ActivityEventType.FAVORITE] ?? 0,
					newUsers: Number(newUsersRow.count),
					newFiles: Number(newFilesRow.count),
				},
				series: Object.values(series),
			}
		}),
	assets: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(rangeInput)
		.query(async ({ input }) => {
			const params = [input.from, input.to]
			const topAssets = (orderBy: string) => `
				SELECT f.id, f.name, f.mime_type AS "mimeType", t.name AS "assetType",
					count(*) FILTER (WHERE e.type = 'asset_download') AS downloads,
					count(*) FILTER (WHERE e.type = 'asset_view') AS views
				FROM activity_events e
				JOIN asset_files f ON f.id = e.asset_file_id
				LEFT JOIN asset_types t ON t.id = f.asset_type_id
				WHERE e.created_at >= $1 AND e.created_at < $2 AND e.type IN ('asset_view', 'asset_download')
				GROUP BY f.id, t.name ORDER BY ${orderBy} DESC LIMIT 20
			`
			const [topDownloaded, topViewed, byType, byCollection, growth, [neverDownloadedRow], neverDownloadedFiles, storageByType] = await Promise.all([
				dataSource.query(topAssets('downloads'), params) as Promise<{ id: string, name: string, mimeType: string, assetType: string | null, downloads: string, views: string }[]>,
				dataSource.query(topAssets('views'), params) as Promise<{ id: string, name: string, mimeType: string, assetType: string | null, downloads: string, views: string }[]>,
				dataSource.query(`
					SELECT coalesce(t.name, 'Untyped') AS name,
						count(*) FILTER (WHERE e.type = 'asset_download') AS downloads,
						count(*) FILTER (WHERE e.type = 'asset_view') AS views
					FROM activity_events e
					JOIN asset_files f ON f.id = e.asset_file_id
					LEFT JOIN asset_types t ON t.id = f.asset_type_id
					WHERE e.created_at >= $1 AND e.created_at < $2 AND e.type IN ('asset_view', 'asset_download')
					GROUP BY 1 ORDER BY downloads DESC, views DESC
				`, params) as Promise<{ name: string, downloads: string, views: string }[]>,
				dataSource.query(`
					SELECT c.id, c.name,
						count(*) FILTER (WHERE e.type = 'asset_download') AS downloads,
						count(*) FILTER (WHERE e.type = 'asset_view') AS views
					FROM activity_events e
					JOIN collections c ON c.id = e.collection_id
					WHERE e.created_at >= $1 AND e.created_at < $2 AND e.type IN ('asset_view', 'asset_download')
					GROUP BY c.id ORDER BY downloads DESC, views DESC LIMIT 20
				`, params) as Promise<{ id: string, name: string, downloads: string, views: string }[]>,
				dataSource.query(dailyCount('asset_files'), params) as Promise<CountRow[]>,
				dataSource.query(`
					SELECT count(*) AS count FROM asset_files f
					WHERE f.status = 'up_to_date' AND NOT EXISTS (SELECT 1 FROM activity_events e WHERE e.asset_file_id = f.id AND e.type = 'asset_download')
				`) as Promise<{ count: string }[]>,
				dataSource.query(`
					SELECT f.id, f.name, f.size, f.created_at AS "createdAt" FROM asset_files f
					WHERE f.status = 'up_to_date' AND NOT EXISTS (SELECT 1 FROM activity_events e WHERE e.asset_file_id = f.id AND e.type = 'asset_download')
					ORDER BY f.created_at DESC LIMIT 50
				`) as Promise<{ id: string, name: string, size: string, createdAt: Date }[]>,
				dataSource.query(`
					SELECT coalesce(t.name, 'Untyped') AS name, count(*) AS files, coalesce(sum(f.size), 0) AS bytes
					FROM asset_files f LEFT JOIN asset_types t ON t.id = f.asset_type_id
					WHERE f.status <> 'pending_deletion'
					GROUP BY 1 ORDER BY bytes DESC
				`) as Promise<{ name: string, files: string, bytes: string }[]>,
			])
			const formatAsset = (row: { id: string, name: string, mimeType: string, assetType: string | null, downloads: string, views: string }) => ({
				id: row.id,
				name: row.name,
				mimeType: row.mimeType,
				assetType: row.assetType,
				downloads: Number(row.downloads),
				views: Number(row.views),
			})
			return {
				topDownloaded: topDownloaded.map(formatAsset),
				topViewed: topViewed.map(formatAsset),
				byType: byType.map((row) => ({ name: row.name, downloads: Number(row.downloads), views: Number(row.views) })),
				byCollection: byCollection.map((row) => ({ id: row.id, name: row.name, downloads: Number(row.downloads), views: Number(row.views) })),
				growth: formatSeries(growth),
				neverDownloaded: {
					total: Number(neverDownloadedRow.count),
					files: neverDownloadedFiles.map((row) => ({ id: row.id, name: row.name, size: Number(row.size), createdAt: row.createdAt })),
				},
				storageByType: storageByType.map((row) => ({ name: row.name, files: Number(row.files), bytes: Number(row.bytes) })),
			}
		}),
	users: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(rangeInput)
		.query(async ({ input }) => {
			const params = [input.from, input.to]
			const [activeSeries, loginSeries, newUserSeries, topDownloaders, byRole, byRegion, byGroup] = await Promise.all([
				dataSource.query(`
					SELECT date_trunc('day', created_at)::date AS day, count(DISTINCT user_id) AS count
					FROM activity_events WHERE created_at >= $1 AND created_at < $2 AND user_id IS NOT NULL
					GROUP BY 1 ORDER BY 1
				`, params) as Promise<CountRow[]>,
				dataSource.query(`
					SELECT date_trunc('day', created_at)::date AS day, count(*) AS count
					FROM activity_events WHERE created_at >= $1 AND created_at < $2 AND type = 'login'
					GROUP BY 1 ORDER BY 1
				`, params) as Promise<CountRow[]>,
				dataSource.query(dailyCount('users'), params) as Promise<CountRow[]>,
				dataSource.query(`
					SELECT u.id, u.name, u.email, u.company, u.role, count(*) AS downloads,
						count(DISTINCT e.metadata ->> 'downloadId') AS requests, max(e.created_at) AS "lastDownloadAt"
					FROM activity_events e JOIN users u ON u.id = e.user_id
					WHERE e.type = 'asset_download' AND e.created_at >= $1 AND e.created_at < $2
					GROUP BY u.id ORDER BY downloads DESC LIMIT 20
				`, params) as Promise<{ id: string, name: string, email: string, company: string | null, role: string, downloads: string, requests: string, lastDownloadAt: Date }[]>,
				dataSource.query(`
					SELECT u.role AS name, ${activityByEntity}
					FROM activity_events e JOIN users u ON u.id = e.user_id
					WHERE e.created_at >= $1 AND e.created_at < $2
					GROUP BY 1 ORDER BY active_users DESC
				`, params) as Promise<{ name: string, active_users: string, downloads: string, views: string }[]>,
				dataSource.query(`
					SELECT r.name, ${activityByEntity}
					FROM activity_events e JOIN users u ON u.id = e.user_id JOIN regions r ON r.id = u.region_id
					WHERE e.created_at >= $1 AND e.created_at < $2
					GROUP BY 1 ORDER BY active_users DESC
				`, params) as Promise<{ name: string, active_users: string, downloads: string, views: string }[]>,
				dataSource.query(`
					SELECT g.name, ${activityByEntity}
					FROM activity_events e JOIN user_groups ug ON ug.user_id = e.user_id JOIN groups g ON g.id = ug.group_id
					WHERE e.created_at >= $1 AND e.created_at < $2
					GROUP BY 1 ORDER BY active_users DESC
				`, params) as Promise<{ name: string, active_users: string, downloads: string, views: string }[]>,
			])
			const formatBreakdown = (row: { name: string, active_users: string, downloads: string, views: string }) => ({
				name: row.name,
				activeUsers: Number(row.active_users),
				downloads: Number(row.downloads),
				views: Number(row.views),
			})
			return {
				activeSeries: formatSeries(activeSeries),
				loginSeries: formatSeries(loginSeries),
				newUserSeries: formatSeries(newUserSeries),
				topDownloaders: topDownloaders.map((row) => ({
					id: row.id,
					name: row.name,
					email: row.email,
					company: row.company,
					role: row.role,
					downloads: Number(row.downloads),
					requests: Number(row.requests),
					lastDownloadAt: row.lastDownloadAt,
				})),
				byRole: byRole.map(formatBreakdown),
				byRegion: byRegion.map(formatBreakdown),
				byGroup: byGroup.map(formatBreakdown),
			}
		}),
	searches: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(rangeInput)
		.query(async ({ input }) => {
			const params = [input.from, input.to]
			const [topTerms, zeroResultTerms, volume] = await Promise.all([
				dataSource.query(`
					SELECT metadata ->> 'query' AS term, count(*) AS searches,
						round(avg((metadata ->> 'total')::int)) AS "avgResults",
						count(*) FILTER (WHERE (metadata ->> 'total')::int = 0) AS "zeroResults"
					FROM activity_events WHERE type = 'search' AND created_at >= $1 AND created_at < $2
					GROUP BY 1 ORDER BY searches DESC LIMIT 50
				`, params) as Promise<{ term: string, searches: string, avgResults: string, zeroResults: string }[]>,
				dataSource.query(`
					SELECT metadata ->> 'query' AS term, count(*) AS searches
					FROM activity_events WHERE type = 'search' AND created_at >= $1 AND created_at < $2 AND (metadata ->> 'total')::int = 0
					GROUP BY 1 ORDER BY searches DESC LIMIT 50
				`, params) as Promise<{ term: string, searches: string }[]>,
				dataSource.query(`
					SELECT date_trunc('day', created_at)::date AS day, count(*) AS count
					FROM activity_events WHERE created_at >= $1 AND created_at < $2 AND type = 'search'
					GROUP BY 1 ORDER BY 1
				`, params) as Promise<CountRow[]>,
			])
			return {
				topTerms: topTerms.map((row) => ({ term: row.term, searches: Number(row.searches), avgResults: Number(row.avgResults), zeroResults: Number(row.zeroResults) })),
				zeroResultTerms: zeroResultTerms.map((row) => ({ term: row.term, searches: Number(row.searches) })),
				volume: formatSeries(volume),
			}
		}),
	collections: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(rangeInput)
		.query(async ({ input }) => {
			const params = [input.from, input.to]
			const [createdSeries, shareSeries, mostShared, mostActive] = await Promise.all([
				dataSource.query(dailyCount('collections'), params) as Promise<CountRow[]>,
				dataSource.query(`
					SELECT date_trunc('day', created_at)::date AS day, count(*) AS count
					FROM activity_events WHERE created_at >= $1 AND created_at < $2 AND type = 'collection_share'
					GROUP BY 1 ORDER BY 1
				`, params) as Promise<CountRow[]>,
				dataSource.query(`
					SELECT c.id, c.name, count(*) AS shares
					FROM activity_events e JOIN collections c ON c.id = e.collection_id
					WHERE e.type = 'collection_share' AND e.created_at >= $1 AND e.created_at < $2
					GROUP BY c.id ORDER BY shares DESC LIMIT 20
				`, params) as Promise<{ id: string, name: string, shares: string }[]>,
				dataSource.query(`
					SELECT c.id, c.name,
						count(*) FILTER (WHERE e.type = 'asset_view') AS views,
						count(*) FILTER (WHERE e.type = 'asset_download') AS downloads
					FROM activity_events e JOIN collections c ON c.id = e.collection_id
					WHERE e.type IN ('asset_view', 'asset_download') AND e.created_at >= $1 AND e.created_at < $2
					GROUP BY c.id ORDER BY views DESC, downloads DESC LIMIT 20
				`, params) as Promise<{ id: string, name: string, views: string, downloads: string }[]>,
			])
			return {
				createdSeries: formatSeries(createdSeries),
				shareSeries: formatSeries(shareSeries),
				mostShared: mostShared.map((row) => ({ id: row.id, name: row.name, shares: Number(row.shares) })),
				mostActive: mostActive.map((row) => ({ id: row.id, name: row.name, views: Number(row.views), downloads: Number(row.downloads) })),
			}
		}),
	trackView: publicProcedure
		.use(authMiddleware(userApproved))
		.input(z.object({ collectionFileId: z.string().uuid() }))
		.mutation(async ({ input, ctx }) => {
			const collectionFile = await userCollectionFilesQuery(ctx.user).andWhere('collection_file.id = :fileId', { fileId: input.collectionFileId }).getOne()
			if (!collectionFile) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Collection file not found.' })
			}
			await dataSource.getRepository(ActivityEvent).insert({ userId: ctx.user.id, type: ActivityEventType.ASSET_VIEW, assetFileId: collectionFile.assetFileId, collectionId: collectionFile.collectionId })
		}),
})
