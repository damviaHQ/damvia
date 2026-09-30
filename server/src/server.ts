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
import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify'
import fastify from 'fastify'
import { appRouter, createContext } from './trpc'
import {apiURL, appURL, assetsS3, assetsS3Bucket, dataSource, emailEventsSecret, logger, requestLogging, trustProxy} from "./env"
import {Download, DownloadStatus} from "./entity/download";
import { userCollectionFilesQuery } from "./services/collection"
import { recordAudit } from "./services/audit"
import { registerOidcRoutes } from "./oidc-routes"
import { readEmailLogo } from "./services/branding"
import { readNewsletterImage } from "./services/newsletter-image"
import { readUnsubscribeToken, setNewsletterSubscription } from "./services/newsletter"
import { hit } from "./services/rate-limit"
import { applyEmailEvent, readEmailEvents, snsConfirmationUrl } from "./services/email-events"
import { createHash, timingSafeEqual } from "node:crypto"

const server = fastify({ routerOptions: { maxParamLength: 5000 }, logger: false, bodyLimit: 5242880, trustProxy: trustProxy() })

const allowedOrigins = [new URL(appURL()).origin, new URL(apiURL()).origin]

server.register(cookie)
server.register(helmet, {
	contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
	crossOriginResourcePolicy: { policy: 'same-site' },
	referrerPolicy: { policy: 'no-referrer' },
})
server.register(cors, { origin: allowedOrigins[0], credentials: true })

// The session cookie is SameSite=Lax; refusing mutations from other origins
// closes the remaining cross-site request forgery paths. Requests without an
// Origin header come from non-browser clients, which hold no cookie.
server.addHook('onRequest', async (req, res) => {
	const origin = req.headers.origin
	if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS' && origin && !allowedOrigins.includes(origin)) {
		return res.code(403).send({ error: 'Origin not allowed' })
	}
})

// API answers carry personal data; no browser or proxy should keep a copy.
server.addHook('onSend', async (req, res, payload) => {
	if (req.url.startsWith('/trpc/')) res.header('Cache-Control', 'no-store')
	return payload
})

if (requestLogging()) {
	// The query string is left out: tRPC inputs and links can carry tokens.
	server.addHook('onResponse', async (req, res) => {
		logger.info('http.response', {
			method: req.method,
			path: req.url.split('?')[0].replace(/^\/v1\/downloads\/[^/]+/, '/v1/downloads/:id').replace(/^\/v1\/unsubscribe\/[^/]+/, '/v1/unsubscribe/:token').replace(/^\/v1\/email-events\/[^/]+/, '/v1/email-events/:secret'),
			status: res.statusCode,
			ms: Math.round(res.elapsedTime),
			ip: req.ip,
			requestId: req.id,
		})
	})
}
server.register(fastifyTRPCPlugin, {
	prefix: '/trpc',
	trpcOptions: {
		router: appRouter,
		createContext,
		onError(opts) {
			const { error, path, ctx, req } = opts
			if (error.code !== 'INTERNAL_SERVER_ERROR') {
				logger.warn('http.request', { code: error.code, path, userId: ctx?.user?.id, requestId: req.id })
				return
			}
			const cause = error.cause as (Error & { code?: unknown }) | undefined
			logger.error('http.request', {
				code: error.code, path, userId: ctx?.user?.id, requestId: req.id,
				cause: cause && { name: cause.name, code: cause.code, message: cause.message },
			})
		},
	},
})
// A download link works without signing in, so it can be passed on. It stops
// working when it expires, or when its owner could no longer download the files.
registerOidcRoutes(server)

server.get<{ Params: { downloadId: string } }>(
	'/v1/downloads/:downloadId',
	async (req, res) => {
		const expiresURL = new URL(appURL())
		expiresURL.pathname = '/link-expired'
		const download = UUID.test(req.params.downloadId)
			? await dataSource.getRepository(Download).findOne({ where: { id: req.params.downloadId }, relations: { user: true } })
			: null
		if (!download || download.status !== DownloadStatus.READY || download.expiresAt.getTime() < Date.now() || !await ownerCanStillDownload(download)) {
			res.redirect(expiresURL.toString())
			return
		}

		// Who fetched a shared link is unknown; where it was fetched from is kept.
		await recordAudit(null, { actorId: null, action: 'download.link_opened', targetType: 'download', targetId: download.id, after: { ownerId: download.userId }, req })
		const downloadURL = await assetsS3().presignedGetObject(assetsS3Bucket(), download.storageKey, DOWNLOAD_REDIRECT_SECONDS)
		res.redirect(downloadURL)
	},
)

