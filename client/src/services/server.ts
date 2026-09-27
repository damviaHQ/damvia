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
import { createTRPCProxyClient, httpLink, TRPCClientError } from "@trpc/client"
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server'
import type { AppRouter } from "server/src/trpc"

export type RouterInput = inferRouterInputs<AppRouter>
export type RouterOutput = inferRouterOutputs<AppRouter>

export const endpoint = import.meta.env.VITE_API_ENDPOINT ?? 'http://localhost:3000/trpc'

// The API's public URL, for the routes outside tRPC such as single sign-on.
export const apiBase = endpoint.replace(/\/trpc\/?$/, '')

export const trpc = createTRPCProxyClient<AppRouter>({
	links: [
		// The session travels in an HttpOnly cookie set by the API.
		httpLink({
			url: endpoint,
			fetch: (url, options) => fetch(url, { ...options, credentials: 'include' }),
		}),
	],
})

// Trades a session token from before server-side sessions (a `dam_token`
// cookie or link parameter) for a session cookie, once.
export async function upgradeLegacyToken(token: string) {
	await fetch(`${endpoint}/auth.upgradeLegacyToken`, {
		method: 'POST',
		credentials: 'include',
		headers: { authorization: token },
	})
}

export function extractErrors(error: Error) {
	const res = { message: error.message, fieldErrors: {} as Record<string, string> }
	if (error instanceof TRPCClientError && error.data?.fieldErrors) {
		Object.entries(error.data.fieldErrors).forEach(([key, values]) => {
			res.fieldErrors[key] = (values as string[])[0]
		})
	}
	return res
}
