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
import { EnrichmentSettings } from "../../entity/enrichment-settings"
import { assetsS3, assetsS3Bucket, dataSource } from "../../env"
import { rerunEntityStage } from "../../services/enrichment"
import { linkedFilesOf } from "../../services/record-files"
import { analyseCsv, createRecord, EXPORT_MAX, fieldIsLinked, importCsv, LIST_MAX, listRecords, patchRecords, removeRecords, RecordRow } from "../../services/records"
import { authMiddleware, publicProcedure, router, userAdmin } from "../index"

const filter = z.object({
  column: z.string().min(1).max(200),
  op: z.enum(['contains', 'is', 'is_not', 'is_empty', 'is_not_empty', 'has_any']),
  value: z.string().max(500).optional(),
  values: z.array(z.string().max(500)).max(200).optional(),
})
const query = {
  search: z.string().max(200).optional(),
  filters: z.array(filter).max(10).optional(),
  sort: z.object({ column: z.string().min(1).max(200), direction: z.enum(['asc', 'desc']) }).optional(),
}
const values = z.record(z.string().min(1).max(200), z.string().max(10000))
const ids = z.array(z.uuid()).min(1).max(LIST_MAX)
const csv = z.object({
  keyColumnName: z.string().min(1),
  data: z.array(z.record(z.string(), z.string())),
})

async function thumbnailView(): Promise<string | null> {
  return (await dataSource.getRepository(EnrichmentSettings).findOneBy({ id: 1 }))?.thumbnailView ?? null
}

function presign(key: string | null): Promise<string | null> {
  return key ? assetsS3().presignedGetObject(assetsS3Bucket(), key) : Promise.resolve(null)
}

async function formatRow(row: RecordRow) {
  const { thumbnailStorageKey, ...rest } = row
  return { ...rest, thumbnailURL: await presign(thumbnailStorageKey) }
}

async function getRecord(id: string) {
  const { rows } = await listRecords(dataSource.manager, { ids: [id] }, { offset: 0, limit: 1 }, await thumbnailView())
  if (!rows.length) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Record not found.' })
  }
  return formatRow(rows[0])
}

