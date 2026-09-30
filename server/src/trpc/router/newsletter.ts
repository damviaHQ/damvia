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
import { TRPCError } from "@trpc/server"
import { z } from "zod"
import { Audience } from "../../entity/audience"
import { Newsletter, NewsletterStatus } from "../../entity/newsletter"
import { NewsletterRecipientStatus } from "../../entity/newsletter-recipient"
import { User } from "../../entity/user"
import { dataSource, newsletterRatePerSecond, newsletterTransporter } from "../../env"
import { sanitizeNewsletterHtml } from "../../mail/newsletter-sanitize"
import { assertNewsletterRenders, emailSender, NEWSLETTER_VARIABLES, NewsletterContent, renderNewsletter } from "../../mail/render"
import { audienceFilter, countAudience, EMPTY_AUDIENCE, REACHABLE } from "../../services/audience"
import { recordAudit } from "../../services/audit"
import { createNewsletterImageUpload, NEWSLETTER_IMAGE_MIME_TYPES, processNewsletterImage } from "../../services/newsletter-image"
import { createUnsubscribeToken, dailyAllowance, oneClickUnsubscribeUrl, pendingBatches, readUnsubscribeToken, setNewsletterSubscription, unsubscribePageUrl } from "../../services/newsletter"
import { enforce } from "../../services/rate-limit"
import { newsletterDispatchQueue, newsletterSendQueue } from "../../worker"
import { authMiddleware, publicProcedure, router, userAdmin } from "../index"

const content = z.object({
	subject: z.string().trim().max(300),
	preheader: z.string().trim().max(300),
	heading: z.string().trim().max(300),
	bodyHtml: z.string().max(200_000),
})
const draft = content.extend({
	name: z.string().trim().min(1).max(120),
	audienceId: z.uuid().nullable(),
	filter: audienceFilter,
})
const token = z.string().min(10).max(1000)

function clean<T extends NewsletterContent>(input: T): T {
	return { ...input, bodyHtml: sanitizeNewsletterHtml(input.bodyHtml) }
}

// Values an audit entry keeps: the body is left out, it can be long.
function snapshot(newsletter: Pick<Newsletter, 'name' | 'subject' | 'status' | 'audienceId' | 'filter' | 'scheduledAt'>) {
	const { name, subject, status, audienceId, filter, scheduledAt } = newsletter
	return { name, subject, status, audienceId, filter, scheduledAt }
}

async function findNewsletter(id: string): Promise<Newsletter> {
	const newsletter = await dataSource.getRepository(Newsletter).findOneBy({ id })
	if (!newsletter) throw new TRPCError({ code: 'NOT_FOUND', message: 'Newsletter not found.' })
	return newsletter
}

type Counts = { total: number, pending: number, sent: number, failed: number, skipped: number, bounced: number, complained: number }
async function recipientCounts(ids: string[]): Promise<Map<string, Counts>> {
	const rows: (Counts & { newsletterId: string })[] = ids.length ? await dataSource.query(`
		SELECT newsletter_id AS "newsletterId", count(*)::int AS total,
			count(*) FILTER (WHERE status = 'pending')::int AS pending, count(*) FILTER (WHERE status = 'sent')::int AS sent,
			count(*) FILTER (WHERE status = 'failed')::int AS failed, count(*) FILTER (WHERE status = 'skipped')::int AS skipped,
			count(*) FILTER (WHERE status = 'bounced')::int AS bounced, count(*) FILTER (WHERE status = 'complained')::int AS complained
		FROM newsletter_recipients WHERE newsletter_id = ANY($1::uuid[]) GROUP BY newsletter_id
	`, [ids]) : []
	return new Map(rows.map(({ newsletterId, ...counts }) => [newsletterId, counts]))
}
const NO_COUNTS: Counts = { total: 0, pending: 0, sent: 0, failed: 0, skipped: 0, bounced: 0, complained: 0 }

function maskEmail(email: string): string {
	const [local, domain] = email.split('@')
	return `${local.slice(0, 1)}${'•'.repeat(Math.max(2, Math.min(local.length - 1, 6)))}@${domain}`
}

async function subscriber(input: string) {
	const userId = await readUnsubscribeToken(input)
	const user = userId ? await dataSource.getRepository(User).findOneBy({ id: userId }) : null
	if (!user) throw new TRPCError({ code: 'BAD_REQUEST', message: 'This unsubscribe link is not valid.' })
	return user
}

