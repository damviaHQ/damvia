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
import { FastifyInstance } from 'fastify'
import { SessionMethod } from './entity/user-session'
import { apiURL, appURL, logger, oidcSettings, secureCookies } from './env'
import { finishOidcSignIn, OIDC_COOKIE, OidcSignInError, startOidcSignIn, userFromClaims } from './services/oidc'
import { recordAudit } from './services/audit'
import { hit } from './services/rate-limit'
import { createSession } from './services/session'

const cookiePath = '/v1/auth/oidc'

function loginURL(query: Record<string, string>) {
	const url = new URL(appURL())
	url.pathname = '/login'
	for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value)
	return url.toString()
}

// The browser leaves for the identity provider and comes back to the API,
// which opens a session and sends it on to the client.
export function registerOidcRoutes(server: FastifyInstance) {
	server.get<{ Querystring: { redirect?: string } }>('/v1/auth/oidc/start', async (req, res) => {
		if (!oidcSettings()) return res.code(404).send()
		if (!hit(`oidc:ip:${req.ip}`, 20, 60 * 1000)) return res.redirect(loginURL({ sso_error: 'failed' }))
		try {
			const { url, cookie } = await startOidcSignIn(req.query.redirect ?? '/')
			res.setCookie(OIDC_COOKIE, cookie, { path: cookiePath, httpOnly: true, secure: secureCookies(), sameSite: 'lax', maxAge: 600 })
			return res.redirect(url)
		} catch (error) {
			logger.error('oidc.start', { error })
			return res.redirect(loginURL({ sso_error: 'failed' }))
		}
	})

	server.get('/v1/auth/oidc/callback', async (req, res) => {
		const settings = oidcSettings()
		if (!settings) return res.code(404).send()
		res.clearCookie(OIDC_COOKIE, { path: cookiePath })
		try {
			const { claims, redirect } = await finishOidcSignIn(new URL(req.url, apiURL()), req.cookies[OIDC_COOKIE])
			const user = await userFromClaims(claims, settings)
			await createSession(req, res, user, SessionMethod.SSO)
			return res.redirect(new URL(redirect, appURL()).toString())
		} catch (error) {
			const reason = error instanceof OidcSignInError ? error.reason : 'failed'
			logger.warn('oidc.callback', { reason, error: error instanceof OidcSignInError ? undefined : error })
			await recordAudit(null, { actorId: null, action: 'auth.sso_failed', targetType: 'identity_provider', targetId: settings.issuer, after: { reason }, req }).catch(() => undefined)
			return res.redirect(loginURL({ sso_error: reason }))
		}
	})
}
