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
import { randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import sharp from 'sharp'
import { dataSource, mainS3, mainS3Bucket, logger } from '../env'

export const LOGO_KEY = 'settings/client-logo.webp'
export const LOGO_TEMP_PREFIX = 'settings/client-logo-temp/'
export const MAX_LOGO_BYTES = 5 * 1024 * 1024
export const LOGO_MIME_TYPES = ['image/svg+xml', 'image/png', 'image/webp'] as const

export function adminClientLogoEnabled(): boolean {
    // The hyphenated spelling is supported for dotenv/container configuration.
    return (process.env['ADMIN-CLIENT-LOGO'] ?? process.env.ADMIN_CLIENT_LOGO ?? 'false') === 'true'
}

export async function getClientLogo() {
    try {
        await mainS3().statObject(mainS3Bucket(), LOGO_KEY)
        const imageUrl = await mainS3().presignedGetObject(mainS3Bucket(), LOGO_KEY, 3600, { 'response-cache-control': 'no-cache' })
        return { exists: true, imageUrl }
    } catch (error) {
        if (['NotFound', 'NoSuchKey', 'NoSuchObject'].includes(error.code)) return { exists: false, imageUrl: null }
        throw error
    }
}

export async function createLogoUpload(userId: string, contentType: typeof LOGO_MIME_TYPES[number]) {
    const uploadId = randomUUID()
    const policy = mainS3().newPostPolicy()
    policy.setBucket(mainS3Bucket())
    policy.setKey(`${LOGO_TEMP_PREFIX}${userId}/${uploadId}`)
    policy.setExpires(new Date(Date.now() + 10 * 60 * 1000))
    policy.setContentType(contentType)
    policy.setContentLengthRange(1, MAX_LOGO_BYTES)
    const { postURL, formData } = await mainS3().presignedPostPolicy(policy)
    return { uploadId, url: postURL, fields: formData as Record<string, string> }
}

export async function processClientLogo(userId: string, uploadId: string) {
    const key = `${LOGO_TEMP_PREFIX}${userId}/${uploadId}`
    let staged: { versionId?: string | null } | null = null
    try {
        const object = await mainS3().statObject(mainS3Bucket(), key)
        staged = object
        if (object.size < 1 || object.size > MAX_LOGO_BYTES) throw new Error('size')
        // minio 7.1.3 typings omit the getOpts argument its runtime accepts.
        const client = mainS3() as unknown as { getObject(bucket: string, key: string, opts: { versionId?: string }): Promise<Readable> }
        const stream = await client.getObject(mainS3Bucket(), key, staged.versionId ? { versionId: staged.versionId } : {})
        const chunks: Buffer[] = []
        let bytes = 0
        for await (const chunk of stream) {
            bytes += chunk.length
            if (bytes > MAX_LOGO_BYTES) { stream.destroy(); throw new Error('size') }
            chunks.push(Buffer.from(chunk))
        }
        // Buffer input has no base file: SVG cannot load local or remote resources.
        // Only the rasterised output is ever served; SVG scripts/markup are discarded.
        const image = sharp(Buffer.concat(chunks), { limitInputPixels: 16_000_000, failOn: 'warning' })
        const metadata = await image.metadata()
        if (!['svg', 'png', 'webp'].includes(metadata.format ?? '') || (metadata.pages ?? 1) > 1) throw new Error('format')
        const output = await image.resize({ width: 1200, height: 600, fit: 'inside', withoutEnlargement: true })
            .webp({ lossless: true }).timeout({ seconds: 10 }).toBuffer()
        // Serialise replacements/removals; never delete a concurrently uploaded logo.
        await dataSource.transaction(async em => {
            await em.query("SELECT pg_advisory_xact_lock(hashtext('branding/client-logo'))")
            const previous = await mainS3().statObject(mainS3Bucket(), LOGO_KEY).catch(error => {
                if (['NotFound', 'NoSuchKey', 'NoSuchObject'].includes(error.code)) return null
                throw error
            })
            // One permanent key, replaced atomically only after successful validation.
            await mainS3().putObject(mainS3Bucket(), LOGO_KEY, output, output.length, {
                'Content-Type': 'image/webp', 'Cache-Control': 'no-cache',
            })
            // Versioned buckets would otherwise retain the previous logo's bytes.
            if (previous?.versionId) await mainS3().removeObject(mainS3Bucket(), LOGO_KEY, { versionId: previous.versionId })
        })
    } catch (error) {
        logger.warn('branding.logo-upload-failed', { code: error.code })
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Upload a valid, static SVG, PNG or WebP logo (up to 5 MB and 16 million pixels).' })
    } finally {
        if (staged) await mainS3().removeObject(mainS3Bucket(), key, staged.versionId ? { versionId: staged.versionId } : undefined).catch(() => {
            // The daily integrity check also removes abandoned staged uploads.
            logger.warn('branding.logo-temp-cleanup-failed')
        })
    }
    return { success: true }
}

export async function removeClientLogo() {
    await dataSource.transaction(async em => {
        await em.query("SELECT pg_advisory_xact_lock(hashtext('branding/client-logo'))")
        const previous = await mainS3().statObject(mainS3Bucket(), LOGO_KEY).catch(error => {
            if (['NotFound', 'NoSuchKey', 'NoSuchObject'].includes(error.code)) return null
            throw error
        })
        if (!previous) return
        await mainS3().removeObject(mainS3Bucket(), LOGO_KEY, previous?.versionId ? { versionId: previous.versionId } : undefined)
    })
    return { success: true }
}
