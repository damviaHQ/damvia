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
// Branded emails edited in the admin. See docs/administration/emails.md.
const { test, before, after, beforeEach } = require('node:test')
const assert = require('node:assert/strict')
const harness = require('./lib/helpers.cjs')
const { env, db, caller, makeUser, forbidden, state, server, appRouter } = harness
const mailer = require('../dist/services/mailer')
const rateLimit = require('../dist/services/rate-limit')
const { EMAIL_DEFINITIONS } = require('../dist/mail/catalogue')
let admin, member, manager, guest
before(async () => ({ admin, member, manager, guest } = await harness.setup()))
after(() => harness.teardown())
beforeEach(async () => {
    rateLimit.resetRateLimits()
    state.sentMails.length = 0
    await db.query('DELETE FROM email_templates')
    await db.query(`UPDATE email_settings SET sender_name = NULL, sender_address = NULL, reply_to = NULL, footer_text = ''`)
    await db.query('UPDATE brand_settings SET accent_color = NULL, brand_name = NULL')
})

const content = (overrides = {}) => ({ subject: 'Hello {{ user.name }}', preheader: 'Pre', heading: 'Welcome {{ user.name }}', bodyHtml: '<p>Body for {{ user.name }}</p>', buttonLabel: 'Go', ...overrides })

test('only admins manage emails and the brand colour; everyone can read the colour', async () => {
    const draft = { key: 'user-approved', content: content() }
    for (const user of [null, guest, member, manager, { ...admin, approved: false }]) {
        await forbidden(caller(user).emailTemplate.list())
        await forbidden(caller(user).emailTemplate.get('login'))
        await forbidden(caller(user).emailTemplate.update(draft))
        await forbidden(caller(user).emailTemplate.reset('login'))
        await forbidden(caller(user).emailTemplate.preview(draft))
        await forbidden(caller(user).emailTemplate.sendTest(draft))
        await forbidden(caller(user).emailTemplate.getSettings())
        await forbidden(caller(user).emailTemplate.updateSettings({ senderName: 'x', senderAddress: null, replyTo: null, footerText: '' }))
        await forbidden(caller(user).settings.updateBrandTheme({ accentColor: '#ff0000' }))
    }
    assert.deepEqual(await caller(null).settings.getBrandTheme(), { accentColor: null, brandName: null })
    await assert.rejects(caller(admin).emailTemplate.get('not-a-template'))
    for (const accentColor of ['red', '#fff', '#12345g', 'url(x)']) {
        await assert.rejects(caller(admin).settings.updateBrandTheme({ accentColor }))
    }
    await caller(admin).settings.updateBrandTheme({ accentColor: '#FF6600' })
    assert.deepEqual(await caller(guest).settings.getBrandTheme(), { accentColor: '#ff6600', brandName: null })
    await assert.rejects(caller(admin).settings.updateBrandTheme({}))
    await assert.rejects(caller(admin).settings.updateBrandTheme({ brandName: 'x'.repeat(121) }))
})

test('every template renders its default with its sample values, as HTML and text', async () => {
    const list = await caller(admin).emailTemplate.list()
    assert.deepEqual(list.map(item => item.key), EMAIL_DEFINITIONS.map(definition => definition.key))
    for (const definition of EMAIL_DEFINITIONS) {
        const preview = await caller(admin).emailTemplate.preview({ key: definition.key, content: definition.defaults })
        assert(preview.subject.length > 0 && !preview.subject.includes('{{'), definition.key)
        assert(!preview.html.includes('{{') && !preview.html.includes('{%') && !preview.html.includes('@@dv-block'), definition.key)
        if (definition.action) assert(preview.html.includes(`href="${definition.sample.url}"`), definition.key)
    }
})

