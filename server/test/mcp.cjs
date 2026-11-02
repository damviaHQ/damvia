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
// AI assistants (Claude, ChatGPT) connected through the MCP server: OAuth
// registration, consent, tokens, and tools that see exactly what the person
// sees. See docs/integrations/ai-assistants.md.
process.env.MCP_ENABLED = 'true'
process.env.API_URL = 'https://api.dam.test'
process.env.APP_URL = 'https://dam.test'
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { createHash, randomBytes, randomUUID } = require('node:crypto')
const sharp = require('sharp')
const harness = require('./lib/helpers.cjs')
const { db, server, storage, save, caller, makeUser, makeCollection, makeFolder, makeFile, makeType, forbidden } = harness
const { CollectionFile, License, UserSession, Group, UserGroup } = harness.entities
let fixtures
let picture
before(async () => {
    fixtures = await harness.setup()
    picture = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#3366cc' } }).png().toBuffer()
    storage.getObject = async () => require('node:stream').Readable.from([picture])
})
after(() => harness.teardown())

const REDIRECT = 'https://assistant.example.com/callback'
const form = body => new URLSearchParams(body).toString()
const verifierPair = () => {
    const verifier = randomBytes(32).toString('base64url')
    return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') }
}

async function register(extra = {}) {
    const reply = await server.inject({ method: 'POST', url: '/v1/oauth/register', payload: { client_name: 'Claude', redirect_uris: [REDIRECT], ...extra } })
    assert.equal(reply.statusCode, 201, reply.body)
    return reply.json()
}

async function authorize(user, client, extra = {}) {
    const { verifier, challenge } = verifierPair()
    const request = { response_type: 'code', client_id: client.client_id, redirect_uri: REDIRECT, code_challenge: challenge, code_challenge_method: 'S256', state: 'xyz', resource: 'https://api.dam.test/v1/mcp', ...extra }
    const { redirectTo } = await caller(user).oauth.approve(request)
    const url = new URL(redirectTo)
    return { code: url.searchParams.get('code'), state: url.searchParams.get('state'), verifier }
}

async function connect(user, client) {
    client ??= await register()
    const { code, verifier } = await authorize(user, client)
    const reply = await server.inject({
        method: 'POST', url: '/v1/oauth/token', headers: { 'content-type': 'application/x-www-form-urlencoded' },
        payload: form({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: REDIRECT, client_id: client.client_id }),
    })
    assert.equal(reply.statusCode, 200, reply.body)
    return { client, ...reply.json() }
}

let rpcId = 0
async function mcp(token, method, params = {}, headers = {}) {
    const reply = await server.inject({
        method: 'POST', url: '/v1/mcp',
        headers: { authorization: `Bearer ${token}`, accept: 'application/json, text/event-stream', 'content-type': 'application/json', ...headers },
        payload: { jsonrpc: '2.0', id: ++rpcId, method, params },
    })
    return reply
}
async function callTool(token, name, args = {}) {
    const reply = await mcp(token, 'tools/call', { name, arguments: args })
    assert.equal(reply.statusCode, 200, reply.body)
    const body = reply.json()
    assert(!body.error, JSON.stringify(body.error))
    return body.result
}
const data = result => JSON.parse(result.content[0].text.split('\n').at(-1))

test('the endpoints describe themselves and an unauthenticated call points to them', async () => {
    const as = (await server.inject({ method: 'GET', url: '/.well-known/oauth-authorization-server' })).json()
    assert.equal(as.issuer, 'https://api.dam.test')
    assert.equal(as.token_endpoint, 'https://api.dam.test/v1/oauth/token')
    assert.deepEqual(as.code_challenge_methods_supported, ['S256'])
    const pr = (await server.inject({ method: 'GET', url: '/.well-known/oauth-protected-resource/v1/mcp' })).json()
    assert.equal(pr.resource, 'https://api.dam.test/v1/mcp')
    assert.deepEqual(pr.authorization_servers, ['https://api.dam.test'])
    const reply = await server.inject({ method: 'POST', url: '/v1/mcp', payload: {} })
    assert.equal(reply.statusCode, 401)
    assert.match(reply.headers['www-authenticate'], /resource_metadata="https:\/\/api\.dam\.test\/\.well-known\/oauth-protected-resource\/v1\/mcp"/)
    const bad = await mcp('nope', 'tools/list')
    assert.equal(bad.statusCode, 401)
    assert.match(bad.headers['www-authenticate'], /invalid_token/)
})

