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
import {apiURL, appURL, assetsS3, assetsS3Bucket, dataSource, logger, requestLogging, trustProxy} from "./env"
import {Download, DownloadStatus} from "./entity/download";
import { userCollectionFilesQuery } from "./services/collection"
import { recordAudit } from "./services/audit"
import { registerOidcRoutes } from "./oidc-routes"

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
			path: req.url.split('?')[0].replace(/^\/v1\/downloads\/[^/]+/, '/v1/downloads/:id'),
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
