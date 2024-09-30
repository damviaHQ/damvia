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
import { Product } from "../../entity/product"
import { ProductAttribute } from "../../entity/product-attribute"
import { dataSource } from "../../env"
import { authMiddleware, publicProcedure, router, userAdmin } from "../index"

export function formatProductAttribute(attribute: ProductAttribute) {
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
			const products = await dataSource.getRepository(Product)
				.createQueryBuilder('products')
				.select('distinct skeys(products.meta_data) as name')
				.getRawMany<{ name: string }>()
			return products.map((product) => product.name)
		}),
	list: publicProcedure
		.use(authMiddleware(userAdmin))
		.query(async () => {
			const attributes = await dataSource.getRepository(ProductAttribute).find()
			return attributes.map(formatProductAttribute)
		}),
	listFacets: publicProcedure
		.use(authMiddleware())
		.query(async () => {
			const facets = await dataSource.getRepository(ProductAttribute).findBy({ facetable: true })
			const facetValues = await dataSource.getRepository(ProductAttribute)
				.createQueryBuilder('product_attributes')
				.select('name, products.meta_data[name] as value')
				.innerJoin('products', 'products', 'exist(products.meta_data, name)')
				.where('product_attributes.facetable is true')
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
			const attribute = new ProductAttribute()
			attribute.name = input.name
			attribute.displayName = input.displayName
			attribute.facetable = input.facetable
			attribute.viewable = input.facetable || input.viewable
			attribute.searchable = input.searchable
			await dataSource.getRepository(ProductAttribute).save(attribute)
			return formatProductAttribute(attribute)
		}),
	update: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(z.object({
			id: z.string().uuid(),
			displayName: z.string().nullable(),
			facetable: z.boolean(),
			viewable: z.boolean(),
			searchable: z.boolean(),
		}))
		.mutation(async ({ input }) => {
			const attribute = await dataSource.getRepository(ProductAttribute).findOneBy({ id: input.id })
			if (!attribute) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Product attribute not found.' })
			}

			attribute.displayName = input.displayName
			attribute.facetable = input.facetable
			attribute.viewable = input.facetable || input.viewable
			attribute.searchable = input.searchable
			await dataSource.getRepository(ProductAttribute).save(attribute)
			return formatProductAttribute(attribute)
		}),
	remove: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(z.string().uuid())
		.mutation(async ({ input }) => {
			const attribute = await dataSource.getRepository(ProductAttribute).findOneBy({ id: input })
			if (!attribute) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Product attribute not found.' })
			}

			await dataSource.getRepository(ProductAttribute).remove(attribute)
			return formatProductAttribute(attribute)
		})
})