// Emails show the client logo from here; mail clients and webmail proxies load
// it from other sites, so it is public and cross-origin.
server.get('/v1/branding/email-logo.png', async (_req, res) => {
	const logo = await readEmailLogo().catch((error) => {
		logger.error('branding.email-logo-failed', { code: error.code })
		return null
	})
	if (!logo) return res.code(404).send()
	res.header('Content-Type', 'image/png')
	res.header('Cache-Control', 'public, max-age=3600')
	res.header('Cross-Origin-Resource-Policy', 'cross-origin')
	return res.send(logo)
})

// Images in newsletters. They never change, so mail clients may keep them.
server.get<{ Params: { file: string } }>('/v1/newsletter-images/:file', async (req, res) => {
	const [, id, extension] = /^([0-9a-f-]{36})\.(png|jpg)$/i.exec(req.params.file) ?? []
	const image = id && UUID.test(id) ? await readNewsletterImage(id.toLowerCase(), extension.toLowerCase()).catch((error) => {
		logger.error('newsletter.image-failed', { code: error.code })
		return null
	}) : null
	if (!image) return res.code(404).send()
	res.header('Content-Type', image.contentType)
	res.header('Cache-Control', 'public, max-age=31536000, immutable')
	res.header('Cross-Origin-Resource-Policy', 'cross-origin')
	return res.send(image.body)
})

// The one-click unsubscribe mail clients offer next to the sender (RFC 8058).
// It comes from the mail provider's servers, without cookies or an Origin.
// The body only says "List-Unsubscribe=One-Click", as a form: it is not read.
server.register(async (scope) => {
	scope.addContentTypeParser('*', { parseAs: 'string', bodyLimit: 1024 }, (_req, _body, done) => done(null, null))
	scope.post<{ Params: { token: string } }>('/v1/unsubscribe/:token', async (req, res) => {
		if (!hit(`unsubscribe:${req.ip}`, 60, 15 * 60 * 1000)) return res.code(429).send()
		const userId = await readUnsubscribeToken(req.params.token)
		if (!userId || !await setNewsletterSubscription(userId, false)) return res.code(400).send()
		return res.code(200).send()
	})
})

// Bounces and complaints, posted by the mail provider. The secret in the
// address is the proof it comes from there; every provider can post to a URL.
server.register(async (scope) => {
	scope.addContentTypeParser(['application/json', 'text/plain'], { parseAs: 'string', bodyLimit: 1024 * 1024 }, (_req, body, done) => {
		try { done(null, JSON.parse(body as string)) } catch { done(null, null) }
	})
	scope.post<{ Params: { secret: string } }>('/v1/email-events/:secret', async (req, res) => {
		const secret = emailEventsSecret()
		const digest = (value: string) => createHash('sha256').update(value).digest()
		if (!secret || !timingSafeEqual(digest(req.params.secret), digest(secret))) return res.code(404).send()
		const confirmation = snsConfirmationUrl(req.body)
		if (confirmation) {
			const confirmed = await fetch(confirmation, { redirect: 'error', signal: AbortSignal.timeout(10_000) }).then((reply) => reply.ok, () => false)
			logger.info('email.events-subscription', { confirmed })
			return res.code(confirmed ? 200 : 502).send()
		}
		for (const event of readEmailEvents(req.body)) await applyEmailEvent(event)
		return res.code(200).send()
	})
})

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DOWNLOAD_REDIRECT_SECONDS = 5 * 60

async function ownerCanStillDownload(download: Download): Promise<boolean> {
	const owner = download.user
	if (!owner?.approved || !owner.emailVerified || owner.suspendedAt) return false
	const ids = [...new Set(download.collectionFileIds)]
	if (!ids.length) return true
	const visible = await userCollectionFilesQuery(owner).andWhere('collection_file.id IN (:...ids)', { ids }).getCount()
	return visible === ids.length
}

export default server
