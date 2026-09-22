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
// How the reader-facing catalogue behaves on a catalogue of a realistic size.
// Not part of `npm test`: it seeds tens of thousands of rows and reports
// timings rather than asserting. Run it against a disposable database:
//   SECURITY_TEST_DATABASE_URL=postgresql://dam:dam@localhost/dam_test \
//     RECORDS=20000 node test/bench/catalogue.cjs
// Recreate that database first; a suite run leaves dropped columns behind.
// Seeds a catalogue at a realistic size and times the reader-facing queries.
const harness = require('../lib/helpers.cjs')
const { db, caller, makeCollection, makeUser, save } = harness
const RECORDS = Number(process.env.RECORDS ?? 20000)
const FILES_PER_RECORD = 3

function log(line) { process.stdout.write(line + '\n') }
async function step(label, fn) { const t = Date.now(); const r = await fn(); log(`[seed] ${label}: ${Date.now() - t} ms`); return r }

async function time(label, fn, runs = 3) {
  await fn()
  const times = []
  for (let i = 0; i < runs; i++) { const t = process.hrtime.bigint(); await fn(); times.push(Number(process.hrtime.bigint() - t) / 1e6) }
  times.sort((a, b) => a - b)
  log(`${label.padEnd(46)} median ${times[Math.floor(runs / 2)].toFixed(0).padStart(6)} ms`)
  return times[Math.floor(runs / 2)]
}

;(async () => {
  const fixtures = await harness.setup()
  harness.env.assetsS3 = () => ({ presignedGetObject: async (_b, k) => `https://x/${k}` })
  const admin = caller(fixtures.admin)
  for (const [name, facetable, searchable] of [['season', true, true], ['colour', true, false], ['style', false, true], ['material', false, false], ['gender', true, false], ['cost', false, false]]) {
    await admin.recordAttribute.create({ name, displayName: name, valueType: 'text', facetable, viewable: name !== 'cost', searchable })
  }
  log(`seeding ${RECORDS} records and ${RECORDS * FILES_PER_RECORD} files`)
  const [{ id: tableId }] = await db.query('SELECT id FROM record_tables LIMIT 1')
  await step('records', () => db.query(`
    INSERT INTO records (record_key, key_column_name, table_id, meta_data)
    SELECT 'SKU-' || i, 'SKU', $2::uuid,
      hstore(ARRAY['season','colour','style','material','gender','cost'],
             ARRAY['S' || (i % 8), 'C' || (i % 24), 'Style ' || (i % 900), 'M' || (i % 12), (ARRAY['Men','Women','Unisex'])[1 + i % 3], (10 + i % 90) || '.00'])
    FROM generate_series(1, $1) AS i
  `, [RECORDS, tableId]))
  const folder = await harness.makeFolder({ name: 'Packshots' })
  await step('files', () => db.query(`
    INSERT INTO asset_files (name, status, external_id, external_checksum, size, mime_type, folder_id, has_thumbnail, record_id, record_view)
    SELECT r.record_key || '-' || lpad(v::text, 2, '0') || '.jpg', 'up_to_date', gen_random_uuid()::text, 'c', '1', 'image/jpeg', $1::uuid, true, r.id, lpad(v::text, 2, '0')
    FROM records r CROSS JOIN generate_series(0, $2 - 1) AS v
  `, [folder.id, FILES_PER_RECORD]))
  const library = await makeCollection({ name: 'Library' })
  // The per-row triggers of collection_files are the sync's business, not the
  // catalogue's; seeding around them keeps the run about the reader queries.
  await db.query('ALTER TABLE collection_files DISABLE TRIGGER USER')
  await step('collection_files', () => db.query(`INSERT INTO collection_files (collection_id, asset_file_id) SELECT $1::uuid, id FROM asset_files`, [library.id]))
  await db.query('ALTER TABLE collection_files ENABLE TRIGGER USER')
  await db.query(`UPDATE collections SET number_of_files = (SELECT count(*) FROM collection_files WHERE collection_id = collections.id)`)
  const catalogue = await makeCollection({ name: 'Catalogue' })
  await step('collection_records', () => db.query(`INSERT INTO collection_records (collection_id, record_id) SELECT $1::uuid, id FROM records`, [catalogue.id]))
  await step('analyze', () => db.query('ANALYZE records; ANALYZE asset_files; ANALYZE collection_records; ANALYZE collection_files'))
  const member = await makeUser()
  const reader = caller(member)

  log('--- reader facing, ' + RECORDS + ' products ---')
  await time('catalogue.list, first page', () => reader.catalogue.list({ offset: 0, limit: 48 }))
  await time('catalogue.list, page 20', () => reader.catalogue.list({ offset: 960, limit: 48 }))
  await time('catalogue.list, one facet chosen', () => reader.catalogue.list({ offset: 0, limit: 48, filters: [{ column: 'season', op: 'has_any', values: ['S1'] }] }))
  await time('catalogue.list, free text', () => reader.catalogue.list({ offset: 0, limit: 48, search: 'Style 42' }))
  await time('catalogue.facets, no filter', () => reader.catalogue.facets({}))
  await time('catalogue.facets, one facet chosen', () => reader.catalogue.facets({ filters: [{ column: 'season', op: 'has_any', values: ['S1'] }] }))
  await time('catalogue.families', () => reader.catalogue.families({ offset: 0, limit: 96 }))
  await time('catalogue.get', async () => {
    const [{ id }] = await db.query(`SELECT id FROM records WHERE record_key = 'SKU-500'`)
    return reader.catalogue.get(id)
  })
  await db.query(`UPDATE enrichment_settings SET hide_records_without_media = true WHERE id = 1`)
  await time('catalogue.list, hiding products without media', () => reader.catalogue.list({ offset: 0, limit: 48 }))
  await db.query(`UPDATE enrichment_settings SET hide_records_without_media = false WHERE id = 1`)
  await harness.teardown()
})()
