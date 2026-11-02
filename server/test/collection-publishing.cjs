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
// Draft catalogue collections published by themselves at a time an admin
// chose. See docs/administration/collections-and-sharing.md.
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const harness = require('./lib/helpers.cjs')
const { db, state, caller, makeUser, makeCollection, forbidden, collectionRow: row } = harness
const { userCollectionsQuery } = harness.services.collections
let admin, member, manager, guest
before(async () => ({ admin, member, manager, guest } = await harness.setup()))
after(() => harness.teardown())

const inAnHour = () => new Date(Date.now() + 3600_000)
const visibleTo = async (user, id) => !!await userCollectionsQuery(user).andWhere('collection.id = :id', { id }).getOne()
const runPublishing = () => state.processors.get('collection/publish-scheduled')([{ id: randomUUID(), name: 'collection/publish-scheduled', data: null }])
// Moves a schedule into the past, as time passing would.
const makeDue = (id, minutesAgo = 1) => db.query(`UPDATE collections SET publish_at = now() - make_interval(mins => $2) WHERE id = $1`, [id, minutesAgo])
const auditOf = async id => db.query(`SELECT action, actor_id AS "actorId", before, after FROM audit_log WHERE target_id = $1 ORDER BY created_at, id`, [id])

async function draftTree() {
    const parent = await makeCollection({ draft: true })
    const child = await makeCollection({ draft: true, parent })
    return { parent, child }
}

test('only admins schedule and unschedule a publication', async () => {
    const { parent } = await draftTree()
    for (const user of [null, guest, member, manager, { ...admin, approved: false }]) {
        await forbidden(caller(user).collection.schedulePublish({ id: parent.id, at: inAnHour() }))
        await forbidden(caller(user).collection.unschedulePublish(parent.id))
    }
    assert.equal((await row(parent.id)).publishAt, null)
})

test('a schedule needs a draft of the catalogue and a time within the next year', async () => {
    const { parent } = await draftTree()
    const as = caller(admin).collection
    await assert.rejects(as.schedulePublish({ id: parent.id, at: new Date(Date.now() - 3600_000) }), /future/)
    await assert.rejects(as.schedulePublish({ id: parent.id, at: new Date(Date.now() + 400 * 24 * 3600_000) }), /within a year/)
    await assert.rejects(as.schedulePublish({ id: randomUUID(), at: inAnHour() }), e => e.code === 'NOT_FOUND')
    const published = await makeCollection()
    await assert.rejects(as.schedulePublish({ id: published.id, at: inAnHour() }), /already published/)
    const personal = await makeCollection({ public: false, ownerId: admin.id })
    await assert.rejects(as.schedulePublish({ id: personal.id, at: inAnHour() }), /catalogue/)
    assert.deepEqual(await auditOf(parent.id), [], 'nothing refused is recorded')
})

test('a scheduled draft stays hidden until its time, then publishes with everything inside it', async () => {
    const { parent, child } = await draftTree()
    const at = inAnHour()
    const scheduled = await caller(admin).collection.schedulePublish({ id: parent.id, at })
    assert.equal(new Date(scheduled.publishAt).getTime(), at.getTime())
    assert.equal(scheduled.draft, true)
    const tree = await caller(admin).collection.treeAdmin()
    assert.equal(new Date(tree.find(item => item.id === parent.id).publishAt).getTime(), at.getTime(), 'the admin tree shows when it publishes')

    await runPublishing()
    assert.equal((await row(parent.id)).draft, true, 'not due yet')
    assert.equal(await visibleTo(member, parent.id), false)

    await makeDue(parent.id)
    await runPublishing()
    for (const id of [parent.id, child.id]) {
        const after = await row(id)
        assert.equal(after.draft, false)
        assert.equal(after.publishAt, null)
        assert.equal(after.publishScheduledById, null)
        assert.equal(await visibleTo(member, id), true)
    }

    const audit = await auditOf(parent.id)
    assert.deepEqual(audit.map(entry => entry.action), ['collection.publish_scheduled', 'collection.access_changed'])
    assert.equal(new Date(audit[0].after.publishAt).getTime(), at.getTime())
    assert.equal(audit[1].actorId, admin.id, 'the publication is recorded on behalf of whoever scheduled it')
    assert.deepEqual([audit[1].before.draft, audit[1].after.draft], [true, false])
    assert.ok(audit[1].after.scheduledFor)

    await runPublishing()
    assert.equal((await auditOf(parent.id)).length, 2, 'a published collection is not published again')
})