test('registration refuses unsafe return addresses and the consent page names the assistant', async () => {
    for (const uris of [[], ['http://evil.example.com/cb'], ['javascript:alert(1)'], ['https://a.example.com/cb#frag']]) {
        const reply = await server.inject({ method: 'POST', url: '/v1/oauth/register', payload: { client_name: 'X', redirect_uris: uris } })
        assert.equal(reply.statusCode, 400, JSON.stringify(uris))
    }
    const local = await register({ redirect_uris: ['http://localhost:6274/callback'] })
    assert.equal(local.token_endpoint_auth_method, 'none')
    const client = await register()
    const { challenge } = verifierPair()
    const request = { response_type: 'code', client_id: client.client_id, redirect_uri: REDIRECT, code_challenge: challenge, code_challenge_method: 'S256' }
    const described = await caller(fixtures.member).oauth.describe(request)
    assert.equal(described.client.name, 'Claude')
    assert.equal(described.client.returnsTo, 'assistant.example.com')
    assert.equal(described.refusal, null)
    assert(!described.scopes.includes('damvia.admin'))
    assert((await caller(fixtures.admin).oauth.describe(request)).scopes.includes('damvia.admin'))
    await assert.rejects(caller(fixtures.member).oauth.describe({ ...request, redirect_uri: 'https://other.example.com/cb' }), /return address/)
    const noPkce = await caller(fixtures.member).oauth.describe({ ...request, code_challenge: undefined })
    assert.match(noPkce.errorRedirect, /^https:\/\/assistant\.example\.com\/callback\?error=invalid_request/)
    const denied = await caller(fixtures.member).oauth.deny({ ...request, state: 's1' })
    assert.equal(new URL(denied.redirectTo).searchParams.get('error'), 'access_denied')
    assert.equal(new URL(denied.redirectTo).searchParams.get('state'), 's1')
    await forbidden(caller(null).oauth.describe(request))
})

test('guests and unapproved people cannot connect an assistant', async () => {
    const client = await register()
    const { challenge } = verifierPair()
    const request = { response_type: 'code', client_id: client.client_id, redirect_uri: REDIRECT, code_challenge: challenge, code_challenge_method: 'S256' }
    const guest = await db.getRepository(harness.entities.User).findOneByOrFail({ id: fixtures.guest.id })
    assert.equal((await caller(guest).oauth.describe(request)).refusal, 'guest')
    await forbidden(caller(guest).oauth.approve(request))
})

test('a code works once, with its verifier, for its client and return address', async () => {
    const client = await register()
    const { code, state, verifier } = await authorize(fixtures.member, client)
    assert.equal(state, 'xyz')
    const exchange = (body, headers = {}) => server.inject({ method: 'POST', url: '/v1/oauth/token', headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers }, payload: form(body) })
    const base = { grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: REDIRECT, client_id: client.client_id }
    assert.equal((await exchange({ ...base, code_verifier: 'wrong-verifier-wrong-verifier-wrong-verifier' })).json().error, 'invalid_grant')
    // The failed attempt consumed the code: a code is single use whatever happens.
    assert.equal((await exchange(base)).json().error, 'invalid_grant')
    const second = await authorize(fixtures.member, client)
    const other = await register()
    assert.equal((await exchange({ ...base, code: second.code, code_verifier: second.verifier, client_id: other.client_id })).json().error, 'invalid_grant')
    const third = await authorize(fixtures.member, client)
    const ok = await exchange({ ...base, code: third.code, code_verifier: third.verifier }, { origin: 'https://claude.ai' })
    assert.equal(ok.statusCode, 200, ok.body)
    assert.equal(ok.headers['cache-control'], 'no-store')
    const tokens = ok.json()
    assert.equal(tokens.token_type, 'Bearer')
    assert.equal(tokens.expires_in, 3600)
    assert.equal((await exchange({ ...base, code: third.code, code_verifier: third.verifier })).json().error, 'invalid_grant')
    const session = await db.getRepository(UserSession).findOneByOrFail({ userId: fixtures.member.id, method: 'mcp', clientLabel: 'Claude' })
    assert(session)
})

test('a confidential client must prove itself with its secret', async () => {
    const client = await register({ token_endpoint_auth_method: 'client_secret_basic' })
    assert(client.client_secret)
    const { code, verifier } = await authorize(fixtures.member, client)
    const body = form({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: REDIRECT })
    const without = await server.inject({ method: 'POST', url: '/v1/oauth/token', headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: body + `&client_id=${client.client_id}` })
    assert.equal(without.statusCode, 401)
    const second = await authorize(fixtures.member, client)
    const basic = Buffer.from(`${client.client_id}:${client.client_secret}`).toString('base64')
    const ok = await server.inject({ method: 'POST', url: '/v1/oauth/token', headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: `Basic ${basic}` }, payload: form({ grant_type: 'authorization_code', code: second.code, code_verifier: second.verifier, redirect_uri: REDIRECT }) })
    assert.equal(ok.statusCode, 200, ok.body)
})

