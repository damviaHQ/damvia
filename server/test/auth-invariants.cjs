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
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const harness = require('./lib/helpers.cjs')
const { appRouter, caller, makeUser } = harness
const PUBLIC = ['env', 'user.create', 'user.login', 'user.sendResetPasswordEmail', 'user.resetPassword', 'settings.getClientLogo', 'settings.getAuthBackgroundImage']
const ACCOUNT_MANAGEMENT = ['user.me', 'user.updateProfile', 'user.verifyEmail', 'user.removeAccount', 'user.resendVerificationEmail', 'productAttribute.listFacets', 'collection.invitation.getUserInvitations']
const paths = Object.keys(appRouter._def.procedures)
const call = (user, path) => path.split('.').reduce((node, key) => node[key], caller(user))(undefined)
const unauthorized = async (user, path) => {
    try { await call(user, path) } catch (error) { return error.code === 'UNAUTHORIZED' }
    return false
}
before(() => harness.setup())
after(() => harness.teardown())

test('every procedure outside the public allowlist rejects an anonymous caller before reading its input', async () => {
    assert.ok(paths.length > 100)
    for (const path of PUBLIC) assert.ok(paths.includes(path), `${path} is not a procedure`)
    const leaks = []
    for (const path of paths) {
        const rejected = await unauthorized(null, path)
        if (PUBLIC.includes(path) ? rejected : !rejected) leaks.push(path)
    }
    assert.deepEqual(leaks, [])
})

test('an unverified, unapproved account can reach only the public and account-management procedures', async () => {
    const pending = await makeUser('member', { approved: false, emailVerified: false })
    const reachable = []
    for (const path of paths) if (!(await unauthorized(pending, path))) reachable.push(path)
    assert.deepEqual(reachable.sort(), [...PUBLIC, ...ACCOUNT_MANAGEMENT].sort())
})
