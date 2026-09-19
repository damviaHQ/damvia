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
import type { MediaRef, VideoRef } from "server/src/page-blocks/schema"
import type { PageAssets } from "./types"

export type ResolvedMedia = { url: string; thumbnailURL: string | null; name: string }

// A reference the viewer cannot reach resolves to nothing, so a restricted file
// never turns into a broken image or a leaked address.
export function resolveMedia(media: MediaRef | VideoRef | null | undefined, assets?: PageAssets): ResolvedMedia | null {
  if (!media || !assets) {
    return null
  }
  if (media.source === "upload") {
    const url = assets.uploads?.[media.s3key]
    return url ? { url, thumbnailURL: url, name: "" } : null
  }
  if (media.source === "file") {
    const file = assets.files?.[media.fileId]
    return file ? { url: file.fileURL, thumbnailURL: file.thumbnailURL, name: file.name } : null
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