test('a customised template is used until it is reset, and both are audited', async () => {
    const before = await caller(admin).emailTemplate.get('user-approved')
    assert.equal(before.customised, false)
    await caller(admin).emailTemplate.update({ key: 'user-approved', content: content() })
    const saved = await caller(admin).emailTemplate.get('user-approved')
    assert.equal(saved.customised, true)
    assert.equal(saved.content.subject, 'Hello {{ user.name }}')

    await mailer.sendUserApprovedEmail(member)
    const mail = state.sentMails.at(-1)
    assert.equal(mail.to, member.email)
    assert.equal(mail.subject, `Hello ${member.name}`)
    assert(mail.html.includes(`Body for ${member.name}`))
    assert(mail.text.includes(`Body for ${member.name}`))
    assert.match(mail.text, /Go: https?:\/\/\S+\/login\?link=/)

    await caller(admin).emailTemplate.reset('user-approved')
    assert.equal((await caller(admin).emailTemplate.get('user-approved')).customised, false)
    await mailer.sendUserApprovedEmail(member)
    assert.equal(state.sentMails.at(-1).subject, 'Your Damvia account is ready'.replace('Damvia', process.env.APP_NAME?.trim() || 'Damvia'))
    const actions = (await db.query(`SELECT action FROM audit_log WHERE target_id = 'user-approved' ORDER BY created_at`)).map(row => row.action)
    assert.deepEqual(actions.slice(-2), ['email_template.updated', 'email_template.reset'])
})

test('values are escaped in HTML, raw cannot turn escaping off, and the body is sanitised', async () => {
    await caller(admin).emailTemplate.update({ key: 'request-approval', content: {
        subject: '{{ requester.name }} waits',
        preheader: '',
        heading: '{{ requester.name | raw }}',
        bodyHtml: '<p onclick="x()">Hi {{ requester.name }}</p><script>alert(1)</script><img src=x onerror=alert(1)><a href="javascript:alert(1)">bad</a>',
        buttonLabel: 'Review',
    } })
    const saved = await caller(admin).emailTemplate.get('request-approval')
    assert(!/script|onerror|onclick|javascript:|<img/i.test(saved.content.bodyHtml))

    const requester = await makeUser('member', { name: '<script>x</script>&' })
    await mailer.sendRequestApprovalEmail(requester)
    const mail = state.sentMails.at(-1)
    assert(!mail.html.includes('<script>x</script>'))
    assert(mail.html.includes('Hi &lt;script&gt;x&lt;/script&gt;&amp;'))
    assert.equal(mail.subject, '<script>x</script>& waits')
    assert(mail.text.includes('Hi <script>x</script>&'))
})

test('markup typed in one-line fields shows as text, and a value cannot become a script link', async () => {
    await caller(admin).emailTemplate.update({ key: 'request-approval', content: {
        subject: 'New request',
        preheader: '<b>Pre</b>',
        heading: '<img src=x onerror=alert(1)>Hi',
        bodyHtml: '<p><a href="{{ requester.name }}">profile</a> <a href="{{ url }}">open</a></p>',
        buttonLabel: '<script>x</script>Go',
    } })
    const requester = await makeUser('member', { name: 'javascript:alert(1)' })
    await mailer.sendRequestApprovalEmail(requester)
    const mail = state.sentMails.at(-1)
    assert(!/<img|<script|<b>|javascript:/i.test(mail.html))
    assert(mail.html.includes('&lt;img /&gt;Hi</h1>'))
    assert(mail.html.includes(`href="${env.appURL()}/admin/users/${requester.id}"`))
})

test('the preview is sent in the request body, so a long message still fits', () => {
    assert.equal(appRouter._def.procedures['emailTemplate.preview']._def.type, 'mutation')
})

test('a storage failure behind the email logo answers 404 without its details', async () => {
    const previousS3 = env.mainS3
    env.mainS3 = () => ({ ...previousS3(), getObject: async () => { throw Object.assign(new Error('connect ECONNREFUSED minio.internal:9000'), { code: 'ECONNREFUSED' }) } })
    try {
        const response = await server.inject({ method: 'GET', url: '/v1/branding/email-logo.png' })
        assert.equal(response.statusCode, 404)
        assert(!response.body.includes('minio.internal'))
    } finally { env.mainS3 = previousS3 }
})

test('a template that cannot render is refused, and cannot read files', async () => {
    for (const bodyHtml of ['<p>{% if %}</p>', '<p>{{ url | nope }}</p>', '<p>{% include "/etc/passwd" %}</p>', '<p>{% render "package.json" %}</p>', '<p>{% for i in (1..100000000) %}x{% endfor %}</p>']) {
        await assert.rejects(caller(admin).emailTemplate.update({ key: 'login', content: content({ bodyHtml }) }), /template has an error/)
    }
    assert.equal((await caller(admin).emailTemplate.get('login')).customised, false)
})