export default router({
	list: publicProcedure
		.use(authMiddleware(userAdmin))
		.query(async () => {
			const newsletters = await dataSource.getRepository(Newsletter).find({ relations: { audience: true, updatedBy: true }, order: { updatedAt: 'DESC' } })
			const counts = await recipientCounts(newsletters.map((newsletter) => newsletter.id))
			return newsletters.map((newsletter) => ({
				id: newsletter.id,
				name: newsletter.name,
				subject: newsletter.subject,
				status: newsletter.status,
				audienceName: newsletter.audience?.name ?? null,
				scheduledAt: newsletter.scheduledAt,
				sentAt: newsletter.sentAt,
				updatedAt: newsletter.updatedAt,
				updatedBy: newsletter.updatedBy?.name ?? null,
				counts: counts.get(newsletter.id) ?? NO_COUNTS,
			}))
		}),
	get: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(z.uuid())
		.query(async ({ input }) => {
			const newsletter = await findNewsletter(input)
			const [counts, allowance] = await Promise.all([recipientCounts([newsletter.id]), dailyAllowance()])
			const { id, name, subject, preheader, heading, bodyHtml, audienceId, filter, status, scheduledAt, startedAt, sentAt, updatedAt } = newsletter
			return {
				id, name, subject, preheader, heading, bodyHtml: sanitizeNewsletterHtml(bodyHtml), audienceId, filter: { ...EMPTY_AUDIENCE, ...filter },
				status, scheduledAt, startedAt, sentAt, updatedAt,
				counts: counts.get(id) ?? NO_COUNTS,
				variables: NEWSLETTER_VARIABLES,
				pace: { perSecond: newsletterRatePerSecond(), ...allowance },
			}
		}),
	create: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(z.object({ name: z.string().trim().min(1).max(120).optional() }).optional())
		.mutation(async ({ ctx, input }) => {
			return dataSource.transaction(async (em) => {
				const newsletter = await em.getRepository(Newsletter).save({
					name: input?.name ?? 'Untitled newsletter', filter: EMPTY_AUDIENCE, status: NewsletterStatus.DRAFT,
					createdById: ctx.user.id, updatedById: ctx.user.id,
				})
				await recordAudit(em, { actorId: ctx.user.id, action: 'newsletter.created', targetType: 'newsletter', targetId: newsletter.id, after: snapshot(newsletter), req: ctx.req })
				return { id: newsletter.id }
			})
		}),
	update: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(draft.extend({ id: z.uuid() }))
		.mutation(async ({ ctx, input }) => {
			const { id, ...values } = input
			// A saved audience deleted meanwhile leaves the copy of its filter.
			if (values.audienceId && !await dataSource.getRepository(Audience).existsBy({ id: values.audienceId })) values.audienceId = null
			const cleaned = clean(values)
			await assertNewsletterRenders(cleaned)
			await dataSource.transaction(async (em) => {
				const before = await em.getRepository(Newsletter).findOne({ where: { id }, lock: { mode: 'pessimistic_write' } })
				if (!before) throw new TRPCError({ code: 'NOT_FOUND', message: 'Newsletter not found.' })
				if (before.status !== NewsletterStatus.DRAFT) throw new TRPCError({ code: 'CONFLICT', message: 'Unschedule the newsletter before changing it.' })
				await em.getRepository(Newsletter).update({ id }, { ...cleaned, updatedById: ctx.user.id })
				await recordAudit(em, { actorId: ctx.user.id, action: 'newsletter.updated', targetType: 'newsletter', targetId: id, before: snapshot(before), after: snapshot({ ...before, ...cleaned }), req: ctx.req })
			})
			return { id, bodyHtml: cleaned.bodyHtml }
		}),
	duplicate: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(z.uuid())
		.mutation(async ({ ctx, input }) => {
			const source = await findNewsletter(input)
			return dataSource.transaction(async (em) => {
				const { subject, preheader, heading, audienceId, filter } = source
				const bodyHtml = sanitizeNewsletterHtml(source.bodyHtml)
				const copy = await em.getRepository(Newsletter).save({
					name: `Copy of ${source.name}`.slice(0, 120), subject, preheader, heading, bodyHtml, audienceId, filter,
					status: NewsletterStatus.DRAFT, createdById: ctx.user.id, updatedById: ctx.user.id,
				})
				await recordAudit(em, { actorId: ctx.user.id, action: 'newsletter.created', targetType: 'newsletter', targetId: copy.id, after: { ...snapshot(copy), copiedFrom: source.id }, req: ctx.req })
				return { id: copy.id }
			})
		}),
	remove: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(z.uuid())
		.mutation(async ({ ctx, input }) => {
			await dataSource.transaction(async (em) => {
				const before = await em.getRepository(Newsletter).findOne({ where: { id: input }, lock: { mode: 'pessimistic_write' } })
				if (!before) return
				if (before.status !== NewsletterStatus.DRAFT) throw new TRPCError({ code: 'CONFLICT', message: 'Only a draft can be deleted. A sent newsletter stays as a record of what went out.' })
				await em.getRepository(Newsletter).delete({ id: input })
				await recordAudit(em, { actorId: ctx.user.id, action: 'newsletter.removed', targetType: 'newsletter', targetId: input, before: snapshot(before), req: ctx.req })
			})
			return { success: true }
		}),
	// Unsaved changes, rendered for the admin looking at them. A mutation, so a
	// long draft travels in the body rather than the URL.
	preview: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(content)
		.mutation(async ({ ctx, input }) => {
			const values = clean(input)
			await assertNewsletterRenders(values)
			const email = await renderNewsletter(values, ctx.user, '#unsubscribe')
			return { subject: email.subject, html: email.html }
		}),
	sendTest: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(content)
		.mutation(async ({ ctx, input }) => {
			enforce(`newsletter-test:${ctx.user.id}`, 10, 15 * 60 * 1000)
			const values = clean(input)
			await assertNewsletterRenders(values)
			// With the admin's own unsubscribe link, as every reader gets theirs.
			const token = await createUnsubscribeToken(ctx.user.id)
			const [email, sender] = await Promise.all([renderNewsletter(values, ctx.user, unsubscribePageUrl(token)), emailSender()])
			try {
				await newsletterTransporter().sendMail({
					from: sender.from, replyTo: sender.replyTo, to: ctx.user.email, subject: `[Test] ${email.subject}`, html: email.html, text: email.text,
					headers: { 'List-Unsubscribe': `<${oneClickUnsubscribeUrl(token)}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
				})
			} catch (error) {
				throw new TRPCError({ code: 'BAD_GATEWAY', message: `The mail server refused the test email: ${(error as Error).message}` })
			}
			return { sentTo: ctx.user.email }
		}),
	// null sends now. Everything is checked here, so a scheduled newsletter
	// does not fail when its time comes.
	schedule: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(z.object({ id: z.uuid(), at: z.coerce.date().nullable() }))
		.mutation(async ({ ctx, input }) => {
			const now = Date.now()
			if (input.at && (input.at.getTime() < now - 60_000 || input.at.getTime() > now + 366 * 24 * 3600 * 1000)) {
				throw new TRPCError({ code: 'BAD_REQUEST', message: 'Choose a time in the future, within a year.' })
			}
			const scheduledAt = input.at ?? new Date()
			// Checked under the row lock a save also takes, so what is checked is what is sent.
			const recipients = await dataSource.transaction(async (em) => {
				const newsletter = await em.getRepository(Newsletter).findOne({ where: { id: input.id }, lock: { mode: 'pessimistic_write' } })
				if (!newsletter) throw new TRPCError({ code: 'NOT_FOUND', message: 'Newsletter not found.' })
				if (newsletter.status !== NewsletterStatus.DRAFT) throw new TRPCError({ code: 'CONFLICT', message: 'This newsletter is already scheduled or sent.' })
				if (!newsletter.subject.trim()) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Write a subject before sending.' })
				if (!newsletter.bodyHtml.replace(/<[^>]*>/g, '').trim() && !/<img\s/i.test(newsletter.bodyHtml)) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Write the message before sending.' })
				await assertNewsletterRenders(newsletter)
				const audience = await countAudience({ ...EMPTY_AUDIENCE, ...newsletter.filter })
				if (!audience.count) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Nobody matches this audience. Choose who receives it first.' })
				await em.getRepository(Newsletter).update({ id: input.id }, { status: NewsletterStatus.SCHEDULED, scheduledAt, updatedById: ctx.user.id })
				await recordAudit(em, { actorId: ctx.user.id, action: 'newsletter.scheduled', targetType: 'newsletter', targetId: input.id, after: { scheduledAt, sendNow: !input.at, recipients: audience.count }, req: ctx.req })
				return audience.count
			})
			if (!input.at) await newsletterDispatchQueue.push(undefined)
			return { scheduledAt, recipients }
		}),
	// Back to a draft, as long as sending has not started.
	cancel: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(z.uuid())
		.mutation(async ({ ctx, input }) => {
			await dataSource.transaction(async (em) => {
				const result = await em.getRepository(Newsletter).update({ id: input, status: NewsletterStatus.SCHEDULED }, { status: NewsletterStatus.DRAFT, scheduledAt: null, updatedById: ctx.user.id })
				if (!result.affected) throw new TRPCError({ code: 'CONFLICT', message: 'Sending has already started.' })
				await recordAudit(em, { actorId: ctx.user.id, action: 'newsletter.unscheduled', targetType: 'newsletter', targetId: input, req: ctx.req })
			})
			return { success: true }
		}),
	// Tries the failed recipients again, and picks up any still waiting.
	resume: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(z.uuid())
		.mutation(async ({ ctx, input }) => {
			const retried = await dataSource.transaction(async (em) => {
				const newsletter = await em.getRepository(Newsletter).findOne({ where: { id: input }, lock: { mode: 'pessimistic_write' } })
				if (!newsletter) throw new TRPCError({ code: 'NOT_FOUND', message: 'Newsletter not found.' })
				if (![NewsletterStatus.SENDING, NewsletterStatus.SENT].includes(newsletter.status)) throw new TRPCError({ code: 'CONFLICT', message: 'This newsletter has not been sent.' })
				const [, count] = await em.query(`UPDATE newsletter_recipients SET status = 'pending', error = NULL WHERE newsletter_id = $1 AND status = 'failed'`, [input])
				await em.getRepository(Newsletter).update({ id: input }, { status: NewsletterStatus.SENDING, sentAt: null })
				await recordAudit(em, { actorId: ctx.user.id, action: 'newsletter.retried', targetType: 'newsletter', targetId: input, after: { recipients: count }, req: ctx.req })
				return count as number
			})
			const batches = await pendingBatches(input)
			if (batches.length) await newsletterSendQueue.bulkPush(batches.map((data) => ({ data })))
			return { retried }
		}),
	recipients: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(z.object({
			id: z.uuid(),
			status: z.enum(['pending', 'sent', 'failed', 'skipped', 'bounced', 'complained']).optional(),
			search: z.string().trim().max(200).optional(),
			page: z.number().int().min(1).max(10_000).default(1),
			perPage: z.number().int().min(1).max(100).default(50),
		}))
		.query(async ({ input }) => {
			const params: unknown[] = [input.id]
			let where = 'newsletter_id = $1'
			if (input.status) { params.push(input.status); where += ` AND status = $${params.length}` }
			if (input.search) { params.push(input.search); where += ` AND (name ILIKE '%' || $${params.length} || '%' OR email ILIKE '%' || $${params.length} || '%')` }
			const [items, [{ count }]] = await Promise.all([
				dataSource.query(`SELECT id, name, email, status, error, sent_at AS "sentAt" FROM newsletter_recipients WHERE ${where} ORDER BY lower(name), id LIMIT ${input.perPage} OFFSET ${(input.page - 1) * input.perPage}`, params),
				dataSource.query(`SELECT count(*)::int AS count FROM newsletter_recipients WHERE ${where}`, params),
			])
			return { items: items as { id: string, name: string, email: string, status: `${NewsletterRecipientStatus}`, error: string | null, sentAt: Date | null }[], total: count as number }
		}),
	// A mutation: a hand-picked list can be too long for a URL.
	audienceSize: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(audienceFilter)
		.mutation(({ input }) => countAudience(input)),
	// Everyone, for picking people by hand; the ones a newsletter cannot reach
	// are shown as such rather than hidden.
	people: publicProcedure
		.use(authMiddleware(userAdmin))
		.query(async () => {
			const rows = await dataSource.query(`
				SELECT u.id, u.name, u.email, u.role, (${REACHABLE}) AS reachable
				FROM users u ORDER BY lower(u.name), u.id
			`)
			return rows as { id: string, name: string, email: string, role: string, reachable: boolean }[]
		}),
	audiences: publicProcedure
		.use(authMiddleware(userAdmin))
		.query(async () => {
			const rows = await dataSource.getRepository(Audience).find({ order: { name: 'ASC' } })
			return Promise.all(rows.map(async (audience) => ({
				id: audience.id, name: audience.name, filter: { ...EMPTY_AUDIENCE, ...audience.filter }, updatedAt: audience.updatedAt,
				count: (await countAudience({ ...EMPTY_AUDIENCE, ...audience.filter })).count,
			})))
		}),
	saveAudience: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(z.object({ id: z.uuid().optional(), name: z.string().trim().min(1).max(120), filter: audienceFilter }))
		.mutation(async ({ ctx, input }) => {
			return dataSource.transaction(async (em) => {
				const before = input.id ? await em.getRepository(Audience).findOneBy({ id: input.id }) : null
				if (input.id && !before) throw new TRPCError({ code: 'NOT_FOUND', message: 'Audience not found.' })
				const saved = await em.getRepository(Audience).save({ ...(before ?? { createdById: ctx.user.id }), name: input.name, filter: input.filter })
				await recordAudit(em, { actorId: ctx.user.id, action: 'audience.saved', targetType: 'audience', targetId: saved.id, before: before && { name: before.name, filter: before.filter }, after: { name: saved.name, filter: saved.filter }, req: ctx.req })
				return { id: saved.id, name: saved.name }
			})
		}),
	removeAudience: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(z.uuid())
		.mutation(async ({ ctx, input }) => {
			await dataSource.transaction(async (em) => {
				const before = await em.getRepository(Audience).findOneBy({ id: input })
				if (!before) return
				await em.getRepository(Audience).delete({ id: input })
				await recordAudit(em, { actorId: ctx.user.id, action: 'audience.removed', targetType: 'audience', targetId: input, before: { name: before.name, filter: before.filter }, req: ctx.req })
			})
			return { success: true }
		}),
	createImageUpload: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(z.object({ contentType: z.enum(NEWSLETTER_IMAGE_MIME_TYPES) }))
		.mutation(({ ctx, input }) => createNewsletterImageUpload(ctx.user.id, input.contentType)),
	finalizeImageUpload: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(z.object({ uploadId: z.uuid(), newsletterId: z.uuid().nullable() }))
		.mutation(({ ctx, input }) => processNewsletterImage(ctx.user.id, input.uploadId, input.newsletterId)),

	// The signed-in reader's own choice, from their account.
	mySubscription: publicProcedure
		.use(authMiddleware())
		.query(async ({ ctx }) => {
			const user = await dataSource.getRepository(User).findOneByOrFail({ id: ctx.user.id })
			return { subscribed: !user.newsletterOptOutAt, bouncedAt: user.emailBouncedAt, bounceReason: user.emailBounceReason }
		}),
	setMySubscription: publicProcedure
		.use(authMiddleware())
		.input(z.object({ subscribed: z.boolean() }))
		.mutation(async ({ ctx, input }) => {
			await setNewsletterSubscription(ctx.user.id, input.subscribed, true)
			return { subscribed: input.subscribed }
		}),

	// From the link in a newsletter, signed out. Reading the link changes
	// nothing: mail scanners open links, only the button on the page acts.
	// Subscribing again needs the account, so a forwarded newsletter cannot.
	subscription: publicProcedure
		.input(z.object({ token }))
		.query(async ({ ctx, input }) => {
			enforce(`unsubscribe:${ctx.req.ip}`, 60, 15 * 60 * 1000)
			const user = await subscriber(input.token)
			return { email: maskEmail(user.email), subscribed: !user.newsletterOptOutAt }
		}),
	unsubscribe: publicProcedure
		.input(z.object({ token }))
		.mutation(async ({ ctx, input }) => {
			enforce(`unsubscribe:${ctx.req.ip}`, 60, 15 * 60 * 1000)
			const user = await subscriber(input.token)
			await setNewsletterSubscription(user.id, false)
			return { email: maskEmail(user.email), subscribed: false }
		}),
})