export default router({
  list: publicProcedure
    .use(authMiddleware(userAdmin))
    .input(z.object({ page: z.number().int().min(1), size: z.number().int().min(1).max(LIST_MAX), ...query }))
    .query(async ({ input }) => {
      const { page, size, ...rest } = input
      const result = await listRecords(dataSource.manager, rest, { offset: (page - 1) * size, limit: size }, await thumbnailView())
      return {
        records: await Promise.all(result.rows.map(formatRow)),
        total: result.total,
        keyColumnName: result.keyColumnName,
      }
    }),
  get: publicProcedure
    .use(authMiddleware(userAdmin))
    .input(z.uuid())
    .query(async ({ input }) => {
      const record = await getRecord(input)
      const files = await linkedFilesOf(dataSource.manager, record)
      return {
        ...record,
        files: {
          direct: await Promise.all(files.direct.map(async ({ thumbnailStorageKey, ...file }) => ({ ...file, thumbnailURL: await presign(thumbnailStorageKey) }))),
          range: await Promise.all(files.range.map(async ({ thumbnailStorageKey, ...file }) => ({ ...file, thumbnailURL: await presign(thumbnailStorageKey) }))),
        },
      }
    }),
  create: publicProcedure
    .use(authMiddleware(userAdmin))
    .input(z.object({ recordKey: z.string().trim().min(1).max(200), values: values.optional() }))
    .mutation(async ({ input, ctx }) => {
      const id = await dataSource.transaction((em) => createRecord(em, input, { userId: ctx.user.id, source: 'grid' }))
      // Files that already carry the key attach now.
      await rerunEntityStage()
      return getRecord(id)
    }),
  patch: publicProcedure
    .use(authMiddleware(userAdmin))
    .input(z.object({ id: z.uuid(), values: values.refine((value) => Object.keys(value).length >= 1 && Object.keys(value).length <= 50, 'Send between 1 and 50 fields.'), source: z.enum(['grid', 'panel']) }))
    .mutation(async ({ input, ctx }) => {
      const result = await dataSource.transaction((em) => patchRecords(em, [input.id], input.values, { userId: ctx.user.id, source: input.source }))
      if (!result.found) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Record not found.' })
      }
      if (result.updated.length && await fieldIsLinked(dataSource.manager, Object.keys(input.values))) await rerunEntityStage()
      const [row] = await dataSource.query('SELECT hstore_to_json(meta_data) AS meta_data, updated_at FROM records WHERE id = $1', [input.id])
      return { id: input.id, metaData: (row?.meta_data ?? {}) as Record<string, string>, updatedAt: row?.updated_at as Date }
    }),
  bulkPatch: publicProcedure
    .use(authMiddleware(userAdmin))
    .input(z.object({ ids, values: values.refine((value) => Object.keys(value).length >= 1 && Object.keys(value).length <= 10, 'Send between 1 and 10 fields.') }))
    .mutation(async ({ input, ctx }) => {
      const result = await dataSource.transaction((em) => patchRecords(em, input.ids, input.values, { userId: ctx.user.id, source: 'bulk' }))
      if (result.updated.length && await fieldIsLinked(dataSource.manager, Object.keys(input.values))) await rerunEntityStage()
      return { updated: result.updated.length }
    }),
  remove: publicProcedure
    .use(authMiddleware(userAdmin))
    .input(z.object({ ids }))
    .mutation(async ({ input, ctx }) => {
      const removed = await dataSource.transaction((em) => removeRecords(em, input.ids, { userId: ctx.user.id, source: input.ids.length > 1 ? 'bulk' : 'grid' }))
      // Links to the removed keys turn dangling with their reason.
      await rerunEntityStage()
      return { removed }
    }),
  removeAll: publicProcedure
    .use(authMiddleware(userAdmin))
    .mutation(async ({ ctx }) => {
      const removed = await dataSource.transaction((em) => removeRecords(em, null, { userId: ctx.user.id, source: 'bulk' }))
      await rerunEntityStage()
      return { removed }
    }),
  history: publicProcedure
    .use(authMiddleware(userAdmin))
    .input(z.object({ id: z.uuid(), before: z.uuid().optional(), limit: z.number().int().min(1).max(100).default(50) }))
    .query(async ({ input }) => {
      const record = await dataSource.getRepository(DataRecord).findOneBy({ id: input.id })
      if (!record) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Record not found.' })
      }
      // A key deleted and created again keeps its earlier life.
      const rows: { id: string, action: string, source: string, changes: Record<string, { old: string | null, new: string | null }>, changed_by_id: string | null, changed_by_name: string | null, import_batch_id: string | null, created_at: Date }[] = await dataSource.query(`
        SELECT c.id, c.action, c.source, c.changes, c.changed_by_id, u.name AS changed_by_name, c.import_batch_id, c.created_at
        FROM record_changes c LEFT JOIN users u ON u.id = c.changed_by_id
        WHERE (c.record_id = $1 OR c.record_key = $2) AND ($3::uuid IS NULL OR (c.created_at, c.id) < (SELECT created_at, id FROM record_changes WHERE id = $3::uuid))
        ORDER BY c.created_at DESC, c.id DESC
        LIMIT $4
      `, [record.id, record.recordKey, input.before ?? null, input.limit + 1])
      return {
        items: rows.slice(0, input.limit).map((row) => ({
          id: row.id,
          action: row.action as 'create' | 'update' | 'delete',
          source: row.source,
          changes: row.changes,
          changedBy: row.changed_by_id ? { id: row.changed_by_id, name: row.changed_by_name } : null,
          importBatchId: row.import_batch_id,
          createdAt: row.created_at,
        })),
        hasMore: rows.length > input.limit,
      }
    }),
  exportRows: publicProcedure
    .use(authMiddleware(userAdmin))
    .input(z.object({ ...query, ids: z.array(z.uuid()).max(LIST_MAX).optional() }))
    .mutation(async ({ input }) => {
      const result = await listRecords(dataSource.manager, input, { offset: 0, limit: EXPORT_MAX + 1 }, null)
      if (result.rows.length > EXPORT_MAX) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `More than ${EXPORT_MAX} records match. Narrow the filters or import-export in several parts.` })
      }
      const keyColumnName = result.keyColumnName ?? 'Key'
      const columns = [keyColumnName, ...result.fields.map((field) => field.name).filter((name) => name !== keyColumnName)]
      return {
        columns,
        rows: result.rows.map((row) => [row.recordKey, ...columns.slice(1).map((name) => row.metaData[name] ?? '')]),
      }
    }),
  compareCsv: publicProcedure
    .use(authMiddleware(userAdmin))
    .input(csv)
    .mutation(async ({ input }) => {
      const analysis = await analyseCsv(dataSource.manager, input.keyColumnName, input.data)
      return {
        keyColumnName: analysis.keyColumnName,
        newColumns: analysis.newColumns,
        newOptions: analysis.newOptions,
        rows: analysis.rows.map((row) => ({
          key: row.key,
          existing: row.existing ? { ...row.existing.metaData, [analysis.keyColumnName]: row.key } : {},
          new: row.row,
          differences: row.differences,
          invalid: row.invalid,
          status: !row.key ? 'missing_key' as const
            : row.duplicate ? 'duplicate' as const
            : Object.keys(row.invalid).length ? 'invalid' as const
            : !row.existing ? 'new' as const
            : Object.keys(row.differences).length ? 'changed' as const
            : 'unchanged' as const,
        })),
      }
    }),
  importCsv: publicProcedure
    .use(authMiddleware(userAdmin))
    .input(csv)
    .mutation(async ({ input, ctx }) => {
      const result = await dataSource.transaction(async (em) => {
        await em.query('LOCK TABLE records IN SHARE ROW EXCLUSIVE MODE')
        return importCsv(em, await analyseCsv(em, input.keyColumnName, input.data), ctx.user.id)
      })
      await rerunEntityStage()
      return result
    }),
})