test('refresh tokens rotate, a replayed one ends the connection, and revocation ends it too', async () => {
    const connection = await connect(fixtures.member)
    const refresh = body => server.inject({ method: 'POST', url: '/v1/oauth/token', payload: { grant_type: 'refresh_token', client_id: connection.client.client_id, ...body } })
    const next = (await refresh({ refresh_token: connection.refresh_token })).json()
    assert(next.access_token && next.refresh_token && next.refresh_token !== connection.refresh_token)
    assert.equal((await mcp(connection.access_token, 'tools/list')).statusCode, 401, 'the old access token is replaced')
    assert.equal((await mcp(next.access_token, 'tools/list')).statusCode, 200)
    assert.equal((await refresh({ refresh_token: connection.refresh_token })).json().error, 'invalid_grant')
    assert.equal((await mcp(next.access_token, 'tools/list')).statusCode, 401, 'replaying an old refresh token ends the connection')

    const other = await connect(fixtures.member)
    const revoked = await server.inject({ method: 'POST', url: '/v1/oauth/revoke', payload: { token: other.refresh_token, client_id: other.client.client_id } })
    assert.equal(revoked.statusCode, 200)
    assert.equal((await mcp(other.access_token, 'tools/list')).statusCode, 401)
})

test('the person sees the connection among their sessions and can end it; suspension ends it as well', async () => {
    const user = await makeUser()
    const connection = await connect(user)
    const sessions = await caller(user).auth.sessions()
    const mine = sessions.find(session => session.method === 'mcp')
    assert.equal(mine.clientLabel, 'Claude')
    await caller(user).auth.revokeSession({ id: mine.id })
    assert.equal((await mcp(connection.access_token, 'tools/list')).statusCode, 401)

    const again = await connect(user)
    await caller(fixtures.admin).user.suspend(user.id)
    assert.equal((await mcp(again.access_token, 'tools/list')).statusCode, 401)
})

test('assistant sessions are not ended by idleness, browser sessions are', async () => {
    const user = await makeUser()
    await connect(user)
    await db.query(`UPDATE user_sessions SET last_seen_at = now() - interval '3 days' WHERE user_id = $1`, [user.id])
    await harness.services.session.pruneExpiredSessions()
    assert.equal(await db.getRepository(UserSession).countBy({ userId: user.id, method: 'mcp' }), 1)
})

