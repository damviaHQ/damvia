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

// Shared between the server and the client: the client imports this module at
// runtime through the "server" file: dependency, so it must depend on zod only.
import { z } from "zod"

export const BLOCK_TYPES = ['hero', 'text', 'image', 'video', 'collections', 'files', 'last_files'] as const
export const BLOCK_SIZES = ['full', 'half', 'third'] as const

export type BlockType = typeof BLOCK_TYPES[number]
export type BlockSize = typeof BLOCK_SIZES[number]

// Final upload keys only: blocks/{pageId}/{uuid}. Staged uploads live under
// blocks/{pageId}/tmp/ and must never be referenced by a saved block.
export const UPLOAD_KEY_PATTERN = /^blocks\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/

export function isHttpUrl(value: string) {
	try {
		const url = new URL(value)
		return url.protocol === 'http:' || url.protocol === 'https:'
	} catch {
		return false
	}
}

const uploadKey = z.string().regex(UPLOAD_KEY_PATTERN, 'Invalid upload reference.')
const httpUrl = z.string().max(2000).refine(isHttpUrl, 'Enter a valid http or https address.')
const uploadMedia = z.object({ source: z.literal('upload'), s3key: uploadKey })
const fileMedia = z.object({ source: z.literal('file'), fileId: z.uuid() })
const embedMedia = z.object({
	source: z.literal('embed'),
	provider: z.enum(['youtube', 'vimeo']),
	videoId: z.string().regex(/^[\w-]{6,20}$/, 'Invalid video reference.'),
})

export const mediaRefSchema = z.discriminatedUnion('source', [uploadMedia, fileMedia])
export const videoRefSchema = z.discriminatedUnion('source', [uploadMedia, fileMedia, embedMedia])
export const linkSchema = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal('collection'), collectionId: z.uuid() }),
	z.object({ kind: z.literal('page'), pageId: z.uuid() }),
	z.object({ kind: z.literal('url'), url: httpUrl, external: z.boolean().default(true) }),
])

export type MediaRef = z.infer<typeof mediaRefSchema>
export type VideoRef = z.infer<typeof videoRefSchema>
export type BlockLink = z.infer<typeof linkSchema>

// Listing blocks keep the legacy key names so existing rows need no conversion.
const layout = z.enum(['grid', 'list']).nullish()
const title = z.string().max(120).nullish()

// Files can also be tiled, keeping each picture's own proportions; collections,
// whose cards are all the same, cannot. The size is one of the four the reader's
// own masonry slider offers, and stands as the default for everyone.
const fileLayout = z.enum(['grid', 'list', 'masonry']).nullish()
const masonrySize = z.number().int().min(1).max(4).nullish()

// How tall a picture is allowed to be, in pixels: the author drags the picture
// itself rather than choosing among fixed words.
export const MIN_IMAGE_HEIGHT = 80
export const MAX_IMAGE_HEIGHT = 2400
export const DEFAULT_IMAGE_HEIGHT = 420

// Pages written before the handle existed stored one of four words.
const LEGACY_IMAGE_HEIGHTS: Record<string, number> = {
	small: 220, medium: 420, large: 640, original: MAX_IMAGE_HEIGHT,
}

const imageHeight = z.preprocess(
	(value) => typeof value === 'string' ? LEGACY_IMAGE_HEIGHTS[value] ?? DEFAULT_IMAGE_HEIGHT : value,
	z.number().int().min(MIN_IMAGE_HEIGHT).max(MAX_IMAGE_HEIGHT).default(DEFAULT_IMAGE_HEIGHT),
)

// Which part of a banner picture stays in frame when it is cropped.
const focus = z.object({
	x: z.number().min(0).max(100).default(50),
	y: z.number().min(0).max(100).default(50),
}).default({ x: 50, y: 50 })

