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
import { EmailSettings } from "../../entity/email-settings"
import { EmailTemplate } from "../../entity/email-template"
import { dataSource, mailTransporter } from "../../env"
import { EMAIL_DEFINITIONS, EMAIL_KEYS, emailDefinition, GLOBAL_VARIABLES } from "../../mail/catalogue"
import { assertRenders, emailSender, renderEmail, templateContent } from "../../mail/render"
import { sanitizeBlockHtml } from "../../page-blocks/sanitize"
import { recordAudit } from "../../services/audit"
import { enforce } from "../../services/rate-limit"
import { authMiddleware, publicProcedure, router, userAdmin } from "../index"

const key = z.enum(EMAIL_KEYS)
const content = z.object({
	subject: z.string().trim().min(1).max(300),
	preheader: z.string().trim().max(300),
	heading: z.string().trim().max(300),
	bodyHtml: z.string().max(50_000),
	buttonLabel: z.string().trim().max(80),
})
const settings = z.object({
	senderName: z.string().trim().max(120).nullable(),
	senderAddress: z.email().max(254).nullable(),
	replyTo: z.email().max(254).nullable(),
	footerText: z.string().trim().max(1000),
})

function clean(input: z.infer<typeof content>) {
	return { ...input, bodyHtml: sanitizeBlockHtml(input.bodyHtml) }
}

export default router({
	list: publicProcedure
		.use(authMiddleware(userAdmin))
		.query(async () => {
			const rows = await dataSource.getRepository(EmailTemplate).find({ relations: { updatedBy: true } })
			return EMAIL_DEFINITIONS.map((definition) => {
				const row = rows.find((candidate) => candidate.key === definition.key)
				return {
					key: definition.key,
					label: definition.label,
					group: definition.group,
					trigger: definition.trigger,
					recipients: definition.recipients,
					subject: row?.subject ?? definition.defaults.subject,
					customised: !!row,
					updatedAt: row?.updatedAt ?? null,
					updatedBy: row?.updatedBy?.name ?? null,
				}
			})
		}),
	get: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(key)
		.query(async ({ input }) => {
			const definition = emailDefinition(input)
			const current = await templateContent(input)
			return {
				key: definition.key,
				label: definition.label,
				trigger: definition.trigger,
				recipients: definition.recipients,
				hasButton: !!definition.action,
				variables: [...GLOBAL_VARIABLES, ...definition.variables],
				blocks: definition.blocks,
				content: current.content,
				defaults: definition.defaults,
				customised: current.customised,
				updatedAt: current.updatedAt,
			}
		}),
	update: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(z.object({ key, content }))
		.mutation(async ({ ctx, input }) => {
			const values = clean(input.content)
			await assertRenders(input.key, values)
			await dataSource.transaction(async (em) => {
				const before = await em.getRepository(EmailTemplate).findOneBy({ key: input.key })
				await em.getRepository(EmailTemplate).save({ key: input.key, ...values, updatedById: ctx.user.id })
				await recordAudit(em, { actorId: ctx.user.id, action: 'email_template.updated', targetType: 'email_template', targetId: input.key, before: before ?? emailDefinition(input.key).defaults, after: values, req: ctx.req })
			})
			return templateContent(input.key)
		}),
	reset: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(key)
		.mutation(async ({ ctx, input }) => {
			await dataSource.transaction(async (em) => {
				const before = await em.getRepository(EmailTemplate).findOneBy({ key: input })
				if (!before) return
				await em.getRepository(EmailTemplate).delete({ key: input })
				await recordAudit(em, { actorId: ctx.user.id, action: 'email_template.reset', targetType: 'email_template', targetId: input, before, req: ctx.req })
			})
			return templateContent(input)
		}),
	// Unsaved changes, rendered with sample values. A mutation, so the draft
	// travels in the body: a long message would not fit in a URL.
	preview: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(z.object({ key, content }))
		.mutation(async ({ input }) => {
			const values = clean(input.content)
			await assertRenders(input.key, values)
			const email = await renderEmail(input.key, emailDefinition(input.key).sample, values)
			return { subject: email.subject, html: email.html }
		}),
	sendTest: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(z.object({ key, content }))
		.mutation(async ({ ctx, input }) => {
			enforce(`email-test:${ctx.user.id}`, 10, 15 * 60 * 1000)
			const values = clean(input.content)
			await assertRenders(input.key, values)
			const [email, sender] = await Promise.all([renderEmail(input.key, emailDefinition(input.key).sample, values), emailSender()])
			try {
				await mailTransporter().sendMail({ from: sender.from, replyTo: sender.replyTo, to: ctx.user.email, subject: `[Test] ${email.subject}`, html: email.html, text: email.text })
			} catch (error) {
				throw new TRPCError({ code: 'BAD_GATEWAY', message: `The mail server refused the test email: ${(error as Error).message}` })
			}
			return { sentTo: ctx.user.email }
		}),
	getSettings: publicProcedure
		.use(authMiddleware(userAdmin))
		.query(async () => {
			const row = await dataSource.getRepository(EmailSettings).findOneByOrFail({ id: 1 })
			const sender = await emailSender()
			return {
				senderName: row.senderName,
				senderAddress: row.senderAddress,
				replyTo: row.replyTo,
				footerText: row.footerText,
				effectiveFrom: sender.from,
			}
		}),
	updateSettings: publicProcedure
		.use(authMiddleware(userAdmin))
		.input(settings)
		.mutation(async ({ ctx, input }) => {
			const values = { ...input, senderName: input.senderName || null }
			await dataSource.transaction(async (em) => {
				const before = await em.getRepository(EmailSettings).findOneByOrFail({ id: 1 })
				await em.getRepository(EmailSettings).update({ id: 1 }, values)
				await recordAudit(em, { actorId: ctx.user.id, action: 'email_settings.updated', targetType: 'email_settings', before, after: values, req: ctx.req })
			})
			return values
		}),
})
