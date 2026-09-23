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
import { ZipArchive } from 'archiver'

// CSV needs formula protection. XLSX cells are explicitly strings, preserving
// references, leading zeroes and text that happens to start with an equals sign.
export function recordCsv(rows: string[][]) {
  return '\uFEFF' + rows.map(row => row.map(value => {
    const safe = /^[\s]*[=+@-]|^[\t\r\n]/.test(value) ? "'" + value : value
    return '"' + safe.replace(/"/g, '""') + '"'
  }).join(',')).join('\r\n')
}

function xml(value: string) {
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

function columnName(index: number) {
  let name = ''
  for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26)) {
    name = String.fromCharCode(65 + (value - 1) % 26) + name
  }
  return name
}

export async function recordWorkbook(rows: string[][], pictures?: { column: number, images: (Buffer | null)[] }): Promise<Buffer> {
  const archive = new ZipArchive({ zlib: { level: 6 } })
  const chunks: Buffer[] = []
  const images = pictures?.images.flatMap((data, row) => data ? [{ data, row, id: row + 1 }] : []) ?? []
  const hasPictures = images.length > 0 && !!pictures
  const picture = (row: number, id: number, column: number) => `<xdr:oneCellAnchor><xdr:from><xdr:col>${column}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${row}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:ext cx="647700" cy="647700"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${id}" name="Product ${id}" descr="Product picture"/><xdr:cNvPicPr/></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId${id}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="647700" cy="647700"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>`
  const drawing = (content: string) => `<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${content}</xdr:wsDr>`
  const imageRelations = images.map(({ row, id }) => `<Relationship Id="rId${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/product-${row + 1}.jpg"/>`).join('')
  const completed = new Promise<Buffer>((resolve, reject) => {
    archive.on('data', chunk => chunks.push(chunk))
    archive.on('end', () => resolve(Buffer.concat(chunks)))
    archive.on('error', reject)
  })
  archive.append(`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${hasPictures ? '<Default Extension="jpg" ContentType="image/jpeg"/><Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>' : ''}<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`, { name: '[Content_Types].xml' })
  archive.append(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`, { name: '_rels/.rels' })
  archive.append(`<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Records" sheetId="1" r:id="rId1"/></sheets></workbook>`, { name: 'xl/workbook.xml' })
  archive.append(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`, { name: 'xl/_rels/workbook.xml.rels' })
  archive.append(`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultColWidth="24" defaultRowHeight="15"/>${pictures ? `<cols><col min="${pictures.column + 1}" max="${pictures.column + 1}" width="12" customWidth="1"/></cols>` : ''}<sheetData>${rows.map((row, index) => `<row r="${index + 1}"${index && pictures ? ' ht="56" customHeight="1"' : ''}>${row.map((value, column) => `<c r="${columnName(column)}${index + 1}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`).join('')}</row>`).join('')}</sheetData>${images.length ? '<drawing r:id="rId1"/>' : ''}</worksheet>`, { name: 'xl/worksheets/sheet1.xml' })
  if (hasPictures && pictures) {
    archive.append(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>`, { name: 'xl/worksheets/_rels/sheet1.xml.rels' })
    archive.append(drawing(images.map(({ row, id }) => picture(row + 1, id, pictures.column)).join('')), { name: 'xl/drawings/drawing1.xml' })
    archive.append(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${imageRelations}</Relationships>`, { name: 'xl/drawings/_rels/drawing1.xml.rels' })
    for (const { data, row } of images) archive.append(data, { name: `xl/media/product-${row + 1}.jpg` })
  }
  await archive.finalize()
  return completed
}