export const blockDataSchemas = {
	hero: z.object({
		media: mediaRefSchema.nullish().default(null),
		focus,
		title: z.string().max(200).default(''),
		subtitle: z.string().max(500).default(''),
		button: z.object({ label: z.string().max(80), link: linkSchema }).nullish().default(null),
	}),
	text: z.object({ html: z.string().max(50_000).default('') }),
	image: z.object({
		media: mediaRefSchema.nullish().default(null),
		height: imageHeight,
		alt: z.string().max(300).default(''),
		caption: z.string().max(500).default(''),
		link: linkSchema.nullish().default(null),
	}),
	video: z.object({ media: videoRefSchema.nullish().default(null) }),
	collections: z.object({ title, layout, collectionsId: z.uuid().array().max(200).nullish(), layoutFilter: z.enum(['with_layout', 'without_layout']).nullish() }),
	files: z.object({ title, layout: fileLayout, masonrySize, collectionId: z.uuid().nullish() }),
	last_files: z.object({ title, layout: fileLayout, masonrySize }),
} satisfies Record<BlockType, z.ZodType>

export type BlockDataMap = { [T in BlockType]: z.infer<typeof blockDataSchemas[T]> }
export type BlockData = BlockDataMap[BlockType]

export const blockSizeSchema = z.enum(BLOCK_SIZES)
export const blockTypeSchema = z.enum(BLOCK_TYPES)

// A block as the client sends it: an existing id, or none for a new block.
export const blockInputSchema = z.object({
	id: z.uuid().nullish(),
	type: blockTypeSchema,
	size: blockSizeSchema,
	data: z.unknown(),
})

export type BlockInput = z.infer<typeof blockInputSchema>

export function parseBlockData(type: BlockType, data: unknown): BlockData {
	return blockDataSchemas[type].parse(data ?? {}) as BlockData
}

export function emptyBlockData(type: BlockType): BlockData {
	return parseBlockData(type, {})
}

function linksOf(data: any): BlockLink[] {
	return [data?.link, data?.button?.link].filter((link): link is BlockLink => !!link)
}

export function uploadKeysOf(data: unknown): string[] {
	const media = (data as any)?.media
	return media?.source === 'upload' ? [media.s3key] : []
}

export function fileIdsOf(data: unknown): string[] {
	const media = (data as any)?.media
	return media?.source === 'file' ? [media.fileId] : []
}

export function collectionIdsOf(data: unknown): string[] {
	const value = data as any
	const ids = [
		...(value?.collectionsId ?? []),
		...(value?.collectionId ? [value.collectionId] : []),
		...linksOf(value).filter((link) => link.kind === 'collection').map((link) => link.collectionId),
	]
	return [...new Set<string>(ids)]
}

export function pageIdsOf(data: unknown): string[] {
	return [...new Set(linksOf(data).filter((link) => link.kind === 'page').map((link) => link.pageId))]
}

const EMBED_PATTERNS: Array<{ provider: 'youtube' | 'vimeo', hosts: string[], paths: RegExp[], query?: string }> = [
	{
		provider: 'youtube',
		hosts: ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com'],
		paths: [/^\/embed\/([\w-]{6,20})$/, /^\/shorts\/([\w-]{6,20})$/, /^\/live\/([\w-]{6,20})$/],
		query: 'v',
	},
	{ provider: 'youtube', hosts: ['youtu.be'], paths: [/^\/([\w-]{6,20})$/] },
	{ provider: 'vimeo', hosts: ['vimeo.com', 'www.vimeo.com', 'player.vimeo.com'], paths: [/^\/(?:video\/)?(\d{6,20})$/] },
]

export function parseEmbedUrl(value: string): { provider: 'youtube' | 'vimeo', videoId: string } | null {
	if (!isHttpUrl(value)) {
		return null
	}

	const url = new URL(value)
	for (const pattern of EMBED_PATTERNS) {
		if (!pattern.hosts.includes(url.hostname.toLowerCase())) {
			continue
		}
		const queryId = pattern.query ? url.searchParams.get(pattern.query) : null
		if (queryId && /^[\w-]{6,20}$/.test(queryId)) {
			return { provider: pattern.provider, videoId: queryId }
		}
		for (const path of pattern.paths) {
			const match = url.pathname.match(path)
			if (match) {
				return { provider: pattern.provider, videoId: match[1] }
			}
		}
	}
	return null
}
