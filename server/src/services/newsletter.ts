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
import { sign, verify } from "jsonwebtoken"
import { Newsletter, NewsletterStatus } from "../entity/newsletter"
import { NewsletterRecipient, NewsletterRecipientStatus } from "../entity/newsletter-recipient"
import { User } from "../entity/user"
import { apiURL, appURL, dataSource, logger, newsletterDailyLimit, newsletterRatePerSecond, newsletterTransporter, secret } from "../env"
import { emailSender, renderNewsletter } from "../mail/render"
import { REACHABLE, snapshotRecipients } from "./audience"
import { recordAudit } from "./audit"

export const NEWSLETTER_BATCH_SIZE = 50

// An unsubscribe link only turns newsletters off, for the one account it
// names. It works for 90 days, and stops as soon as the person changes their
// choice from their account, so a forwarded newsletter cannot be used later.
export async function createUnsubscribeToken(userId: string): Promise<string> {
	const [user] = await dataSource.query(`SELECT newsletter_token_version AS version FROM users WHERE id = $1`, [userId])
	return sign({ purpose: 'newsletter-unsubscribe', sub: userId, v: user?.version ?? 0 }, secret(), { algorithm: 'HS256', expiresIn: '90d' })
}

export async function readUnsubscribeToken(token: string): Promise<string | null> {
	try {
		const payload = verify(token, secret(), { algorithms: ['HS256'] })
		if (typeof payload !== 'object' || payload.purpose !== 'newsletter-unsubscribe' || typeof payload.sub !== 'string' || typeof payload.v !== 'number') return null
		const [user] = await dataSource.query(`SELECT 1 FROM users WHERE id = $1 AND newsletter_token_version = $2`, [payload.sub, payload.v])
		return user ? payload.sub : null
	} catch {
		// Same answer as a forged token.
	}
	return null
}

export function unsubscribePageUrl(token: string): string {
	const url = new URL(appURL())
	url.pathname = '/unsubscribe'
	url.searchParams.set('token', token)
	return url.toString()
}

// Mail clients call this directly for their own "Unsubscribe" button (RFC 8058).
export function oneClickUnsubscribeUrl(token: string): string {
	return `${apiURL()}/v1/unsubscribe/${encodeURIComponent(token)}`
}

// From the account, any change also ends the links in newsletters already sent.
export async function setNewsletterSubscription(userId: string, subscribed: boolean, fromAccount = false): Promise<User | null> {
	const user = await dataSource.getRepository(User).findOneBy({ id: userId })
	if (!user) return null
	if (subscribed === !user.newsletterOptOutAt && !fromAccount) return user
	const changed = subscribed === !!user.newsletterOptOutAt
	user.newsletterOptOutAt = subscribed ? null : user.newsletterOptOutAt ?? new Date()
	await dataSource.transaction(async (em) => {
		await em.getRepository(User).update(user.id, {
			newsletterOptOutAt: user.newsletterOptOutAt,
			...(fromAccount ? { newsletterTokenVersion: () => 'newsletter_token_version + 1' } : {}),
			// Asking for newsletters again says the address works.
			...(fromAccount && subscribed ? { emailBouncedAt: null, emailBounceReason: null } : {}),
		})
		if (changed) await recordAudit(em, { actorId: user.id, action: subscribed ? 'newsletter.resubscribed' : 'newsletter.unsubscribed', targetType: 'user', targetId: user.id })
	})
	return user
}

export type SendBatch = { newsletterId: string, recipientIds: string[] }

// How many newsletter messages may still leave in the current 24 hours, and
// when the next ones may once the limit is reached. Null means no limit.
export async function dailyAllowance(): Promise<{ limit: number | null, sent: number, remaining: number | null, nextAt: Date | null }> {
	const limit = newsletterDailyLimit()
	const [{ sent, oldest }] = await dataSource.query(`
		SELECT count(*)::int AS sent, min(sent_at) AS oldest FROM newsletter_recipients
		WHERE status IN ('sent', 'bounced', 'complained') AND sent_at > now() - interval '24 hours'
	`)
	if (limit === null) return { limit, sent, remaining: null, nextAt: null }
	const remaining = Math.max(0, limit - sent)
	return { limit, sent, remaining, nextAt: remaining ? null : new Date(new Date(oldest).getTime() + 24 * 3600 * 1000) }
}

export async function pendingBatches(newsletterId: string): Promise<SendBatch[]> {
	const rows = await dataSource.getRepository(NewsletterRecipient).find({
		select: { id: true },
		where: { newsletterId, status: NewsletterRecipientStatus.PENDING },
		order: { name: 'ASC', id: 'ASC' },
	})
	const batches: SendBatch[] = []
	for (let index = 0; index < rows.length; index += NEWSLETTER_BATCH_SIZE) {
		batches.push({ newsletterId, recipientIds: rows.slice(index, index + NEWSLETTER_BATCH_SIZE).map((row) => row.id) })
	}
	return batches
}

