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
import { DataRecord } from "../../entity/data-record"
import { assetsS3, assetsS3Bucket, dataSource } from "../../env"
import { authMiddleware, publicProcedure, router, userAdmin } from "../index"

export default router({
  list: publicProcedure
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
      const recordRepository = dataSource.getRepository(DataRecord)
      const assetFileRepository = dataSource.getRepository(AssetFile)

      let queryBuilder = recordRepository.createQueryBuilder("record")

      if (columnFilter) {
        if (columnFilter.column === 'recordKey') {
          queryBuilder = queryBuilder.where("record.recordKey ILIKE :value", { value: `%${columnFilter.value}%` })
        } else {
          const key = columnFilter.column.replace('metaData.', '')
          queryBuilder = queryBuilder.where(`record.metaData -> :key ILIKE :value`, {
            key: key,
            value: `%${columnFilter.value}%`
          })
        }
      }
      const [records, total] = await queryBuilder
        .orderBy("record.createdAt", "ASC")
        .skip((page - 1) * size)
        .take(size)
        .getManyAndCount()

      const recordsWithThumbnails = await Promise.all(
        records.map(async (record) => {
          const assetFile = await assetFileRepository.findOne({
            where: {
              recordId: record.id,
              hasThumbnail: true,
              recordView: process.env.PIM_PRODUCT_VIEW,
            },
          })

          const thumbnailURL = assetFile
            ? await assetsS3().presignedGetObject(assetsS3Bucket(), assetFile.thumbnailStorageKey)
            : null
          return {
            id: record.id,
            recordKey: record.recordKey,
            keyColumnName: record.keyColumnName,
            metaData: record.metaData,
            thumbnailURL,
          }
        })
      )

      return { records: recordsWithThumbnails, total }
    }),
  removeAll: publicProcedure
    .use(authMiddleware(userAdmin))
    .mutation(async () => {
      const recordRepository = dataSource.getRepository(DataRecord)
      const assetFileRepository = dataSource.getRepository(AssetFile)
      const records = await recordRepository.find()

      for (const record of records) {
        const assetFiles = await assetFileRepository.find({ where: { recordId: record.id } })

        for (const assetFile of assetFiles) {
          assetFile.recordId = null
          await assetFileRepository.save(assetFile)
        }
      }

      await recordRepository.createQueryBuilder().delete().execute()
    }),
  compareCsv: publicProcedure
    .use(authMiddleware(userAdmin))
    .input(
      z.object({
        keyColumnName: z.string(),
        data: z.array(z.record(z.string(), z.string())),
      })
    )
    .mutation(async ({ input: { keyColumnName, data } }) => {
      const recordRepository = dataSource.getRepository(DataRecord)
      const allRecords = await recordRepository.find()
      const existingKeyColumnName = allRecords[0]?.keyColumnName || keyColumnName
      const primaryKeyCounts = data.reduce((acc, row) => {
        const key = row[keyColumnName]
        acc[key] = (acc[key] || 0) + 1
        return acc
      }, {} as Record<string, number>)

      const comparisonResults = data.map(newRow => {
        const primaryKeyValue = newRow[existingKeyColumnName] || newRow[keyColumnName]
        const existingRecord = allRecords.find(p => p.recordKey === primaryKeyValue)

        // Flag duplicates
        if (primaryKeyCounts[primaryKeyValue] > 1) {
          return { existing: {}, new: newRow, differences: {}, status: 'duplicate' }
        }

        if (existingRecord) {
          const differences = {}
          for (const key in newRow) {
            if (key !== keyColumnName && (newRow[key] !== existingRecord.metaData[key] || (newRow[key] === "" && existingRecord.metaData[key] !== ""))) {
              differences[key] = { old: existingRecord.metaData[key], new: newRow[key] }
            }
          }
          const status = Object.keys(differences).length > 0 ? 'changed' : 'unchanged'
          return { existing: { ...existingRecord.metaData, [existingKeyColumnName]: existingRecord.recordKey }, new: newRow, differences, status }
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
        keyColumnName: z.string(),
        data: z.array(z.record(z.string(), z.string())),
      })
    )
    .mutation(async ({ input: { keyColumnName, data } }) => {
      const log: { newRecords: string[], updatedRecords: string[] } = { newRecords: [], updatedRecords: [] }
      const recordRepository = dataSource.getRepository(DataRecord)
      const allRecords = await recordRepository.find()
      const existingKeyColumnName = allRecords[0]?.keyColumnName || keyColumnName
      const allCsvKeys = new Set(data.flatMap(row => Object.keys(row)))
      for (const record of allRecords) {
        let updated = false
        allCsvKeys.forEach(key => {
          if (!(key in record.metaData)) {
            record.metaData[key] = ""
            updated = true
          }
        })

        if (updated) {
          await recordRepository.save(record)
          log.updatedRecords.push(record.recordKey)
        }
      }

      for (const row of data) {
        const primaryKeyValue = row[existingKeyColumnName] || row[keyColumnName]
        if (!primaryKeyValue) {
          console.error(`Missing record key for primary key column '${existingKeyColumnName || keyColumnName}' in row:`, row)
          continue
        }

        const existing = await recordRepository.findOne({ where: { recordKey: primaryKeyValue } })
        if (existing) {
          let updated = false
          allCsvKeys.forEach(key => {
            if (key !== keyColumnName && (row[key] !== existing.metaData[key] || (row[key] === "" && existing.metaData[key] !== ""))) {
              existing.metaData[key] = row[key] || ""
              updated = true
            }
          })

          if (updated) {
            await recordRepository.save(existing)
            log.updatedRecords.push(existing.recordKey)
          }
        } else {
          const record = new DataRecord()
          record.recordKey = primaryKeyValue
          record.keyColumnName = existingKeyColumnName || keyColumnName
          record.metaData = {}

          allCsvKeys.forEach(key => {
            record.metaData[key] = row[key] || ""
          })

          await recordRepository.save(record)
          log.newRecords.push(record.recordKey)
        }
      }

      return log
    }),
  update: publicProcedure
    .use(authMiddleware(userAdmin))
    .input(
      z.object({
        id: z.string(),
        metaData: z.record(z.string(), z.string()),
      })
    )
    .mutation(async ({ input }) => {
      const recordRepository = dataSource.getRepository(DataRecord)
      const record = await recordRepository.findOneBy({ id: input.id })
      if (!record) {
        throw new Error("Record not found")
      }

      record.metaData = input.metaData

      await recordRepository.save(record)
      return record
    }),

})
