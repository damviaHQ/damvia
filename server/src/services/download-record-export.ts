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
import { TRPCError } from '@trpc/server'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { assetsS3, assetsS3Bucket, logger } from '../env'
import type { resolveDownloadSelection } from './download-selection'
import { recordCsv, recordWorkbook } from './download-spreadsheet'

type Selection = Awaited<ReturnType<typeof resolveDownloadSelection>>
export type RecordExportFormat = 'csv' | 'xlsx'

export function recordExportColumns(selection: Selection, columns: string[], format: RecordExportFormat) {
  const ids = [...new Set(columns)]
  const indexes = ids.map(id => selection.columns.findIndex(column => column.id === id))
  if (!ids.length || indexes.includes(-1)) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'A selected column is no longer available. Reopen the download window.' })
  }
  if (!selection.rows.length) throw new TRPCError({ code: 'BAD_REQUEST', message: 'No records are available to download.' })
  const pictureColumn = ids.indexOf('picture')
  if (pictureColumn !== -1 && format !== 'xlsx') throw new TRPCError({ code: 'BAD_REQUEST', message: 'Pictures can only be included in Excel.' })
  return { indexes, pictureColumn }
}

export async function buildRecordExport(selection: Selection, columns: string[], format: RecordExportFormat): Promise<Buffer> {
  const { indexes, pictureColumn } = recordExportColumns(selection, columns, format)
  const rows = [indexes.map(index => selection.columns[index].label), ...selection.rows.map(row => indexes.map(index => row[index]))]
  if (format === 'csv') return Buffer.from(recordCsv(rows), 'utf8')
  if (pictureColumn === -1) return recordWorkbook(rows)

  const byRecord = new Map(selection.pictures.map(picture => [picture.recordId, picture.assetId]))
  const directory = await mkdtemp(join(tmpdir(), 'damvia-record-export-'))
  const images: (Buffer | null)[] = Array(selection.recordIds.length).fill(null)
  try {
    for (let offset = 0; offset < selection.recordIds.length; offset += 8) {
      await Promise.all(selection.recordIds.slice(offset, offset + 8).map(async (recordId, index) => {
        const assetId = byRecord.get(recordId)
        if (!assetId) return
        const path = join(directory, `${offset + index}`)
        for (const key of [`asset-file/${assetId}-thumbnail`, `asset-file/${assetId}`]) {
          try {
            await assetsS3().fGetObject(assetsS3Bucket(), key, path)
            images[offset + index] = await sharp(await readFile(path)).rotate()
              .resize(128, 128, { fit: 'contain', background: '#ffffff' })
              .flatten({ background: '#ffffff' }).jpeg({ quality: 75, mozjpeg: true }).toBuffer()
            break
          } catch (error) {
            if (key === `asset-file/${assetId}`) logger.warn('download.record-picture-failed', { assetId, error: (error as Error).message })
          }
        }
      }))
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
  if (selection.pictures.length && images.every(image => !image)) {
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Product pictures could not be loaded for Excel. Please try again.' })
  }
  return recordWorkbook(rows, { column: pictureColumn, images })
}