// Starts every newsletter whose time has come. The status change is the lock:
// two workers never start the same newsletter.
export async function startDueNewsletters(): Promise<SendBatch[]> {
	const due: { id: string }[] = await dataSource.query(`SELECT id FROM newsletters WHERE status = 'scheduled' AND scheduled_at <= now() ORDER BY scheduled_at`)
	const batches: SendBatch[] = []
	for (const { id } of due) {
		const started = await dataSource.transaction(async (em) => {
			const [rows] = await em.query(`
				UPDATE newsletters SET status = 'sending', started_at = now(), updated_at = now()
				WHERE id = $1 AND status = 'scheduled' AND scheduled_at <= now()
				RETURNING filter
			`, [id])
			if (!rows.length) return false
			const count = await snapshotRecipients(em, id, rows[0].filter)
			logger.info('newsletter.started', { newsletterId: id, recipients: count })
			return true
		})
		if (!started) continue
		const pending = await pendingBatches(id)
		if (!pending.length) await finishIfDone(id)
		batches.push(...pending)
	}
	// A send whose jobs were lost (the worker stopped between starting it and
	// queueing them) makes no progress: its people are queued again. Each is
	// claimed before sending, so a slow send queued twice still sends once.
	// Held back by the daily limit, they wait: queueing them now would only
	// make jobs that stop at once.
	if ((await dailyAllowance()).remaining === 0) return batches
	const stalled: { id: string }[] = await dataSource.query(`
		SELECT n.id FROM newsletters n
		WHERE n.status = 'sending' AND n.started_at < now() - interval '15 minutes'
		AND EXISTS (SELECT 1 FROM newsletter_recipients r WHERE r.newsletter_id = n.id AND r.status = 'pending')
		AND NOT EXISTS (SELECT 1 FROM newsletter_recipients r WHERE r.newsletter_id = n.id AND r.sent_at > now() - interval '15 minutes')
	`)
	for (const { id } of stalled) {
		logger.warn('newsletter.resumed-stalled', { newsletterId: id })
		batches.push(...await pendingBatches(id))
	}
	return batches
}

async function finishIfDone(newsletterId: string) {
	const [rows] = await dataSource.query(`
		UPDATE newsletters SET status = 'sent', sent_at = now(), updated_at = now()
		WHERE id = $1 AND status = 'sending'
		AND NOT EXISTS (SELECT 1 FROM newsletter_recipients WHERE newsletter_id = $1 AND status = 'pending')
		RETURNING id
	`, [newsletterId])
	if (!rows.length) return
	const [counts] = await dataSource.query(`
		SELECT count(*) FILTER (WHERE status = 'sent')::int AS sent, count(*) FILTER (WHERE status = 'failed')::int AS failed,
			count(*) FILTER (WHERE status = 'skipped')::int AS skipped
		FROM newsletter_recipients WHERE newsletter_id = $1
	`, [newsletterId])
	await recordAudit(null, { actorId: null, action: 'newsletter.sent', targetType: 'newsletter', targetId: newsletterId, after: counts })
}

// One message per person, so nobody sees who else it went to. Each person is
// claimed with a row lock, so two jobs holding them (a retry, or a resumed
// send) never both send. A failure is kept on the recipient for the admin to
// retry; it never fails the job.
export async function sendNewsletterBatch({ newsletterId, recipientIds }: SendBatch) {
	const newsletter = await dataSource.getRepository(Newsletter).findOneBy({ id: newsletterId })
	if (!newsletter || newsletter.status !== NewsletterStatus.SENDING) return
	const sender = await emailSender()
	const limit = newsletterDailyLimit()
	const interval = 1000 / newsletterRatePerSecond()

	for (const recipientId of recipientIds) {
		const sent = await dataSource.transaction(async (em) => {
			const [recipient]: { id: string, userId: string | null, email: string, name: string }[] = await em.query(`
				SELECT r.id, r.user_id AS "userId", r.email, r.name FROM newsletter_recipients r
				WHERE r.id = $1 AND r.newsletter_id = $2 AND r.status = 'pending'
				FOR UPDATE SKIP LOCKED
			`, [recipientId, newsletterId])
			if (!recipient) return true
			const [reachable] = recipient.userId ? await em.query(`
				SELECT 1 FROM users u WHERE u.id = $1 AND ${REACHABLE}
			`, [recipient.userId]) : []
			if (!reachable) {
				await em.query(`UPDATE newsletter_recipients SET status = 'skipped' WHERE id = $1`, [recipient.id])
				return true
			}
			// One message at a time across every worker, so the daily limit and
			// the pace hold however many workers run.
			await em.query("SELECT pg_advisory_xact_lock(hashtext('newsletter/send'))")
			const [{ count, wait }] = await em.query(`
				SELECT count(*)::int AS count, greatest(0, extract(epoch FROM max(sent_at) - clock_timestamp()) * 1000 + $1)::int AS wait
				FROM newsletter_recipients WHERE status IN ('sent', 'bounced', 'complained') AND sent_at > now() - interval '24 hours'
			`, [interval])
			if (limit !== null && count >= limit) {
				logger.info('newsletter.daily-limit-reached', { newsletterId })
				return false
			}
			if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
			try {
				const token = await createUnsubscribeToken(recipient.userId!)
				const email = await renderNewsletter(newsletter, { name: recipient.name, email: recipient.email }, unsubscribePageUrl(token))
				await newsletterTransporter().sendMail({
					from: sender.from, replyTo: sender.replyTo, to: { name: recipient.name, address: recipient.email },
					subject: email.subject, html: email.html, text: email.text,
					headers: {
						'List-Unsubscribe': `<${oneClickUnsubscribeUrl(token)}>`,
						'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
					},
				})
				await em.query(`UPDATE newsletter_recipients SET status = 'sent', sent_at = clock_timestamp(), error = NULL WHERE id = $1`, [recipient.id])
			} catch (error) {
				logger.warn('newsletter.send-failed', { newsletterId, recipientId: recipient.id, code: (error as { code?: string }).code })
				await em.query(`UPDATE newsletter_recipients SET status = 'failed', error = $2 WHERE id = $1`, [recipient.id, String((error as Error).message ?? error).slice(0, 500)])
			}
			return true
		})
		// The rest waits for the next day: the dispatcher queues it again once
		// the limit allows, like any send that stopped.
		if (!sent) break
	}
	await finishIfDone(newsletterId)
}
