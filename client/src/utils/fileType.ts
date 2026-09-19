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
export type FileTypeInput = { name: string; mimeType: string }

const endsWithAny = (name: string, extensions: string[]) => extensions.some((extension) => name.endsWith(extension))

export const isPdf = (file: FileTypeInput) =>
  file.mimeType === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')

export const isPsd = (file: FileTypeInput) =>
  file.name.toLowerCase().endsWith('.psd') ||
  ['image/vnd.adobe.photoshop', 'application/photoshop', 'application/psd', 'image/psd'].includes(file.mimeType)

export const isVectorFile = (file: FileTypeInput) =>
  endsWithAny(file.name.toLowerCase(), ['.ai', '.eps']) ||
  ['application/postscript', 'application/illustrator'].includes(file.mimeType)

export const isTextFile = (file: FileTypeInput) =>
  endsWithAny(file.name.toLowerCase(), ['.txt', '.md', '.json', '.xml', '.html', '.htm', '.css', '.js', '.ts', '.yaml', '.yml']) ||
  ['text/plain', 'text/markdown', 'application/json', 'text/xml', 'text/html', 'text/css', 'text/javascript', 'application/javascript', 'application/typescript', 'text/yaml'].includes(file.mimeType)

export const isFontFile = (file: FileTypeInput) =>
  endsWithAny(file.name.toLowerCase(), ['.ttf', '.otf']) ||
  ['font/ttf', 'font/otf', 'application/x-font-ttf', 'application/x-font-otf', 'application/vnd.ms-fontobject'].includes(file.mimeType)

export const isVideoFile = (file: FileTypeInput) =>
  endsWithAny(file.name.toLowerCase(), ['.mp4', '.mov', '.avi', '.mkv', '.wmv', '.flv', '.webm', '.m4v']) ||
  file.mimeType.startsWith('video/')

export const isPowerPoint = (file: FileTypeInput) =>
  endsWithAny(file.name.toLowerCase(), ['.ppt', '.pptx', '.ppsx', '.pps', '.potx', '.pot']) ||
  ['application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/vnd.openxmlformats-officedocument.presentationml.slideshow'].includes(file.mimeType)

export const isWord = (file: FileTypeInput) =>
  endsWithAny(file.name.toLowerCase(), ['.doc', '.docx', '.rtf', '.odt']) ||
  ['application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/rtf', 'application/vnd.oasis.opendocument.text'].includes(file.mimeType)

export const isExcel = (file: FileTypeInput) =>
  endsWithAny(file.name.toLowerCase(), ['.xls', '.xlsx', '.csv', '.ods']) ||
  ['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.oasis.opendocument.spreadsheet'].includes(file.mimeType)
