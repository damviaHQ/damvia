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
import { AssetFile } from "../../entity/asset-file"
import { AssetFolder } from "../../entity/asset-folder"
import { License, LicenseScope } from "../../entity/license"
import { dataSource } from "../../env"
import { authMiddleware, publicProcedure, router, userAdmin } from "../index"

export function formatLicense(license: License) {
	return {
		id: license.id,
		name: license.name,
		usageFrom: license.usageFrom,
		usageTo: license.usageTo,
		scopes: license.scopes,
		allowedRegionIds: license.allowedRegionIds,
	}
}

export default router({
	list: publicProcedure
		.use(authMiddleware(userAdmin))
		.query(async () => {
			const licenses = await dataSource.getRepository(License).find({ order: { createdAt: 'DESC' } })
			return licenses.map(formatLicense)
		}),
	create: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(
			z.object({
				name: z.string().max(50).optional(),
				usageFrom: z.coerce.date(),
				usageTo: z.coerce.date(),
				scopes: z.array(z.nativeEnum(LicenseScope)),
				allowedRegionIds: z.array(z.string().uuid()),
			}),
		)
		.mutation(async ({ input }) => {
			const license = new License()
			license.name = input.name
			license.usageFrom = input.usageFrom
			license.usageTo = input.usageTo
			license.scopes = input.scopes
			license.allowedRegionIds = input.allowedRegionIds
			await dataSource.getRepository(License).save(license)
			return formatLicense(license)
		}),
	update: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(
			z.object({
				id: z.string().uuid(),
				name: z.string().max(50).optional(),
				usageFrom: z.coerce.date(),
				usageTo: z.coerce.date(),
				scopes: z.array(z.nativeEnum(LicenseScope)),
				allowedRegionIds: z.array(z.string().uuid()),
			})
		)
		.mutation(async ({ input }) => {
			const license = await dataSource.getRepository(License).findOneBy({ id: input.id })
			if (!license) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'License not found.' })
			}

			license.name = input.name
			license.usageFrom = input.usageFrom
			license.usageTo = input.usageTo
			license.scopes = input.scopes
			license.allowedRegionIds = input.allowedRegionIds
			await dataSource.getRepository(License).save(license)
			return formatLicense(license)
		}),
	remove: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(z.string().uuid())
		.mutation(async ({ input }) => {
			const license = await dataSource.getRepository(License).findOneBy({ id: input })
			if (!license) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'License not found.' })
			}

			await dataSource.getRepository(AssetFolder).update({ licenseId: license.id }, { licenseId: null })
			await dataSource.getRepository(AssetFile).update({ licenseId: license.id }, { licenseId: null })
			await dataSource.getRepository(License).remove(license)
		}),
})
