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
import exifReader from "exif-reader"
import { randomUUID } from "node:crypto"
import { rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import sharp from "sharp"
import { EntityManager } from "typeorm"
import { AssetFile } from "../entity/asset-file"
import { MetadataValueType } from "../entity/metadata-field"
import { assetsS3, assetsS3Bucket, dataSource } from "../env"

export type ExtractedValue = { field: string, type: MetadataValueType, text: string, date: Date | null, number: number | null }

const MAX_TEXT = 500

// IPTC IIM datasets people fill; the others are technical.
const IPTC_DATASETS: Record<number, string> = {
	5: 'ObjectName',
	15: 'Category',
	20: 'SupplementalCategories',
	25: 'Keywords',
	40: 'SpecialInstructions',
	80: 'Byline',
	85: 'BylineTitle',
	90: 'City',
	92: 'Sublocation',
	95: 'ProvinceState',
	101: 'Country',
	103: 'OriginalTransmissionReference',
	105: 'Headline',
	110: 'Credit',
	115: 'Source',
	116: 'CopyrightNotice',
	120: 'Caption',
	122: 'Writer',
}

// Record 2 of an IPTC block, as sharp returns it: 0x1C, record, dataset,
// two-byte length, value. Repeated datasets (keywords) give several values.
export function parseIptc(buffer: Buffer): { name: string, value: string }[] {
	const values: { name: string, value: string }[] = []
	for (let index = buffer.indexOf(0x1c); index >= 0 && index + 5 <= buffer.length;) {
		const record = buffer[index + 1]
		const dataset = buffer[index + 2]
		const length = buffer.readUInt16BE(index + 3)
		const start = index + 5
		if (length & 0x8000 || start + length > buffer.length) break
		const name = IPTC_DATASETS[dataset]
		if (record === 2 && name) {
			const value = buffer.subarray(start, start + length).toString('utf8').replace(/\0+$/, '').trim()
			if (value) values.push({ name, value })
		}
		index = buffer.indexOf(0x1c, start + length)
	}
	return values
}

// Offsets to the other sections of the block, meaningless as values.
const POINTER_TAGS = new Set(['ExifTag', 'GPSTag', 'InteroperabilityTag'])

const toDegrees = (value: unknown, reference: unknown) => {
	if (!Array.isArray(value) || value.length !== 3) return null
	const [degrees, minutes, seconds] = value.map(Number)
	const decimal = degrees + minutes / 60 + seconds / 3600
	return Number.isFinite(decimal) ? (reference === 'S' || reference === 'W' ? -decimal : decimal) : null
}

// Every scalar tag of the Image and Photo sections becomes a field; buffers,
// arrays and the embedded thumbnail are left out. GPS becomes one
// "latitude,longitude" value.
export function flattenMetadata(exif: ReturnType<typeof exifReader> | null, iptc: Buffer | null): ExtractedValue[] {
	const values: ExtractedValue[] = []
	for (const section of [exif?.Image, exif?.Photo]) {
		for (const [tag, raw] of Object.entries(section ?? {})) {
			if (POINTER_TAGS.has(tag)) continue
			const field = `exif.${tag}`
			if (raw instanceof Date) {
				if (!Number.isNaN(raw.getTime())) values.push({ field, type: 'date', text: raw.toISOString().slice(0, 19).replace('T', ' '), date: raw, number: null })
			} else if (typeof raw === 'number' && Number.isFinite(raw)) {
				values.push({ field, type: 'number', text: String(raw), date: null, number: raw })
			} else if (typeof raw === 'string') {
				const text = raw.replace(/\0+$/, '').trim().slice(0, MAX_TEXT)
				if (text) values.push({ field, type: 'text', text, date: null, number: null })
			}
		}
	}
	const gps = exif?.GPSInfo
	const latitude = toDegrees(gps?.GPSLatitude, gps?.GPSLatitudeRef)
	const longitude = toDegrees(gps?.GPSLongitude, gps?.GPSLongitudeRef)
	if (latitude !== null && longitude !== null) {
		values.push({ field: 'exif.GPS', type: 'gps', text: `${latitude.toFixed(6)},${longitude.toFixed(6)}`, date: null, number: null })
	}
	for (const { name, value } of iptc ? parseIptc(iptc) : []) {
		values.push({ field: `iptc.${name}`, type: 'text', text: value.slice(0, MAX_TEXT), date: null, number: null })
	}
	const seen = new Set<string>()
	return values.filter((value) => {
		const key = JSON.stringify([value.field, value.text])
		if (seen.has(key)) return false
		seen.add(key)
		return true
	})
}

export async function readFileMetadata(contentPath: string): Promise<ExtractedValue[]> {
	const meta = await sharp(contentPath, { limitInputPixels: 0, pages: 1 }).metadata().catch((error: Error) => {
		if (/unsupported image format/.test(error.message)) return null
		throw error
	})
	if (!meta) return []
	let exif: ReturnType<typeof exifReader> | null = null
	if (meta.exif) {
		try {
			exif = exifReader(meta.exif)
		} catch {
			exif = null
		}
	}
	return flattenMetadata(exif, meta.iptc ?? null)
}

// Replaces the values of one file. A field seen for the first time is created
// with every switch off, so nothing shows to readers until an admin decides.
export async function storeFileMetadata(em: EntityManager, assetFileId: string, values: ExtractedValue[]) {
	await em.query('DELETE FROM asset_file_metadata_values WHERE asset_file_id = $1', [assetFileId])
	if (!values.length) return
	const names = [...new Set(values.map((value) => value.field))]
	await em.query(`
		INSERT INTO metadata_fields (name, value_type)
		SELECT * FROM unnest($1::text[], $2::varchar[]) ON CONFLICT (name) DO NOTHING
	`, [names, names.map((name) => values.find((value) => value.field === name)!.type)])
	const fields: { id: string, name: string }[] = await em.query('SELECT id, name FROM metadata_fields WHERE name = ANY($1)', [names])
	const ids = new Map(fields.map((field) => [field.name, field.id]))
	await em.query(`
		INSERT INTO asset_file_metadata_values (asset_file_id, metadata_field_id, value_text, value_date, value_number)
		SELECT $1, * FROM unnest($2::uuid[], $3::text[], $4::timestamp[], $5::float8[]) ON CONFLICT DO NOTHING
	`, [assetFileId, values.map((value) => ids.get(value.field)), values.map((value) => value.text), values.map((value) => value.date), values.map((value) => value.number)])
}

export async function extractFileMetadata(file: AssetFile, contentPath: string) {
	if (!file.mimeType.startsWith('image/')) return
	await storeFileMetadata(dataSource.manager, file.id, await readFileMetadata(contentPath))
}

// For files processed before metadata was read: the original already sits in
// the assets bucket, so the cloud source is not asked again.
export async function extractStoredFileMetadata(file: AssetFile) {
	if (!file.mimeType.startsWith('image/')) return
	const path = join(tmpdir(), `dam-metadata-${randomUUID()}`)
	try {
		await assetsS3().fGetObject(assetsS3Bucket(), file.originalStorageKey, path)
		await storeFileMetadata(dataSource.manager, file.id, await readFileMetadata(path))
	} finally {
		await rm(path, { force: true })
	}
}

export async function refreshMetadataFieldCounts(em: EntityManager): Promise<{ fields: number }> {
	const updated: [unknown, number] = await em.query(`
		UPDATE metadata_fields f SET file_count = counts.files, updated_at = now()
		FROM (
			SELECT f.id, count(DISTINCT v.asset_file_id)::int AS files FROM metadata_fields f
			LEFT JOIN asset_file_metadata_values v ON v.metadata_field_id = f.id GROUP BY f.id
		) counts
		WHERE f.id = counts.id AND f.file_count <> counts.files
	`)
	return { fields: updated[1] }
}

export type ViewableMetadata = { id: string, name: string, displayName: string | null, value: string }

// One query for a page of results: the values of viewable fields, joined per
// file in the order of the field names.
export async function loadViewableMetadata(assetFileIds: string[]): Promise<Map<string, ViewableMetadata[]>> {
	const byFile = new Map<string, ViewableMetadata[]>()
	if (!assetFileIds.length) return byFile
	const rows: { asset_file_id: string, id: string, name: string, display_name: string | null, value: string }[] = await dataSource.query(`
		SELECT v.asset_file_id, f.id, f.name, f.display_name, string_agg(v.value_text, ', ' ORDER BY v.value_text) AS value
		FROM asset_file_metadata_values v INNER JOIN metadata_fields f ON f.id = v.metadata_field_id
		WHERE f.viewable AND v.asset_file_id = ANY($1)
		GROUP BY v.asset_file_id, f.id, f.name, f.display_name ORDER BY f.name
	`, [assetFileIds])
	for (const row of rows) {
		const list = byFile.get(row.asset_file_id) ?? []
		list.push({ id: row.id, name: row.name, displayName: row.display_name, value: row.value })
		byFile.set(row.asset_file_id, list)
	}
	return byFile
}
