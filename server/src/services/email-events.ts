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
import { dataSource, logger } from "../env"
import { recordAudit } from "./audit"
import { setNewsletterSubscription } from "./newsletter"

export type EmailEvent = { type: 'bounce' | 'complaint', email: string, reason: string }
type Json = Record<string, any>

const text = (value: unknown) => typeof value === 'string' ? value : ''

// What the mail providers report back, reduced to the two things that matter:
// an address that will never accept mail, and a person who marked a message
// as spam. Temporary failures are left to the provider, which retries them.
export function readEmailEvents(body: unknown): EmailEvent[] {
	const events: EmailEvent[] = []
	const add = (type: EmailEvent['type'], email: unknown, reason: unknown) => {
		if (typeof email === 'string' && email.includes('@')) events.push({ type, email: email.trim().toLowerCase(), reason: text(reason).slice(0, 500) })
	}
	const read = (item: Json) => {
		// Amazon SES, directly or inside an SNS notification.
		const ses = item.notificationType ?? item.eventType
		if (ses === 'Bounce' && item.bounce?.bounceType === 'Permanent') {
			for (const recipient of item.bounce.bouncedRecipients ?? []) add('bounce', recipient.emailAddress, recipient.diagnosticCode ?? item.bounce.bounceSubType)
		} else if (ses === 'Complaint') {
			for (const recipient of item.complaint?.complainedRecipients ?? []) add('complaint', recipient.emailAddress, item.complaint.complaintFeedbackType)
		// Postmark
		} else if (item.RecordType === 'Bounce' && (item.Inactive || ['HardBounce', 'BadEmailAddress'].includes(item.Type))) {
			add('bounce', item.Email, item.Description ?? item.Details)
		} else if (item.RecordType === 'SpamComplaint') {
			add('complaint', item.Email, 'Spam complaint')
		// SendGrid, one event per array item
		} else if (item.event === 'bounce' && item.type !== 'blocked' && item.sg_event_id) {
			add('bounce', item.email, item.reason)
		} else if (item.event === 'spamreport' && item.sg_event_id) {
			add('complaint', item.email, 'Spam report')
		// Mailgun
		} else if (item['event-data']?.event === 'failed' && item['event-data'].severity === 'permanent') {
			add('bounce', item['event-data'].recipient, item['event-data']['delivery-status']?.description || item['event-data']['delivery-status']?.message)
		} else if (item['event-data']?.event === 'complained') {
			add('complaint', item['event-data'].recipient, 'Spam complaint')
		// Resend
		} else if (item.type === 'email.bounced' && item.data?.bounce?.type !== 'Transient') {
			for (const email of [item.data?.to].flat()) add('bounce', email, item.data?.bounce?.message)
		} else if (item.type === 'email.complained') {
			for (const email of [item.data?.to].flat()) add('complaint', email, 'Spam complaint')
		// Brevo
		} else if (['hard_bounce', 'invalid_email'].includes(item.event) && !item.sg_event_id) {
			add('bounce', item.email, item.reason ?? item.event)
		} else if (item.event === 'spam' || item.event === 'complaint') {
			add('complaint', item.email, 'Spam complaint')
		}
	}
	for (const item of [body].flat()) {
		if (!item || typeof item !== 'object') continue
		if ((item as Json).Type === 'Notification' && typeof (item as Json).Message === 'string') {
			try { read(JSON.parse((item as Json).Message)) } catch { /* not SES */ }
		} else {
			read(item as Json)
		}
	}
	return events
}

// Amazon SNS asks once for the subscription to be confirmed by opening a link.
// Only its own address is opened, so the endpoint cannot be used to reach others.
export function snsConfirmationUrl(body: unknown): string | null {
	if (!body || typeof body !== 'object' || (body as Json).Type !== 'SubscriptionConfirmation') return null
	try {
		const url = new URL(text((body as Json).SubscribeURL))
		return url.protocol === 'https:' && /^sns\.[a-z0-9-]+\.amazonaws\.com(\.cn)?$/.test(url.hostname) && !url.port ? url.toString() : null
	} catch {
		return null
	}
}

// A bounce stops newsletters to the address until it changes or is verified
// again; a complaint unsubscribes the person, as they asked their mail client
// to. Either marks the newsletter that last reached them. A report the
// provider sends again finds it already applied and changes nothing.
export async function applyEmailEvent(event: EmailEvent) {
	const [user]: { id: string, bounced: boolean, unsubscribed: boolean }[] = await dataSource.query(`
		SELECT id, email_bounced_at IS NOT NULL AS bounced, newsletter_opt_out_at IS NOT NULL AS unsubscribed FROM users WHERE lower(email) = $1
	`, [event.email])
	if (!user || (event.type === 'bounce' ? user.bounced : user.unsubscribed)) return
	await dataSource.query(`
		UPDATE newsletter_recipients SET status = $3 WHERE id = (
			SELECT id FROM newsletter_recipients WHERE user_id = $1 AND lower(email) = $2 AND status = 'sent' AND sent_at > now() - interval '30 days'
			ORDER BY sent_at DESC LIMIT 1
		)
	`, [user.id, event.email, event.type === 'bounce' ? 'bounced' : 'complained'])
	if (event.type === 'bounce') {
		await dataSource.query(`UPDATE users SET email_bounced_at = now(), email_bounce_reason = $2 WHERE id = $1`, [user.id, event.reason || null])
		await recordAudit(null, { actorId: null, action: 'email.bounced', targetType: 'user', targetId: user.id, after: { reason: event.reason } })
	} else {
		await setNewsletterSubscription(user.id, false)
		await recordAudit(null, { actorId: null, action: 'email.complained', targetType: 'user', targetId: user.id })
	}
	logger.info('email.event', { type: event.type, userId: user.id })
}
