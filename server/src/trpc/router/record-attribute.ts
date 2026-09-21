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
import { DataRecord } from "../../entity/data-record"
import { RecordAttribute } from "../../entity/record-attribute"
import { dataSource } from "../../env"
import { authMiddleware, publicProcedure, router, userAdmin } from "../index"

export function formatRecordAttribute(attribute: RecordAttribute) {
	return {
		id: attribute.id,
		name: attribute.name,
		displayName: attribute.displayName,
		facetable: attribute.facetable,
		viewable: attribute.viewable,
		searchable: attribute.searchable,
	}
}

export default router({
	listAvailable: publicProcedure
		.use(authMiddleware(userAdmin))
		.query(async () => {
			const records = await dataSource.getRepository(DataRecord)
				.createQueryBuilder('records')
				.select('distinct skeys(records.meta_data) as name')
				.getRawMany<{ name: string }>()
			return records.map((record) => record.name)
		}),
	list: publicProcedure
		.use(authMiddleware(userAdmin))
		.query(async () => {
			const attributes = await dataSource.getRepository(RecordAttribute).find()
			return attributes.map(formatRecordAttribute)
		}),
	listFacets: publicProcedure
		.use(authMiddleware())
		.query(async () => {
			const facets = await dataSource.getRepository(RecordAttribute).findBy({ facetable: true })
			const facetValues = await dataSource.getRepository(RecordAttribute)
				.createQueryBuilder('record_attributes')
				.select('name, records.meta_data[name] as value')
				.innerJoin('records', 'records', 'exist(records.meta_data, name)')
				.where('record_attributes.facetable is true')
				.groupBy('name, value')
				.getRawMany<{ name: string, value: string }>()
			return facets.map((facet) => ({
				id: facet.id,
				name: facet.name,
				displayName: facet.displayName,
				values: facetValues.filter((entry) => entry.name === facet.name).map((entry) => entry.value),
			}))
		}),
	create: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(z.object({
			name: z.string(),
			displayName: z.string().nullable(),
			facetable: z.boolean(),
			viewable: z.boolean(),
			searchable: z.boolean(),
		}))
		.mutation(async ({ input }) => {
			const attribute = new RecordAttribute()
			attribute.name = input.name
			attribute.displayName = input.displayName
			attribute.facetable = input.facetable
			attribute.viewable = input.facetable || input.viewable
			attribute.searchable = input.searchable
			await dataSource.getRepository(RecordAttribute).save(attribute)
			return formatRecordAttribute(attribute)
		}),
	update: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(z.object({
			id: z.uuid(),
			displayName: z.string().nullable(),
			facetable: z.boolean(),
			viewable: z.boolean(),
			searchable: z.boolean(),
		}))
		.mutation(async ({ input }) => {
			const attribute = await dataSource.getRepository(RecordAttribute).findOneBy({ id: input.id })
			if (!attribute) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Record attribute not found.' })
			}

			attribute.displayName = input.displayName
			attribute.facetable = input.facetable
			attribute.viewable = input.facetable || input.viewable
			attribute.searchable = input.searchable
			await dataSource.getRepository(RecordAttribute).save(attribute)
			return formatRecordAttribute(attribute)
		}),
	remove: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(z.uuid())
		.mutation(async ({ input }) => {
			const attribute = await dataSource.getRepository(RecordAttribute).findOneBy({ id: input })
			if (!attribute) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Record attribute not found.' })
			}

			await dataSource.getRepository(RecordAttribute).remove(attribute)
			return formatRecordAttribute(attribute)
		})
})