test('tools see what the person sees: groups and licences apply, originals never leave', async () => {
    const packshot = await makeType('Packshot MCP', { isRelatedToRecords: true })
    const folder = await makeFolder({ name: 'Open folder', assetTypeId: packshot.id })
    const open = await makeCollection({ assetFolderId: folder.id, name: 'Open MCP' })
    const visible = await makeFile(folder, { name: 'visible-shoe.png', hasThumbnail: true, assetTypeId: packshot.id })
    const visibleRow = await save(CollectionFile, { collectionId: open.id, assetFileId: visible.id })

    const team = await save(Group, { name: 'Restricted team' })
    const hiddenFolder = await makeFolder({ name: 'Hidden folder' })
    const restricted = await makeCollection({ assetFolderId: hiddenFolder.id, name: 'Restricted MCP', limitedToGroupIds: [team.id] })
    const hidden = await makeFile(hiddenFolder, { name: 'hidden-shoe.png', hasThumbnail: true })
    const hiddenRow = await save(CollectionFile, { collectionId: restricted.id, assetFileId: hidden.id })

    const elsewhere = await save(harness.entities.Region, { name: 'Elsewhere', defaultGroupId: fixtures.group.id })
    const licence = await save(License, { name: 'Elsewhere only', scopes: ['digital'], allowedRegionIds: [elsewhere.id] })
    const licensedFolder = await makeFolder({ name: 'Licensed folder', licenseId: licence.id })
    const licensedCollection = await makeCollection({ assetFolderId: licensedFolder.id, name: 'Licensed MCP' })
    const licensed = await makeFile(licensedFolder, { name: 'licensed-shoe.png', hasThumbnail: true, licenseId: licence.id })
    const licensedRow = await save(CollectionFile, { collectionId: licensedCollection.id, assetFileId: licensed.id })

    const member = await makeUser()
    const { access_token: token } = await connect(member)

    const listed = (await mcp(token, 'tools/list')).json().result.tools.map(tool => tool.name)
    for (const name of ['get_context', 'search_products', 'lookup_references', 'get_product', 'search_files', 'view_files', 'get_variants', 'list_collections', 'get_collection', 'whats_new']) assert(listed.includes(name), name)

    const context = data(await callTool(token, 'get_context'))
    assert.equal(context.person.role, 'member')
    assert(context.asset_types.some(type => type.name === 'Packshot MCP' && type.product_pictures))

    const search = await callTool(token, 'search_files', { query: 'shoe' })
    const found = data(search).files.map(file => file.name)
    assert(found.includes('visible-shoe.png'))
    assert(!found.includes('hidden-shoe.png'), 'group restriction')
    assert(!found.includes('licensed-shoe.png'), 'licence region')
    const text = JSON.stringify(search)
    assert(!/fileURL|asset-file\/[0-9a-f-]{36}"/.test(text), 'no address of an original')
    assert.equal(data(search).files.find(file => file.name === 'visible-shoe.png').asset_type, 'Packshot MCP')

    const collections = data(await callTool(token, 'list_collections', { name: 'MCP' })).collections.map(collection => collection.name)
    assert(collections.includes('Open MCP') && !collections.includes('Restricted MCP'))
    const blocked = await callTool(token, 'get_collection', { collection_id: restricted.id })
    assert(blocked.isError)

    // Previews: the visible file is shown, the others are not.
    const viewed = await callTool(token, 'view_files', { file_ids: [visibleRow.id, hiddenRow.id, licensedRow.id] })
    const images = viewed.content.filter(item => item.type === 'image')
    assert.equal(images.length, 1)
    const meta = await sharp(Buffer.from(images[0].data, 'base64')).metadata()
    assert.equal(meta.width, 512)
    assert.match(viewed.content.at(-1).text, new RegExp(hiddenRow.id))
    const sheet = await callTool(token, 'view_files', { file_ids: [visibleRow.id, visibleRow.id], layout: 'contact_sheet' })
    assert.equal(sheet.content.filter(item => item.type === 'image').length, 1)
    const views = await db.query(`SELECT count(*)::int AS n FROM activity_events WHERE user_id = $1 AND type = 'asset_view' AND metadata->>'channel' = 'mcp'`, [member.id])
    assert(views[0].n >= 2)

    // A member of the group sees the restricted file.
    const insider = await makeUser()
    await save(UserGroup, { userId: insider.id, groupId: team.id })
    const insiderToken = (await connect(insider)).access_token
    assert(data(await callTool(insiderToken, 'search_files', { query: 'shoe' })).files.some(file => file.name === 'hidden-shoe.png'))
})

test('products are found by reference, with close matches for those that are missing', async () => {
    const { makeRecord } = harness
    await makeRecord('MCP-02351-008', { Code: 'MCP-02351-008' })
    await makeRecord('MCP-04412-0010', { Code: 'MCP-04412-0010' })
    const catalogue = await makeCollection({ name: 'Catalogue MCP', includesAllRecords: true, catalogueMode: 'products' })
    assert(catalogue)
    const { access_token: token } = await connect(await makeUser())
    const lookup = data(await callTool(token, 'lookup_references', { references: ['mcp-02351-008', 'MCP-04412-001', 'NOPE-1'] }))
    assert.deepEqual(lookup.found.map(product => product.reference), ['MCP-02351-008'])
    const missing = Object.fromEntries(lookup.missing.map(item => [item.reference, item.close_matches.map(match => match.reference)]))
    assert.deepEqual(missing['MCP-04412-001'], ['MCP-04412-0010'])
    assert.deepEqual(missing['NOPE-1'], [])
    const products = data(await callTool(token, 'search_products', { query: 'MCP-02351' }))
    assert.equal(products.products[0].reference, 'MCP-02351-008')
    const product = data(await callTool(token, 'get_product', { product_id: products.products[0].product_id }))
    assert.equal(product.reference, 'MCP-02351-008')
})

test('a foreign Origin does not block the assistant endpoints, and the endpoint answers POST only', async () => {
    const { access_token: token } = await connect(fixtures.member)
    const reply = await mcp(token, 'tools/list', {}, { origin: 'https://claude.ai' })
    assert.equal(reply.statusCode, 200)
    assert.equal((await server.inject({ method: 'GET', url: '/v1/mcp' })).statusCode, 405)
    // The cookie alone never opens the endpoint.
    assert.equal((await server.inject({ method: 'POST', url: '/v1/mcp', headers: { cookie: 'damvia_session=whatever' }, payload: {} })).statusCode, 401)
})