test('comparisons written in the editor still work, and blocks print the licence list', async () => {
    const preview = await caller(admin).emailTemplate.preview({ key: 'license-expiring', content: {
        ...EMAIL_DEFINITIONS.find(definition => definition.key === 'license-expiring').defaults,
        heading: '{% if licenses.size &gt; 1 %}Several{% endif %}',
    } })
    assert(preview.html.includes('>Several</h1>'))
    assert(preview.html.includes('<strong style="font-weight:600;color:#18181b;">Spring shoot</strong>: ends 2026-10-27 (30 days left)'))
    assert(!/<p[^>]*>\s*<ul/.test(preview.html))
})

test('sender, footer, colour and logo come from the settings', async () => {
    const previousS3 = env.mainS3
    await caller(admin).emailTemplate.updateSettings({ senderName: 'Acme Assets', senderAddress: 'assets@acme.test', replyTo: 'help@acme.test', footerText: 'Acme Ltd\n1 Main Street' })
    await caller(admin).settings.updateBrandTheme({ accentColor: '#ffcc00' })
    env.mainS3 = () => ({ ...previousS3(), statObject: async () => ({ lastModified: new Date('2026-09-27T00:00:00Z') }) })
    try {
        await mailer.sendLogInEmail(member)
        const mail = state.sentMails.at(-1)
        assert.deepEqual(mail.from, { name: 'Acme Assets', address: 'assets@acme.test' })
        assert.equal(mail.replyTo, 'help@acme.test')
        assert(mail.html.includes('background:#ffcc00'))
        // Yellow takes dark text; white would not be readable.
        assert(mail.html.includes('color:#111111;text-decoration:none'))
        assert(mail.html.includes(`src="${env.apiURL()}/v1/branding/email-logo.png?v=${Date.parse('2026-09-27T00:00:00Z')}"`))
        assert(mail.html.includes('Acme Ltd<br>1 Main Street'))
        assert(mail.text.includes('Acme Ltd\n1 Main Street'))
    } finally { env.mainS3 = previousS3 }

    await caller(admin).emailTemplate.updateSettings({ senderName: null, senderAddress: null, replyTo: null, footerText: '' })
    await mailer.sendLogInEmail(member)
    assert.equal(state.sentMails.at(-1).from.address, `no-reply@${new URL(env.appURL()).hostname}`)
    await assert.rejects(caller(admin).emailTemplate.updateSettings({ senderName: null, senderAddress: 'not an email', replyTo: null, footerText: '' }))
})

test('the brand name set in Settings replaces APP_NAME in emails and the browser tab', async () => {
    await caller(admin).settings.updateBrandTheme({ brandName: '  Acme Brand Hub ' })
    assert.equal((await caller(null).settings.getBrandTheme()).brandName, 'Acme Brand Hub')
    // Changing the name leaves the colour as it was.
    await caller(admin).settings.updateBrandTheme({ accentColor: '#ff6600' })
    assert.equal((await caller(null).settings.getBrandTheme()).brandName, 'Acme Brand Hub')
    assert.equal((await caller(null).env()).appName, 'Acme Brand Hub')

    await mailer.sendUserApprovedEmail(member)
    const mail = state.sentMails.at(-1)
    assert.equal(mail.subject, 'Your Acme Brand Hub account is ready')
    assert.equal(mail.from.name, 'Acme Brand Hub')
    assert(mail.html.includes('font-weight:600;color:#18181b;">Acme Brand Hub</span>'))
    assert(mail.html.includes('Sent by Acme Brand Hub'))
    assert(!mail.html.includes('Open Source'))
    assert(mail.text.includes('Acme Brand Hub · '))

    // Emptying it falls back to APP_NAME.
    await caller(admin).settings.updateBrandTheme({ brandName: '  ' })
    assert.equal((await caller(null).settings.getBrandTheme()).brandName, null)
    await mailer.sendUserApprovedEmail(member)
    assert.equal(state.sentMails.at(-1).from.name, process.env.APP_NAME?.trim() || 'Damvia')
})

