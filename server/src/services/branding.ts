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
import { BrandSettings } from '../entity/brand-settings'
import { apiURL, dataSource, mainS3, mainS3Bucket, logger } from '../env'

export const LOGO_KEY = 'settings/client-logo.webp'
// Outlook shows neither WebP nor SVG, so emails carry a PNG copy.
export const EMAIL_LOGO_KEY = 'settings/client-logo-email.png'
export const LOGO_TEMP_PREFIX = 'settings/client-logo-temp/'
export const MAX_LOGO_BYTES = 5 * 1024 * 1024
export const LOGO_MIME_TYPES = ['image/svg+xml', 'image/png', 'image/webp'] as const

export function adminClientLogoEnabled(): boolean {
    // The hyphenated spelling is supported for dotenv/container configuration.
    return (process.env['ADMIN-CLIENT-LOGO'] ?? process.env.ADMIN_CLIENT_LOGO ?? 'false') === 'true'
}

export async function brandName(fallback = 'Damvia'): Promise<string> {
    const brand = await dataSource.getRepository(BrandSettings).findOneBy({ id: 1 })
    return brand?.brandName?.trim() || process.env.APP_NAME?.trim() || fallback
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
        const stream = await mainS3().getObject(mainS3Bucket(), key, staged.versionId ? { versionId: staged.versionId } : {})
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
            // Emails must never show the previous logo; the copy is made again on demand.
            await removeEmailLogo()
            // One permanent key, replaced atomically only after successful validation.
            await mainS3().putObject(mainS3Bucket(), LOGO_KEY, output, output.length, {
                'Content-Type': 'image/webp', 'Cache-Control': 'no-cache',
            })
            // Versioned buckets would otherwise retain the previous logo's bytes.
            if (previous?.versionId) await mainS3().removeObject(mainS3Bucket(), LOGO_KEY, { versionId: previous.versionId })
            await writeEmailLogo(output).catch(error => logger.warn('branding.email-logo-write-failed', { code: error.code }))
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
        await removeEmailLogo()
    })
    return { success: true }
}

// Twice the 160px the email shows, for sharp high-density screens.
async function writeEmailLogo(logo: Buffer): Promise<Buffer> {
    const png = await sharp(logo).resize({ width: 320, height: 96, fit: 'inside', withoutEnlargement: true }).png().toBuffer()
    await mainS3().putObject(mainS3Bucket(), EMAIL_LOGO_KEY, png, png.length, { 'Content-Type': 'image/png' })
    return png
}

const isMissing = (error: { code?: string }) => ['NotFound', 'NoSuchKey', 'NoSuchObject'].includes(error.code ?? '')

// Versioned buckets would otherwise keep the previous logo's bytes.
async function removeEmailLogo() {
    const previous = await mainS3().statObject(mainS3Bucket(), EMAIL_LOGO_KEY).catch(error => {
        if (isMissing(error)) return null
        throw error
    })
    if (previous) await mainS3().removeObject(mainS3Bucket(), EMAIL_LOGO_KEY, previous.versionId ? { versionId: previous.versionId } : undefined)
}

// A stable public address: a presigned link would stop working in the inbox
// after an hour. The version makes mail clients fetch a replaced logo again.
export async function emailLogoUrl(): Promise<string | null> {
    try {
        const logo = await mainS3().statObject(mainS3Bucket(), LOGO_KEY)
        return `${apiURL()}/v1/branding/email-logo.png?v=${new Date(logo.lastModified).getTime() || 0}`
    } catch (error) {
        if (!isMissing(error)) logger.warn('branding.email-logo-unavailable', { code: error.code })
        return null
    }
}

// Logos uploaded before emails carried them get their PNG on first use.
export async function readEmailLogo(): Promise<Buffer | null> {
    const read = async (key: string) => {
        const chunks: Buffer[] = []
        for await (const chunk of await mainS3().getObject(mainS3Bucket(), key)) chunks.push(Buffer.from(chunk))
        return Buffer.concat(chunks)
    }
    try {
        return await read(EMAIL_LOGO_KEY)
    } catch (error) {
        if (!isMissing(error)) throw error
    }
    try {
        return await writeEmailLogo(await read(LOGO_KEY))
    } catch (error) {
        if (isMissing(error)) return null
        throw error
    }
}

export const AUTH_BACKGROUND_KEY = 'settings/auth-background.webp'
// No trailing slash: the listing also catches the fixed key older versions staged uploads under.
export const AUTH_BACKGROUND_TEMP_PREFIX = 'settings/auth-background-temp'
export const MAX_AUTH_BACKGROUND_BYTES = 20 * 1024 * 1024
export const AUTH_BACKGROUND_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

export async function createAuthBackgroundUpload(userId: string, contentType: typeof AUTH_BACKGROUND_MIME_TYPES[number]) {
    const uploadId = randomUUID()
    const policy = mainS3().newPostPolicy()
    policy.setBucket(mainS3Bucket())
    policy.setKey(`${AUTH_BACKGROUND_TEMP_PREFIX}/${userId}/${uploadId}`)
    policy.setExpires(new Date(Date.now() + 10 * 60 * 1000))
    policy.setContentType(contentType)
    policy.setContentLengthRange(1, MAX_AUTH_BACKGROUND_BYTES)
    const { postURL, formData } = await mainS3().presignedPostPolicy(policy)
    return { uploadId, url: postURL, fields: formData as Record<string, string> }
}

export async function processAuthBackground(userId: string, uploadId: string) {
    const key = `${AUTH_BACKGROUND_TEMP_PREFIX}/${userId}/${uploadId}`
    let staged: { versionId?: string | null } | null = null
    try {
        const object = await mainS3().statObject(mainS3Bucket(), key)
        staged = object
        if (object.size < 1 || object.size > MAX_AUTH_BACKGROUND_BYTES) throw new Error('size')
        const stream = await mainS3().getObject(mainS3Bucket(), key, staged.versionId ? { versionId: staged.versionId } : {})
        const chunks: Buffer[] = []
        let bytes = 0
        for await (const chunk of stream) {
            bytes += chunk.length
            if (bytes > MAX_AUTH_BACKGROUND_BYTES) { stream.destroy(); throw new Error('size') }
            chunks.push(Buffer.from(chunk))
        }
        const image = sharp(Buffer.concat(chunks), { limitInputPixels: 40_000_000, failOn: 'warning' })
        const metadata = await image.metadata()
        if (!['jpeg', 'png', 'webp'].includes(metadata.format ?? '') || (metadata.pages ?? 1) > 1) throw new Error('format')
        const output = await image.rotate().resize({ height: 2000, fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 80 }).timeout({ seconds: 20 }).toBuffer()
        await mainS3().putObject(mainS3Bucket(), AUTH_BACKGROUND_KEY, output, output.length, { 'Content-Type': 'image/webp' })
    } catch (error) {
        logger.warn('branding.auth-background-upload-failed', { code: error.code })
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Upload a valid JPEG, PNG or WebP image (up to 20 MB and 40 million pixels).' })
    } finally {
        if (staged) await mainS3().removeObject(mainS3Bucket(), key, staged.versionId ? { versionId: staged.versionId } : undefined).catch(() => {
            // The daily integrity check also removes abandoned staged uploads.
            logger.warn('branding.auth-background-temp-cleanup-failed')
        })
    }
    return { success: true }
}
