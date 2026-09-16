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
import { AssetFile } from "../../entity/asset-file"
import { Download } from "../../entity/download"
import { User, UserRole } from "../../entity/user"
import { dataSource } from "../../env"
import { getStorageStatus, retryPendingAssets } from "../../services/storage"
import { storageMeasureUsageQueue } from "../../worker"
import { authMiddleware, publicProcedure, router, userAdmin } from "../index"

export default router({
	summary: publicProcedure
		.use(authMiddleware(userAdmin))
		.query(async ({ ctx }) => {
			const [storage, assetRows, userRows, pendingApproval, maintenanceContacts, downloadRows] = await Promise.all([
				getStorageStatus(ctx.user.email),
				dataSource.getRepository(AssetFile).createQueryBuilder('asset_file')
					.select('asset_file.status', 'status').addSelect('COUNT(*)', 'count')
					.groupBy('asset_file.status')
					.getRawMany<{ status: string, count: string }>(),
				dataSource.getRepository(User).createQueryBuilder('user')
					.select('user.role', 'role').addSelect('COUNT(*)', 'count')
					.groupBy('user.role')
					.getRawMany<{ role: string, count: string }>(),
				dataSource.getRepository(User).countBy({ approved: false, emailVerified: true }),
				dataSource.getRepository(User).countBy({ role: UserRole.ADMIN, approved: true, emailVerified: true, maintenanceContact: true }),
				dataSource.getRepository(Download).createQueryBuilder('download')
					.select('download.status', 'status').addSelect('COUNT(*)', 'count')
					.where('download.created_at >= :since', { since: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) })
					.groupBy('download.status')
					.getRawMany<{ status: string, count: string }>(),
			])
			const byRole = Object.fromEntries(userRows.map((row) => [row.role, Number(row.count)]))
			return {
				storage,
				assets: { byStatus: Object.fromEntries(assetRows.map((row) => [row.status, Number(row.count)])) },
				users: {
					total: userRows.reduce((total, row) => total + Number(row.count), 0),
					pendingApproval,
					maintenanceContacts,
					byRole,
				},
				downloads: { last7DaysByStatus: Object.fromEntries(downloadRows.map((row) => [row.status, Number(row.count)])) },
			}
		}),
	retryPendingAssets: publicProcedure
		.use(authMiddleware(userAdmin))
		.mutation(async () => ({ queued: await retryPendingAssets() })),
	measureStorage: publicProcedure
		.use(authMiddleware(userAdmin))
		.mutation(async () => {
			await storageMeasureUsageQueue.push(undefined)
		}),
})