test('a due ancestor publishes its due descendants once, and a later one only at its own time', async () => {
    const parent = await makeCollection({ draft: true })
    const due = await makeCollection({ draft: true, parent })
    const elsewhere = await makeCollection({ draft: true })
    const later = await makeCollection({ draft: true })
    for (const collection of [parent, due, elsewhere, later]) await caller(admin).collection.schedulePublish({ id: collection.id, at: inAnHour() })
    await makeDue(due.id, 5)
    await makeDue(parent.id, 2)
    await makeDue(elsewhere.id)

    assert.equal(await harness.services.collections.publishDueCollections(), 2)
    for (const id of [parent.id, due.id, elsewhere.id]) assert.equal((await row(id)).draft, false)
    assert.deepEqual((await auditOf(due.id)).map(entry => entry.action), ['collection.publish_scheduled'], 'published with its parent, not on its own')
    const waiting = await row(later.id)
    assert.equal(waiting.draft, true)
    assert.ok(waiting.publishAt)
})

test('taking the time again replaces it, and unscheduling keeps the draft hidden', async () => {
    const { parent } = await draftTree()
    await caller(admin).collection.schedulePublish({ id: parent.id, at: inAnHour() })
    const later = new Date(Date.now() + 2 * 3600_000)
    await caller(admin).collection.schedulePublish({ id: parent.id, at: later })
    assert.equal((await row(parent.id)).publishAt.getTime(), later.getTime())

    const result = await caller(admin).collection.unschedulePublish(parent.id)
    assert.equal(result.publishAt, null)
    await runPublishing()
    const after = await row(parent.id)
    assert.equal(after.draft, true)
    assert.equal(after.publishAt, null)
    assert.deepEqual((await auditOf(parent.id)).map(entry => entry.action), ['collection.publish_scheduled', 'collection.publish_scheduled', 'collection.publish_unscheduled'])
    await caller(admin).collection.unschedulePublish(parent.id)
    assert.equal((await auditOf(parent.id)).length, 3, 'nothing to unschedule records nothing')
})

test('publishing by hand, or moving under a published parent, drops the schedule', async () => {
    const byHand = await makeCollection({ draft: true })
    const inside = await makeCollection({ draft: true, parent: byHand })
    await caller(admin).collection.schedulePublish({ id: byHand.id, at: inAnHour() })
    await caller(admin).collection.schedulePublish({ id: inside.id, at: inAnHour() })
    const saved = await caller(admin).collection.update({ id: byHand.id, name: byHand.name, draft: false })
    assert.equal(saved.publishAt, null)
    for (const id of [byHand.id, inside.id]) {
        assert.equal((await row(id)).draft, false)
        assert.equal((await row(id)).publishAt, null)
    }

    const moving = await makeCollection({ draft: true })
    await caller(admin).collection.schedulePublish({ id: moving.id, at: inAnHour() })
    const destination = await makeCollection()
    const moved = await caller(admin).collection.move({ id: moving.id, parentId: destination.id })
    assert.equal(moved.publishAt, null)
    assert.equal((await row(moving.id)).draft, false)
    assert.equal((await row(moving.id)).publishAt, null)

    // Saving a draft without publishing it keeps its time.
    const kept = await makeCollection({ draft: true })
    await caller(admin).collection.schedulePublish({ id: kept.id, at: inAnHour() })
    await caller(admin).collection.update({ id: kept.id, name: kept.name, description: 'Spring', draft: true })
    assert.ok((await row(kept.id)).publishAt)
})

test('only editors are told when a collection publishes', async () => {
    const collection = await makeCollection({ draft: true })
    await caller(admin).collection.schedulePublish({ id: collection.id, at: inAnHour() })
    const { formatCollection } = require('../dist/trpc/router/collection')
    const full = await db.getRepository(harness.entities.Collection).findOneByOrFail({ id: collection.id })
    assert.ok((await formatCollection({ collection: full, user: admin })).publishAt)
    assert.equal((await formatCollection({ collection: full, user: member })).publishAt, undefined)
    assert.equal((await formatCollection({ collection: full })).publishAt, undefined)
})
