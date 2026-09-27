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
// XMP packets and C2PA manifests read from files. See docs/administration/records.md.
const { test } = require('node:test')
const assert = require('node:assert/strict')
require('./lib/offline.cjs')
const { parseXmp, flattenMetadata, hasC2paManifest } = require('../dist/services/file-metadata')

test('XMP properties are read from elements, lists and attributes, with entities decoded', () => {
    const packet = Buffer.from(`<?xpacket begin=""?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
      <rdf:Description rdf:about="" xmp:Rating="4" photoshop:Credit="Studio &amp; Co" xmpRights:Marked='True'>
        <dc:title><rdf:Alt><rdf:li xml:lang="x-default">Autumn &#x2014; look 3</rdf:li></rdf:Alt></dc:title>
        <dc:subject><rdf:Bag><rdf:li>coat</rdf:li><rdf:li>wool</rdf:li><rdf:li/></rdf:Bag></dc:subject>
        <dc:creator><rdf:Seq><rdf:li>Alex Doe</rdf:li></rdf:Seq></dc:creator>
        <xmpRights:UsageTerms><rdf:Alt><rdf:li xml:lang="x-default">Web only until 2027</rdf:li></rdf:Alt></xmpRights:UsageTerms>
        <photoshop:DateCreated>2026-03-01T10:00:00</photoshop:DateCreated>
        <dc:titleExtra>not a property</dc:titleExtra>
      </rdf:Description></rdf:RDF></x:xmpmeta>`)
    const values = parseXmp(packet).map(({ name, value }) => `${name}=${value}`)
    for (const expected of ['dc:title=Autumn — look 3', 'dc:subject=coat', 'dc:subject=wool', 'dc:creator=Alex Doe', 'photoshop:Credit=Studio & Co', 'xmpRights:Marked=True', 'xmpRights:UsageTerms=Web only until 2027', 'xmp:Rating=4', 'photoshop:DateCreated=2026-03-01T10:00:00']) {
        assert(values.includes(expected), `${expected} in ${values.join(' | ')}`)
    }
    assert(!values.some(value => value.includes('not a property')))
    const flat = flattenMetadata(null, null, packet, true)
    assert.deepEqual(flat.find(value => value.field === 'xmp.xmp.Rating'), { field: 'xmp.xmp.Rating', type: 'number', text: '4', date: null, number: 4 })
    assert.equal(flat.find(value => value.field === 'xmp.photoshop.DateCreated').type, 'date')
    assert(flat.some(value => value.field === 'c2pa.manifest' && value.text === 'present'))
    const started = Date.now()
    parseXmp(Buffer.from('<dc:title>'.repeat(20000) + '<rdf:li>'.repeat(20000)))
    assert(Date.now() - started < 1000, 'a crafted packet is scanned in linear time')
    assert.equal(hasC2paManifest(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xeb]), Buffer.from('..JP..jumb....jumdc2pa....')])), true)
    assert.equal(hasC2paManifest(Buffer.from('\x89PNG....caBX....')), true)
    assert.equal(hasC2paManifest(Buffer.from('a photo about c2pa without a manifest')), false)
})
