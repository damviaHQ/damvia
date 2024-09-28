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
import { z } from "zod"
import { AssetFile } from "../../entity/asset-file"
import { Product } from "../../entity/product"
import { assetsS3, assetsS3Bucket, dataSource } from "../../env"
import { authMiddleware, publicProcedure, router, userAdmin } from "../index"

export default router({
  listProducts: publicProcedure
    .use(authMiddleware(userAdmin))
    .input(
      z.object({
        page: z.number().min(1),
        size: z.number().min(1),
        columnFilter: z.object({
          column: z.string(),
          value: z.string()
        }).optional()
      })
    )
    .query(async ({ input }) => {
      const { page, size, columnFilter } = input
      const productRepository = dataSource.getRepository(Product)
      const assetFileRepository = dataSource.getRepository(AssetFile)

      let queryBuilder = productRepository.createQueryBuilder("product")

      if (columnFilter) {
        if (columnFilter.column === 'productKey') {
          queryBuilder = queryBuilder.where("product.productKey ILIKE :value", { value: `%${columnFilter.value}%` })
        } else {
          const key = columnFilter.column.replace('metaData.', '')
          queryBuilder = queryBuilder.where(`product.metaData -> :key ILIKE :value`, {
            key: key,
            value: `%${columnFilter.value}%`
          })
        }
      }
      const [products, total] = await queryBuilder
        .orderBy("product.createdAt", "ASC")
        .skip((page - 1) * size)
        .take(size)
        .getManyAndCount()

      const productsWithThumbnails = await Promise.all(
        products.map(async (product) => {
          const assetFile = await assetFileRepository.findOne({
            where: {
              productId: product.id,
              hasThumbnail: true,
              productView: process.env.PIM_PRODUCT_VIEW,
            },
          })

          const thumbnailURL = assetFile
            ? await assetsS3().presignedGetObject(assetsS3Bucket(), assetFile.thumbnailStorageKey)
            : null
          return {
            id: product.id,
            productKey: product.productKey,
            primaryKeyName: product.primaryKeyName,
            metaData: product.metaData,
            thumbnailURL,
          }
        })
      )

      return { products: productsWithThumbnails, total }
    }),
  removeAllProducts: publicProcedure
    .use(authMiddleware(userAdmin))
    .mutation(async () => {
      const productRepository = dataSource.getRepository(Product)
      const assetFileRepository = dataSource.getRepository(AssetFile)
      const products = await productRepository.find()

      for (const product of products) {
        const assetFiles = await assetFileRepository.find({ where: { productId: product.id } })

        for (const assetFile of assetFiles) {
          assetFile.productId = null
          await assetFileRepository.save(assetFile)
        }
      }

      await productRepository.delete({})
    }),
  compareCsv: publicProcedure
    .use(authMiddleware(userAdmin))
    .input(
      z.object({
        primaryKeyName: z.string(),
        data: z.array(z.record(z.string(), z.string())),
      })
    )
    .mutation(async ({ input: { primaryKeyName, data } }) => {
      const productRepository = dataSource.getRepository(Product)
      const allProducts = await productRepository.find()
      const existingPrimaryKeyName = allProducts[0]?.primaryKeyName || primaryKeyName
      const primaryKeyCounts = data.reduce((acc, row) => {
        const key = row[primaryKeyName]
        acc[key] = (acc[key] || 0) + 1
        return acc
      }, {} as Record<string, number>)

      const comparisonResults = data.map(newRow => {
        const primaryKeyValue = newRow[existingPrimaryKeyName] || newRow[primaryKeyName]
        const existingProduct = allProducts.find(p => p.productKey === primaryKeyValue)

        // Flag duplicates
        if (primaryKeyCounts[primaryKeyValue] > 1) {
          return { existing: {}, new: newRow, differences: {}, status: 'duplicate' }
        }

        if (existingProduct) {
          const differences = {}
          for (const key in newRow) {
            if (key !== primaryKeyName && (newRow[key] !== existingProduct.metaData[key] || (newRow[key] === "" && existingProduct.metaData[key] !== ""))) {
              differences[key] = { old: existingProduct.metaData[key], new: newRow[key] }
            }
          }
          const status = Object.keys(differences).length > 0 ? 'changed' : 'unchanged'
          return { existing: { ...existingProduct.metaData, [existingPrimaryKeyName]: existingProduct.productKey }, new: newRow, differences, status }
        } else {
          return { existing: {}, new: newRow, differences: {}, status: 'new' }
        }
      })

      return comparisonResults
    }),
  importCsv: publicProcedure
    .use(authMiddleware(userAdmin))
    .input(
      z.object({
        primaryKeyName: z.string(),
        data: z.array(z.record(z.string(), z.string())),
      })
    )
    .mutation(async ({ input: { primaryKeyName, data } }) => {
      const log = { newProducts: [], updatedProducts: [] }
      const productRepository = dataSource.getRepository(Product)
      const allProducts = await productRepository.find()
      const existingPrimaryKeyName = allProducts[0]?.primaryKeyName || primaryKeyName
      const allCsvKeys = new Set(data.flatMap(row => Object.keys(row)))
      for (const product of allProducts) {
        let updated = false
        allCsvKeys.forEach(key => {
          if (!(key in product.metaData)) {
            product.metaData[key] = ""
            updated = true
          }
        })

        if (updated) {
          await productRepository.save(product)
          log.updatedProducts.push(product.productKey)
        }
      }

      for (const row of data) {
        const primaryKeyValue = row[existingPrimaryKeyName] || row[primaryKeyName]
        if (!primaryKeyValue) {
          console.error(`Missing product key for primary key column '${existingPrimaryKeyName || primaryKeyName}' in row:`, row)
          continue
        }

        let product = await productRepository.findOne({ where: { productKey: primaryKeyValue } })
        if (product) {
          let updated = false
          allCsvKeys.forEach(key => {
            if (key !== primaryKeyName && (row[key] !== product.metaData[key] || (row[key] === "" && product.metaData[key] !== ""))) {
              product.metaData[key] = row[key] || ""
              updated = true
            }
          })

          if (updated) {
            await productRepository.save(product)
            log.updatedProducts.push(product.productKey)
          }
        } else {
          product = new Product()
          product.productKey = primaryKeyValue
          product.primaryKeyName = existingPrimaryKeyName || primaryKeyName
          product.metaData = {}

          allCsvKeys.forEach(key => {
            product.metaData[key] = row[key] || ""
          })

          await productRepository.save(product)
          log.newProducts.push(product.productKey)
        }
      }

      return log
    }),
  updateProduct: publicProcedure
    .input(
      z.object({
        id: z.string(),
        metaData: z.record(z.string(), z.string()),
      })
    )
    .mutation(async ({ input }) => {
      const productRepository = dataSource.getRepository(Product)
      const product = await productRepository.findOneBy({ id: input.id })
      if (!product) {
        throw new Error("Product not found")
      }

      product.metaData = input.metaData

      await productRepository.save(product)
      return product
    }),

})
