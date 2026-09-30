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
import { TRPCError } from '@trpc/server'
import { Liquid } from 'liquidjs'
import sanitizeHtml from 'sanitize-html'
import { BrandSettings } from '../entity/brand-settings'
import { EmailSettings } from '../entity/email-settings'
import { EmailTemplate } from '../entity/email-template'
import { appURL, dataSource } from '../env'
import { brandName, emailLogoUrl } from '../services/branding'
import { sanitizeBlockHtml } from '../page-blocks/sanitize'
import { EmailContent, emailDefinition } from './catalogue'
import { DEFAULT_ACCENT } from './color'
import { decodeEntities, escapeHtml, htmlToText } from './html'
import { emailLayout } from './layout'
import { sanitizeNewsletterHtml } from './newsletter-sanitize'

// Templates are written by admins. Nothing they write can read a file, call a
// filter that does not exist, or run away with memory, and every value is
// escaped: `raw` is replaced so it cannot turn escaping off.
const NO_FILES = {
	exists: async () => false,
	existsSync: () => false,
	readFile: async () => { throw new Error('Templates cannot include files') },
	readFileSync: () => { throw new Error('Templates cannot include files') },
	resolve: (_root: string, file: string) => file,
	dirname: () => '',
	sep: '/',
}
const LIMITS = { strictFilters: true, fs: NO_FILES, root: [], partials: [], layouts: [], parseLimit: 100_000, renderLimit: 1_000, memoryLimit: 10_000_000 }
const html = new Liquid({ ...LIMITS, outputEscape: 'escape' })
html.registerFilter('raw', (value: unknown) => value)
const text = new Liquid(LIMITS)

const BLOCK = (name: string) => `@@dv-block:${name}@@`

// Values the mailer lays out itself, placed where the admin writes their name.
const BLOCKS: Record<string, (context: Record<string, any>) => string> = {
	licenseList: (context) => `<ul>${(context.licenses ?? []).map((license: { name: string, date: string, days: number }) =>
		`<li><strong>${escapeHtml(license.name)}</strong>: ends ${escapeHtml(license.date)} (${license.days} day${license.days === 1 ? '' : 's'} left)</li>`).join('')}</ul>`,
}

export type RenderedEmail = { subject: string, html: string, text: string }

export async function templateContent(key: string): Promise<{ content: EmailContent, customised: boolean, updatedAt: Date | null }> {
	const definition = emailDefinition(key)
	const row = await dataSource.getRepository(EmailTemplate).findOneBy({ key })
	if (!row) return { content: definition.defaults, customised: false, updatedAt: null }
	const { subject, preheader, heading, bodyHtml, buttonLabel } = row
	return { content: { subject, preheader, heading, bodyHtml, buttonLabel }, customised: true, updatedAt: row.updatedAt }
}

// The one-line fields are text: a tag typed into them shows as text.
function plainHtml(value: string): string {
	return sanitizeHtml(value, { allowedTags: [], allowedAttributes: {}, disallowedTagsMode: 'escape' }).trim()
}

// The editor escapes < > & inside text, which would break a Liquid comparison.
function liquidSource(value: string): string {
	return value.replace(/\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}/g, (tag) => decodeEntities(tag))
}

type Parts = { subject: string, preheader: string, heading: string, bodyHtml: string, buttonLabel: string }
type RenderOptions = { blocks?: { name: string }[], sanitize?: (html: string) => string }

// Liquid over each field, the admin's markup cleaned before and after.
async function renderParts(content: EmailContent, context: Record<string, unknown>, { blocks = [], sanitize = sanitizeBlockHtml }: RenderOptions = {}): Promise<Parts> {
	let body = liquidSource(sanitize(content.bodyHtml))
	for (const block of blocks) {
		body = body.replace(new RegExp(`\\{\\{\\s*${block.name}\\s*\\}\\}`, 'g'), BLOCK(block.name))
	}
	let bodyHtml = await html.parseAndRender(body, context)
	for (const block of blocks) {
		const rendered = BLOCKS[block.name]?.(context) ?? ''
		bodyHtml = bodyHtml
			.replace(new RegExp(`<p>\\s*${BLOCK(block.name)}\\s*</p>`, 'g'), rendered)
			.replaceAll(BLOCK(block.name), rendered)
	}
	// Cleaned again once values are in: a value can still form a link address.
	return {
		subject: (await text.parseAndRender(liquidSource(content.subject), context)).replace(/\s+/g, ' ').trim(),
		preheader: plainHtml(await html.parseAndRender(liquidSource(content.preheader), context)),
		heading: plainHtml(await html.parseAndRender(liquidSource(content.heading), context)),
		buttonLabel: plainHtml(await html.parseAndRender(liquidSource(content.buttonLabel), context)),
		bodyHtml: sanitize(bodyHtml),
	}
}