test('a test email goes to the admin who sends it, with the unsaved draft', async () => {
    const result = await caller(admin).emailTemplate.sendTest({ key: 'reset-password', content: content({ subject: 'Draft subject' }) })
    assert.equal(result.sentTo, admin.email)
    const mail = state.sentMails.at(-1)
    assert.equal(mail.to, admin.email)
    assert.equal(mail.subject, '[Test] Draft subject')
    assert.equal((await caller(admin).emailTemplate.get('reset-password')).customised, false)
    for (let i = 0; i < 9; i++) await caller(admin).emailTemplate.sendTest({ key: 'login', content: content() })
    await assert.rejects(caller(admin).emailTemplate.sendTest({ key: 'login', content: content() }), /Too many/)
})

test('the sender domain check reads SPF, DKIM, DMARC and MX and says what to add', async () => {
    const previous = env.dnsResolver
    const smtpHost = process.env.SMTP_HOST
    const zone = {}
    const missing = () => Object.assign(new Error('missing'), { code: 'ENOTFOUND' })
    env.dnsResolver = () => ({
        resolveTxt: async name => { if (!zone[name]) throw missing(); return zone[name].map(record => [record]) },
        resolveMx: async name => { if (!zone[`mx:${name}`]) throw missing(); return zone[`mx:${name}`] },
    })
    try {
        await forbidden(caller(member).emailTemplate.checkDomain({}))
        const local = await caller(admin).emailTemplate.checkDomain({})
        assert.match(local.problem, /own domain/)

        await caller(admin).emailTemplate.updateSettings({ senderName: null, senderAddress: 'news@acme.test', replyTo: null, footerText: '' })
        process.env.SMTP_HOST = 'smtp.sendgrid.net'
        const bare = await caller(admin).emailTemplate.checkDomain({})
        assert.equal(bare.domain, 'acme.test')
        assert.deepEqual(bare.checks.map(check => [check.key, check.status]), [['spf', 'missing'], ['dkim', 'missing'], ['dmarc', 'missing'], ['mx', 'warning']])
        assert.match(bare.checks[0].advice, /v=spf1 include:sendgrid\.net ~all/)

        zone['acme.test'] = ['google-site-verification=x', 'v=spf1 include:_spf.google.com ~all']
        zone['s1._domainkey.acme.test'] = ['k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC']
        zone['_dmarc.acme.test'] = ['v=DMARC1; p=none; rua=mailto:d@acme.test']
        zone['mx:acme.test'] = [{ exchange: 'mx.acme.test', priority: 10 }]
        const partial = await caller(admin).emailTemplate.checkDomain({})
        assert.deepEqual(partial.checks.map(check => [check.key, check.status]), [['spf', 'warning'], ['dkim', 'ok'], ['dmarc', 'warning'], ['mx', 'ok']])
        assert.match(partial.checks[0].advice, /SendGrid.*include:sendgrid\.net/)
        assert.deepEqual(partial.checks[1].found, ['s1._domainkey'])

        process.env.SMTP_HOST = 'smtp.postmarkapp.com'
        zone['acme.test'] = ['v=spf1 include:spf.mtasv.net -all']
        zone['_dmarc.acme.test'] = ['v=DMARC1; p=quarantine']
        zone['20260901pm._domainkey.acme.test'] = ['k=rsa;p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQD']
        delete zone['s1._domainkey.acme.test']
        assert.equal((await caller(admin).emailTemplate.checkDomain({})).checks[1].status, 'missing')
        const typed = await caller(admin).emailTemplate.checkDomain({ selector: '20260901pm' })
        assert(typed.checks.every(check => check.status === 'ok'), JSON.stringify(typed.checks))
        await assert.rejects(caller(admin).emailTemplate.checkDomain({ selector: 'x._domainkey.evil.test/..' }))

        zone['acme.test'] = ['v=spf1 +all', 'v=spf1 include:spf.mtasv.net ~all']
        assert.match((await caller(admin).emailTemplate.checkDomain({})).checks[0].advice, /2 SPF records/)

        env.dnsResolver = () => ({ resolveTxt: async () => { throw Object.assign(new Error('timeout'), { code: 'ETIMEOUT' }) }, resolveMx: async () => [] })
        assert.match((await caller(admin).emailTemplate.checkDomain({})).problem, /could not be read/)
    } finally {
        env.dnsResolver = previous
        if (smtpHost === undefined) delete process.env.SMTP_HOST; else process.env.SMTP_HOST = smtpHost
    }
})
