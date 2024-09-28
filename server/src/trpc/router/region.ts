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
import { ArrayContains } from "typeorm"
import { z } from "zod"
import { Group } from "../../entity/group"
import { License } from "../../entity/license"
import { Region } from "../../entity/region"
import { User } from "../../entity/user"
import { dataSource } from "../../env"
import { authMiddleware, publicProcedure, router, userAdmin } from "../index"

export function formatRegion(region: Region, userCount: number, licenseCount: number) {
	return {
		id: region.id,
		name: region.name,
		defaultGroupId: region.defaultGroupId,
		licenseCount: licenseCount,
		userCount: userCount,
	}
}

export default router({
	list: publicProcedure
		.use(authMiddleware(userAdmin))
		.query(async () => {
			const regions = await dataSource.getRepository(Region).find()
			const regionsWithCounts = await Promise.all(
				regions.map(async (region) => {
					const [licenseCount, userCount] = await Promise.all([
						dataSource.getRepository(License).count({
							where: {
								allowedRegionIds: ArrayContains([region.id])
							}
						}),
						dataSource.getRepository(User).count({
							where: { regionId: region.id }
						})
					])
					return formatRegion(region, userCount, licenseCount)
				})
			)
			return regionsWithCounts
		}),
	create: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(
			z.object({
				name: z.string().min(1).max(80),
				defaultGroupId: z.string().uuid(),
			}),
		)
		.mutation(async ({ input }) => {
			const region = new Region()
			region.name = input.name
			region.defaultGroup = await dataSource.getRepository(Group).findOneBy({ id: input.defaultGroupId })
			await dataSource.getRepository(Region).save(region)
			return formatRegion(region, 0, 0)
		}),
	update: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(
			z.object({
				id: z.string().uuid(),
				name: z.string().min(1).max(80),
				defaultGroupId: z.string().uuid(),
			})
		)
		.mutation(async ({ input }) => {
			const region = await dataSource.getRepository(Region).findOneBy({ id: input.id })
			if (!region) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Region not found.' })
			}

			region.name = input.name
			region.defaultGroup = await dataSource.getRepository(Group).findOneBy({ id: input.defaultGroupId })
			await dataSource.getRepository(Region).save(region)
		}),
	remove: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(z.string().uuid())
		.mutation(async ({ input }) => {
			const regionsCount = await dataSource.getRepository(Region).count()
			if (regionsCount <= 1) {
				throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot remove the last region.' })
			}

			const region = await dataSource.getRepository(Region).findOne({
				where: { id: input },
				relations: ['users']
			})
			if (!region) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Region not found.' })
			}

			if (region.users.length > 0) {
				throw new TRPCError({ code: 'BAD_REQUEST', message: 'Region has users. Please move them first.' })
			}

			// Check for licenses using this region
			const licenses = await dataSource.getRepository(License).find({
				where: {
					allowedRegionIds: ArrayContains([region.id])
				}
			})

			let updatedLicensesCount = 0

			await dataSource.transaction(async (transactionalEntityManager) => {
				// Update licenses if necessary
				for (const license of licenses) {
					license.allowedRegionIds = license.allowedRegionIds.filter(id => id !== region.id)
					await transactionalEntityManager.save(License, license)
					updatedLicensesCount++
				}

				// Remove the region
				await transactionalEntityManager.remove(Region, region)
			})

			return {
				message: 'Region removed successfully.',
				updatedLicenses: updatedLicensesCount,
			}
		}),
	moveUsers: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(z.object({
			fromRegionId: z.string().uuid(),
			toRegionId: z.string().uuid()
		}))
		.mutation(async ({ input }) => {
			await dataSource.getRepository(User).update(
				{ regionId: input.fromRegionId },
				{ regionId: input.toRegionId }
			)
		}),
})
