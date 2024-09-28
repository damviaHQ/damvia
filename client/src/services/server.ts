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
import { useGlobalStore } from "../stores/globalStore.ts"
import Cookie from "js-cookie"

export type RouterInput = inferRouterInputs<AppRouter>
export type RouterOutput = inferRouterOutputs<AppRouter>

export const endpoint = import.meta.env.VITE_API_ENDPOINT ?? 'http://localhost:3000/trpc'

export const trpc = createTRPCProxyClient<AppRouter>({
	links: [
		httpLink({
			url: endpoint,
			async headers() {
				const globalStore = useGlobalStore()
				return { authorization: globalStore.authToken ?? Cookie.get('dam_token') }
			},
		}),
	],
})

export function extractErrors(error: Error) {
	const res = { message: error.message, fieldErrors: {} as Record<string, string> }
	if (error instanceof TRPCClientError && error.data?.fieldErrors) {
		Object.entries(error.data.fieldErrors).forEach(([key, values]) => {
			res.fieldErrors[key] = (values as string[])[0]
		})
	}
	return res
}
