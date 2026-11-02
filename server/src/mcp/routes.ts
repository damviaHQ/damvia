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
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify"
import { appURL, logger } from "../env"
import { hit } from "../services/rate-limit"
import { appRouter } from "../trpc"
import {
	authenticateBearer, authenticateClient, exchangeCode, mcpResource, oauthMetadata, OAuthError,
	protectedResourceMetadata, refreshTokens, registerClient, revokeToken,
} from "./oauth"
import { INSTRUCTIONS, registerTools } from "./tools"

// Paths an assistant's servers call directly. They authenticate with a
// bearer token, PKCE or a client secret, never with the session cookie, so
// the cross-site check on the Origin header does not apply to them.
export const EXTERNAL_PATHS = ['/v1/mcp', '/v1/oauth/token', '/v1/oauth/register', '/v1/oauth/revoke']

const RESOURCE_METADATA_PATH = '/.well-known/oauth-protected-resource/v1/mcp'

function sendOAuthError(res: FastifyReply, error: unknown) {
	if (error instanceof OAuthError) return res.code(error.status).header('Cache-Control', 'no-store').send({ error: error.error, error_description: error.description })
	logger.error('oauth.failed', { message: (error as Error).message })
	return res.code(500).header('Cache-Control', 'no-store').send({ error: 'server_error' })
}

export function registerMcpRoutes(server: FastifyInstance) {
	server.get('/.well-known/oauth-authorization-server', async () => oauthMetadata())
	server.get('/.well-known/oauth-protected-resource', async () => protectedResourceMetadata())
	server.get(RESOURCE_METADATA_PATH, async () => protectedResourceMetadata())

	// The consent page lives in the client; it checks the request again.
	server.get('/v1/oauth/authorize', async (req, res) => {
		const query = new URLSearchParams(req.query as Record<string, string>)
		res.redirect(`${appURL().replace(/\/+$/, '')}/connect-assistant?${query.toString()}`)
	})

	server.register(async (scope) => {
		scope.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string', bodyLimit: 16 * 1024 }, (_req, body, done) => {
			done(null, Object.fromEntries(new URLSearchParams(body as string)))
		})

		scope.post('/v1/oauth/register', async (req, res) => {
			if (!hit(`oauth-register:${req.ip}`, 20, 60 * 60 * 1000)) return res.code(429).send({ error: 'too_many_requests' })
			try {
				return res.code(201).header('Cache-Control', 'no-store').send(await registerClient((req.body ?? {}) as Record<string, unknown>))
			} catch (error) { return sendOAuthError(res, error) }
		})

		scope.post('/v1/oauth/token', async (req, res) => {
			if (!hit(`oauth-token:${req.ip}`, 60, 60 * 1000)) return res.code(429).send({ error: 'too_many_requests' })
			const body = (req.body ?? {}) as Record<string, string | undefined>
			try {
				const client = await authenticateClient(body, req.headers.authorization)
				const tokens = body.grant_type === 'authorization_code' ? await exchangeCode(client, body, req)
					: body.grant_type === 'refresh_token' ? await refreshTokens(client, body)
						: (() => { throw new OAuthError('unsupported_grant_type', 'Use authorization_code or refresh_token.') })()
				return res.header('Cache-Control', 'no-store').header('Pragma', 'no-cache').send(tokens)
			} catch (error) { return sendOAuthError(res, error) }
		})

		scope.post('/v1/oauth/revoke', async (req, res) => {
			const body = (req.body ?? {}) as Record<string, string | undefined>
			try {
				const client = await authenticateClient(body, req.headers.authorization)
				await revokeToken(client, body.token)
				return res.code(200).send({})
			} catch (error) { return sendOAuthError(res, error) }
		})
	})

	// One MCP server per request: the endpoint keeps no state between calls,
	// so any process can answer any request.
	server.post('/v1/mcp', async (req, res) => {
		const auth = await authenticateBearer(req.headers.authorization)
		if (!auth) {
			const metadata = `${new URL(mcpResource()).origin}${RESOURCE_METADATA_PATH}`
			const invalid = req.headers.authorization ? ', error="invalid_token"' : ''
			return res.code(401).header('WWW-Authenticate', `Bearer resource_metadata="${metadata}"${invalid}`).send({ error: 'unauthorized' })
		}
		if (!hit(`mcp:${auth.grant.id}`, 120, 60 * 1000)) return res.code(429).send({ error: 'too_many_requests' })
		const mcp = new McpServer({ name: 'damvia', version: '1.0.0' }, { instructions: INSTRUCTIONS })
		const caller = appRouter.createCaller({ req, res, user: auth.user, session: auth.session })
		await registerTools(mcp, { caller, auth })
		const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
		res.hijack()
		res.raw.on('close', () => { void transport.close(); void mcp.close() })
		try {
			await mcp.connect(transport)
			await transport.handleRequest(req.raw, res.raw, req.body)
		} catch (error) {
			logger.error('mcp.request-failed', { message: (error as Error).message, userId: auth.user.id })
			if (!res.raw.headersSent) res.raw.writeHead(500, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'server_error' }))
		}
	})
	const notAllowed = async (_req: FastifyRequest, res: FastifyReply) => res.code(405).header('Allow', 'POST').send({ error: 'method_not_allowed' })
	server.get('/v1/mcp', notAllowed)
	server.delete('/v1/mcp', notAllowed)
}
