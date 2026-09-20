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
import { DEFAULT_IMAGE_HEIGHT, MAX_IMAGE_HEIGHT, MIN_IMAGE_HEIGHT } from "server/src/page-blocks/schema"
import type { MediaRef, VideoRef } from "server/src/page-blocks/schema"
import type { PageAssets } from "./types"

// Heights are pixels, but pages written before the drag handle hold one of four
// words, and a half-dragged value must stay inside what the server accepts.
const LEGACY_HEIGHTS: Record<string, number> = { small: 220, medium: 420, large: 640, original: MAX_IMAGE_HEIGHT }

export function imageHeightOf(height: unknown): number {
  const pixels = typeof height === "string" ? LEGACY_HEIGHTS[height] : height
  if (typeof pixels !== "number" || Number.isNaN(pixels)) {
    return DEFAULT_IMAGE_HEIGHT
  }
  return Math.min(MAX_IMAGE_HEIGHT, Math.max(MIN_IMAGE_HEIGHT, Math.round(pixels)))
}

export type ResolvedMedia = { url: string; thumbnailURL: string | null; displayURL: string; name: string }

// A reference the viewer cannot reach resolves to nothing, so a restricted file
// never turns into a broken image or a leaked address.
//
// `url` is the file itself, which a video needs; `displayURL` is what a picture
// on a page is drawn from. Library originals run to tens of megabytes, so a
// picture shows the rendition the DAM already made instead.
export function resolveMedia(media: MediaRef | VideoRef | null | undefined, assets?: PageAssets): ResolvedMedia | null {
  if (!media || !assets) {
    return null
  }
  if (media.source === "upload") {
    const url = assets.uploads?.[media.s3key]
    return url ? { url, thumbnailURL: url, displayURL: url, name: "" } : null
  }
  if (media.source === "file") {
    const file = assets.files?.[media.fileId]
    return file
      ? { url: file.fileURL, thumbnailURL: file.thumbnailURL, displayURL: file.thumbnailURL ?? file.fileURL, name: file.name }
      : null
  }
  return null
}

export function embedSrc(media: VideoRef | null | undefined): string | null {
  if (media?.source !== "embed") {
    return null
  }
  return media.provider === "youtube"
    ? `https://www.youtube-nocookie.com/embed/${media.videoId}`
    : `https://player.vimeo.com/video/${media.videoId}`
}
