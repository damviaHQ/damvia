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
import { dnsResolver } from "../env"

export type DomainCheck = {
	key: 'spf' | 'dkim' | 'dmarc' | 'mx'
	label: string
	status: 'ok' | 'warning' | 'missing'
	found: string[]
	advice: string
}

// Where each provider asks senders to point SPF, and the DKIM selectors it
// uses when they are fixed. Postmark and Amazon SES make their own selector
// names, so the admin types theirs.
const PROVIDERS: { host: RegExp, name: string, spf: string | null, selectors: string[] }[] = [
	{ host: /postmarkapp\.com$/, name: 'Postmark', spf: 'spf.mtasv.net', selectors: [] },
	{ host: /amazonaws\.com$/, name: 'Amazon SES', spf: 'amazonses.com', selectors: [] },
	{ host: /brevo\.com$|sendinblue\.com$/, name: 'Brevo', spf: 'spf.brevo.com', selectors: ['brevo1', 'brevo2', 'mail'] },
	{ host: /mailgun\.org$/, name: 'Mailgun', spf: 'mailgun.org', selectors: ['smtp', 'mx', 'k1', 'krs', 'pic'] },
	{ host: /resend\.com$/, name: 'Resend', spf: 'amazonses.com', selectors: ['resend'] },
	{ host: /sendgrid\.net$/, name: 'SendGrid', spf: 'sendgrid.net', selectors: ['s1', 's2'] },
	{ host: /office365\.com$|outlook\.com$/, name: 'Microsoft 365', spf: 'spf.protection.outlook.com', selectors: ['selector1', 'selector2'] },
	{ host: /google\.com$|gmail\.com$/, name: 'Google Workspace', spf: '_spf.google.com', selectors: ['google'] },
]
const COMMON_SELECTORS = ['default', 'dkim', 'mail', 'selector1', 'selector2', 'google', 's1', 's2', 'k1']

export function smtpProvider(host = process.env.SMTP_HOST ?? '') {
	return PROVIDERS.find((provider) => provider.host.test(host.toLowerCase())) ?? null
}

async function txt(name: string): Promise<string[]> {
	try {
		return (await dnsResolver().resolveTxt(name)).map((chunks) => chunks.join(''))
	} catch (error) {
		if (['ENOTFOUND', 'ENODATA', 'NXDOMAIN'].includes((error as { code?: string }).code ?? '')) return []
		throw error
	}
}

// What the domain the emails come from publishes, and what to add. Only DNS
// is read: whether the provider signs with the published key is checked by
// sending a test and reading its headers.
export async function checkSenderDomain(domain: string, selector?: string): Promise<DomainCheck[]> {
	const provider = smtpProvider()
	const [root, dmarc, mx] = await Promise.all([
		txt(domain),
		txt(`_dmarc.${domain}`),
		dnsResolver().resolveMx(domain).catch((): { exchange: string, priority: number }[] => []),
	])

	const spf = root.filter((record) => /^v=spf1(\s|$)/i.test(record))
	const spfCheck: DomainCheck = { key: 'spf', label: 'SPF', status: 'ok', found: spf, advice: '' }
	const include = provider?.spf ? `include:${provider.spf}` : 'include:<your provider>'
	if (!spf.length) {
		spfCheck.status = 'missing'
		spfCheck.advice = `Add a TXT record on ${domain}: "v=spf1 ${include} ~all". It lists the servers allowed to send for the domain.`
	} else if (spf.length > 1) {
		spfCheck.status = 'warning'
		spfCheck.advice = `${domain} has ${spf.length} SPF records; receivers then ignore all of them. Merge them into one.`
	} else if (/[+]all\b/i.test(spf[0]) || !/[-~?]all\b|redirect=/i.test(spf[0])) {
		spfCheck.status = 'warning'
		spfCheck.advice = 'End the record with "~all" or "-all": as written, it lets any server send for the domain.'
	} else if (provider?.spf && !spf[0].toLowerCase().includes(provider.spf)) {
		spfCheck.status = 'warning'
		spfCheck.advice = `Your mail goes through ${provider.name}, but the record does not include it. Add "${include}" before the "all" part.`
	}

	const selectors = [...new Set([selector?.trim(), ...(provider?.selectors ?? []), ...COMMON_SELECTORS].filter((name): name is string => !!name && /^[a-z0-9._-]{1,63}$/i.test(name)))]
	const keys = (await Promise.all(selectors.map(async (name) => ({ name, records: await txt(`${name}._domainkey.${domain}`).catch(() => []) }))))
		.filter((entry) => entry.records.some((record) => /(^|;)\s*p=[A-Za-z0-9+/=]{20,}/.test(record)))
	const dkimCheck: DomainCheck = {
		key: 'dkim', label: 'DKIM', status: keys.length ? 'ok' : 'missing',
		found: keys.map((entry) => `${entry.name}._domainkey`),
		advice: keys.length ? '' : `No signing key was found. Copy the DKIM record ${provider ? `${provider.name} gives you` : 'your provider gives you'} into your DNS${provider && !provider.selectors.length ? ', then type its selector (the part before "._domainkey") below to check it' : ''}.`,
	}

	const dmarcRecord = dmarc.find((record) => /^v=DMARC1/i.test(record))
	const policy = /;\s*p=(none|quarantine|reject)/i.exec(dmarcRecord ?? '')?.[1]?.toLowerCase()
	const dmarcCheck: DomainCheck = {
		key: 'dmarc', label: 'DMARC', status: !dmarcRecord ? 'missing' : policy === 'none' ? 'warning' : 'ok',
		found: dmarcRecord ? [dmarcRecord] : [],
		advice: !dmarcRecord
			? `Add a TXT record on _dmarc.${domain}: "v=DMARC1; p=none; rua=mailto:dmarc@${domain}". Gmail and Yahoo require one from anyone sending in bulk.`
			: policy === 'none' ? 'The policy is "none": fine to start. Once reports show only your own servers, move to "quarantine".' : '',
	}

	const mxCheck: DomainCheck = {
		key: 'mx', label: 'Replies', status: mx.length ? 'ok' : 'warning',
		found: mx.sort((a, b) => a.priority - b.priority).map((record) => record.exchange),
		advice: mx.length ? '' : `${domain} receives no email, so replies and bounces are lost. Set "Replies go to" to an address that does.`,
	}
	return [spfCheck, dkimCheck, dmarcCheck, mxCheck]
}