export async function emailSender(): Promise<{ from: { name: string, address: string }, replyTo?: string, footerText: string }> {
	const settings = await dataSource.getRepository(EmailSettings).findOneBy({ id: 1 })
	return {
		from: {
			name: settings?.senderName?.trim() || await brandName(),
			address: settings?.senderAddress?.trim() || `no-reply@${new URL(appURL()).hostname}`,
		},
		replyTo: settings?.replyTo?.trim() || undefined,
		footerText: settings?.footerText ?? '',
	}
}

export async function accentColor(): Promise<string> {
	const brand = await dataSource.getRepository(BrandSettings).findOneBy({ id: 1 })
	return brand?.accentColor ?? DEFAULT_ACCENT
}

type Frame = { appName: string, appUrl: string, button: { label: string, url: string } | null, unsubscribeUrl?: string | null }

// The branded layout around rendered parts, and the matching plain text.
async function compose(parts: Parts, frame: Frame): Promise<RenderedEmail> {
	const [accent, logoUrl, sender] = await Promise.all([accentColor(), emailLogoUrl(), emailSender()])
	const { appName, appUrl, button, unsubscribeUrl } = frame
	const document = emailLayout({
		appName, appUrl, accent, logoUrl, footerText: sender.footerText,
		subject: parts.subject, preheader: parts.preheader, heading: parts.heading, bodyHtml: parts.bodyHtml, button, unsubscribeUrl,
	})
	const plain = [
		parts.heading && htmlToText(parts.heading),
		htmlToText(parts.bodyHtml),
		button && `${htmlToText(button.label)}: ${button.url}`,
		`--\n${[sender.footerText.trim(), `${appName} · ${appUrl}`, unsubscribeUrl && `Unsubscribe: ${unsubscribeUrl}`].filter(Boolean).join('\n')}`,
	].filter(Boolean).join('\n\n')
	return { subject: parts.subject, html: document, text: plain }
}

export async function renderEmail(key: string, values: Record<string, unknown>, draft?: EmailContent): Promise<RenderedEmail> {
	const definition = emailDefinition(key)
	const content = draft ?? (await templateContent(key)).content
	const context = { appName: await brandName(), appUrl: appURL(), ...values }
	const parts = await renderParts(content, context, { blocks: definition.blocks })
	const actionUrl = definition.action ? values[definition.action] : null
	const button = typeof actionUrl === 'string' && actionUrl && parts.buttonLabel ? { label: parts.buttonLabel, url: actionUrl } : null
	return compose(parts, { appName: context.appName, appUrl: context.appUrl, button })
}

// Saving a template that cannot render would fail every email it sends.
export async function assertRenders(key: string, content: EmailContent) {
	try {
		await renderParts(content, { appName: await brandName(), appUrl: appURL(), ...emailDefinition(key).sample }, { blocks: emailDefinition(key).blocks })
	} catch (error) {
		throw new TRPCError({ code: 'BAD_REQUEST', message: `The template has an error: ${(error as Error).message}` })
	}
}

export type NewsletterContent = { subject: string, preheader: string, heading: string, bodyHtml: string }
export type NewsletterReader = { name: string, email: string }

export const NEWSLETTER_VARIABLES = [
	{ name: 'user.name', description: "The reader's full name" },
	{ name: 'user.firstName', description: "The reader's first name" },
	{ name: 'user.email', description: "The reader's email address" },
	{ name: 'appName', description: 'Your brand name, set in Settings' },
	{ name: 'appUrl', description: 'The address of the portal' },
]

function newsletterContext(appName: string, reader: NewsletterReader) {
	const name = reader.name.trim()
	return { appName, appUrl: appURL(), user: { name, firstName: name.split(/\s+/)[0] ?? '', email: reader.email } }
}

export async function renderNewsletter(content: NewsletterContent, reader: NewsletterReader, unsubscribeUrl: string | null): Promise<RenderedEmail> {
	const appName = await brandName()
	const parts = await renderParts({ ...content, buttonLabel: '' }, newsletterContext(appName, reader), { sanitize: sanitizeNewsletterHtml })
	return compose(parts, { appName, appUrl: appURL(), button: null, unsubscribeUrl })
}

// Scheduling a newsletter that cannot render would fail every email in it.
export async function assertNewsletterRenders(content: NewsletterContent) {
	try {
		await renderParts({ ...content, buttonLabel: '' }, newsletterContext(await brandName(), { name: 'Sample Reader', email: 'reader@example.com' }), { sanitize: sanitizeNewsletterHtml })
	} catch (error) {
		throw new TRPCError({ code: 'BAD_REQUEST', message: `The newsletter has an error: ${(error as Error).message}` })
	}
}
