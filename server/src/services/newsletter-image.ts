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
import sharp from 'sharp'
import { NewsletterImage } from '../entity/newsletter-image'
import { dataSource, logger, mainS3, mainS3Bucket } from '../env'
import { NEWSLETTER_IMAGE_WIDTH, newsletterImageUrl } from '../mail/newsletter-sanitize'

export const NEWSLETTER_IMAGE_TEMP_PREFIX = 'newsletters/uploads/'
export const MAX_NEWSLETTER_IMAGE_BYTES = 10 * 1024 * 1024
export const NEWSLETTER_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const

const isMissing = (error: { code?: string }) => ['NotFound', 'NoSuchKey', 'NoSuchObject'].includes(error.code ?? '')

export async function createNewsletterImageUpload(userId: string, contentType: typeof NEWSLETTER_IMAGE_MIME_TYPES[number]) {
	const uploadId = randomUUID()
	const policy = mainS3().newPostPolicy()
	policy.setBucket(mainS3Bucket())
	policy.setKey(`${NEWSLETTER_IMAGE_TEMP_PREFIX}${userId}/${uploadId}`)
	policy.setExpires(new Date(Date.now() + 10 * 60 * 1000))
	policy.setContentType(contentType)
	policy.setContentLengthRange(1, MAX_NEWSLETTER_IMAGE_BYTES)
	const { postURL, formData } = await mainS3().presignedPostPolicy(policy)
	return { uploadId, url: postURL, fields: formData as Record<string, string> }
}

// Outlook shows neither WebP nor animation reliably: images are stored as
// PNG when they have transparency and JPEG otherwise, twice the width shown.
export async function processNewsletterImage(userId: string, uploadId: string, newsletterId: string | null) {
	const key = `${NEWSLETTER_IMAGE_TEMP_PREFIX}${userId}/${uploadId}`
	let staged: { versionId?: string | null } | null = null
	try {
		const object = await mainS3().statObject(mainS3Bucket(), key)
		staged = object
		if (object.size < 1 || object.size > MAX_NEWSLETTER_IMAGE_BYTES) throw new Error('size')
		const stream = await mainS3().getObject(mainS3Bucket(), key, staged.versionId ? { versionId: staged.versionId } : {})
		const chunks: Buffer[] = []
		let bytes = 0
		for await (const chunk of stream) {
			bytes += chunk.length
			if (bytes > MAX_NEWSLETTER_IMAGE_BYTES) { stream.destroy(); throw new Error('size') }
			chunks.push(Buffer.from(chunk))
		}
		const image = sharp(Buffer.concat(chunks), { limitInputPixels: 40_000_000, failOn: 'warning' })
		const metadata = await image.metadata()
		if (!['jpeg', 'png', 'webp', 'gif'].includes(metadata.format ?? '')) throw new Error('format')
		const resized = image.rotate().resize({ width: NEWSLETTER_IMAGE_WIDTH * 2, fit: 'inside', withoutEnlargement: true })
		const png = !!metadata.hasAlpha
		const { data, info } = await (png ? resized.png({ compressionLevel: 9 }) : resized.flatten({ background: '#ffffff' }).jpeg({ quality: 82, mozjpeg: true }))
			.timeout({ seconds: 20 }).toBuffer({ resolveWithObject: true })
		const id = randomUUID()
		const extension = png ? 'png' : 'jpg'
		const contentType = png ? 'image/png' : 'image/jpeg'
		const s3Key = `newsletters/images/${id}.${extension}`
		await mainS3().putObject(mainS3Bucket(), s3Key, data, data.length, { 'Content-Type': contentType })
		await dataSource.getRepository(NewsletterImage).insert({ id, s3Key, contentType, width: info.width, height: info.height, newsletterId, createdById: userId })
		return { id, url: newsletterImageUrl(id, extension), width: Math.min(NEWSLETTER_IMAGE_WIDTH, info.width) }
	} catch (error) {
		logger.warn('newsletter.image-upload-failed', { code: error.code })
		throw new TRPCError({ code: 'BAD_REQUEST', message: 'Upload a valid JPEG, PNG, WebP or GIF image (up to 10 MB and 40 million pixels).' })
	} finally {
		if (staged) await mainS3().removeObject(mainS3Bucket(), key, staged.versionId ? { versionId: staged.versionId } : undefined).catch(() => {
			logger.warn('newsletter.image-temp-cleanup-failed')
		})
	}
}

// Public: once a newsletter is sent, its images are in inboxes.
export async function readNewsletterImage(id: string, extension: string): Promise<{ body: Buffer, contentType: string } | null> {
	const row = await dataSource.getRepository(NewsletterImage).findOneBy({ id })
	if (!row || !row.s3Key.endsWith(`.${extension}`)) return null
	try {
		const chunks: Buffer[] = []
		for await (const chunk of await mainS3().getObject(mainS3Bucket(), row.s3Key)) chunks.push(Buffer.from(chunk))
		return { body: Buffer.concat(chunks), contentType: row.contentType }
	} catch (error) {
		if (isMissing(error)) return null
		throw error
	}
}
