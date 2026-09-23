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
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { inflateRawSync } = require('node:zlib')
const { writeFile } = require('node:fs/promises')
const sharp = require('sharp')
const { recordCsv, recordWorkbook } = require('../dist/services/download-spreadsheet')

function entries(zip) {
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  let offset = zip.readUInt32LE(end + 16)
  const result = {}
  while (zip.readUInt32LE(offset) === 0x02014b50) {
    const length = zip.readUInt16LE(offset + 28)
    const extra = zip.readUInt16LE(offset + 30)
    const comment = zip.readUInt16LE(offset + 32)
    const name = zip.subarray(offset + 46, offset + 46 + length).toString()
    const local = zip.readUInt32LE(offset + 42)
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28)
    const data = zip.subarray(start, start + zip.readUInt32LE(offset + 20))
    result[name] = (zip.readUInt16LE(offset + 10) === 8 ? inflateRawSync(data) : data).toString()
    offset += 46 + length + extra + comment
  }
  return result
}

test('CSV quotes cells, keeps Unicode and protects spreadsheet formulas', () => {
  assert.equal(recordCsv([['SKU', 'Title'], ['00123', 'Été, "studio"'], ['=1+1', '\tformula'], ['  @SUM(A1)', 'line\nbreak']]),
    '\ufeff"SKU","Title"\r\n"00123","Été, ""studio"""\r\n"\'=1+1","\'\tformula"\r\n"\'  @SUM(A1)","line\nbreak"')
})

test('XLSX contains a linked worksheet with string cells, valid coordinates and escaped content', async () => {
  const rows = [['SKU', 'Name'], ['00123', '=1+1'], ['<&"\u0001', 'line\nbreak'], Array.from({ length: 28 }, (_, i) => String(i))]
  const files = entries(await recordWorkbook(rows))
  assert.match(files['[Content_Types].xml'], /spreadsheetml.sheet.main/)
  assert.match(files['xl/_rels/workbook.xml.rels'], /Target="worksheets\/sheet1.xml"/)
  const sheet = files['xl/worksheets/sheet1.xml']
  assert.match(sheet, /<sheetFormatPr defaultColWidth="24" defaultRowHeight="15"\/>/)
  assert.match(sheet, /<c r="A2" t="inlineStr"><is><t xml:space="preserve">00123<\/t>/)
  assert.match(sheet, /<c r="B2" t="inlineStr"><is><t xml:space="preserve">=1\+1<\/t>/)
  assert.match(sheet, /&lt;&amp;&quot;/)
  assert.match(sheet, /<c r="AB4"/)
  assert.equal(sheet.includes('\u0001'), false)
  assert.equal(sheet.includes('<f>'), false)
})

test('XLSX anchors compact product pictures without links or extra sheets', async () => {
  const jpeg = await sharp({ create: { width: 256, height: 256, channels: 3, background: '#c0d0e0' } }).jpeg().toBuffer()
  const files = entries(await recordWorkbook([['Name', 'Picture', 'SKU'], ['Studio', '', '00123'], ['Plain', '', '00124'], ['Other', '', '00125']], {
    column: 1,
    images: [jpeg, null, jpeg],
  }))
  assert.match(files['[Content_Types].xml'], /ContentType="image\/jpeg"/)
  assert.doesNotMatch(files['xl/workbook.xml'], /name="Pictures"/)
  assert.match(files['xl/worksheets/sheet1.xml'], /<drawing r:id="rId1"\/>/)
  assert.match(files['xl/worksheets/sheet1.xml'], /<row r="2" ht="56"/)
  assert.match(files['xl/drawings/drawing1.xml'], /<xdr:col>1<\/xdr:col>.*<xdr:row>1<\/xdr:row>/)
  assert.doesNotMatch(files['xl/drawings/drawing1.xml'], /hlinkClick/)
  assert.match(files['xl/drawings/drawing1.xml'], /<xdr:ext cx="647700" cy="647700"\/>/)
  assert.doesNotMatch(files['xl/drawings/_rels/drawing1.xml.rels'], /relationships\/hyperlink/)
  assert.equal(files['xl/worksheets/sheet2.xml'], undefined)
  assert.equal(files['xl/drawings/drawing2.xml'], undefined)
  assert.ok(files['xl/media/product-1.jpg'])
  assert.equal(files['xl/media/product-2.jpg'], undefined)
  assert.ok(files['xl/media/product-3.jpg'])
  const ids = [...files['xl/drawings/_rels/drawing1.xml.rels'].matchAll(/Id="(rId\d+)"/g)].map(match => match[1])
  assert.equal(new Set(ids).size, ids.length)
})

test('Excel export falls back to the original image when a thumbnail is unavailable', async () => {
  process.env.DOTENV_CONFIG_PATH = '/dev/null'
  process.env.APP_SECRET = 'spreadsheet-tests-only-random-fixture-secret-20260923'
  const env = require('../dist/env')
  const { buildRecordExport } = require('../dist/services/download-record-export')
  const originalS3 = env.assetsS3
  const originalBucket = env.assetsS3Bucket
  const image = await sharp({ create: { width: 900, height: 600, channels: 3, background: '#c0d0e0' } }).png().toBuffer()
  const keys = []
  env.assetsS3 = () => ({ fGetObject: async (_bucket, key, path) => {
    keys.push(key)
    if (key.endsWith('-thumbnail')) throw new Error('Thumbnail unavailable')
    await writeFile(path, image)
  } })
  env.assetsS3Bucket = () => 'fixture'
  try {
    const selection = { columns: [{ id: 'recordKey', label: 'Reference' }, { id: 'picture', label: 'Picture' }], rows: [['00123', '']], recordIds: ['record-1'], pictures: [{ recordId: 'record-1', assetId: 'asset-1' }] }
    const files = entries(await buildRecordExport(selection, ['recordKey', 'picture'], 'xlsx'))
    assert.deepEqual(keys, ['asset-file/asset-1-thumbnail', 'asset-file/asset-1'])
    assert.ok(files['xl/media/product-1.jpg'])
    assert.doesNotMatch(files['xl/workbook.xml'], /name="Pictures"/)
  } finally {
    env.assetsS3 = originalS3
    env.assetsS3Bucket = originalBucket
  }
})
