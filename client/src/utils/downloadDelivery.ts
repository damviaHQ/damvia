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
// Mirrors DOWNLOAD_LIMITS in server/src/services/download.ts. The server makes
// the final decision; these values only decide what the dialogs offer.
export const DIRECT_DOWNLOAD_MAX_BYTES = 1_000_000_000
export const DIRECT_DOWNLOAD_MAX_IMAGES = 300
export const DOWNLOAD_MAX_BYTES = 10_000_000_000

type DownloadFile = { size: number | string, mimeType: string }

export function downloadSummary(files: DownloadFile[]) {
  const bytes = files.reduce((sum, file) => sum + Number(file.size), 0)
  const imageCount = files.filter(file => file.mimeType.startsWith('image/')).length
  return {
    bytes,
    imageCount,
    directAllowed: bytes <= DIRECT_DOWNLOAD_MAX_BYTES && imageCount <= DIRECT_DOWNLOAD_MAX_IMAGES,
    conversionAllowed: imageCount <= DIRECT_DOWNLOAD_MAX_IMAGES,
    tooLarge: bytes >= DOWNLOAD_MAX_BYTES,
  }
}
