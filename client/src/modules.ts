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
import { createTRPCProxyClient, httpLink, type TRPCLink } from "@trpc/client"
import type { AnyRouter } from "@trpc/server"
import type { Component } from "vue"
import type { RouteLocationRaw, RouteRecordRaw } from "vue-router"
import loaded from "virtual:damvia-modules"
import { endpoint, type RouterOutput } from "@/services/server"

// Places in the core screens where a module can show its own component, with
// the props each one receives. Adding one is a minor change of the module
// contract; renaming or removing one is a breaking change.
export type ModuleSlots = {
	// Under the fields of a product, on its page.
	'product.details': { product: RouterOutput['catalogue']['get'] }
}

// Admin menu sections, top to bottom.
export type AdminSection = 'overview' | 'content' | 'users' | 'assets' | 'database' | 'enrichment' | 'settings'

// A menu entry shows only to the roles its route allows.
export type ModuleNavItem = { label: string, to: RouteLocationRaw, icon?: Component }

export type ClientModule = {
	name: string
	routes?: RouteRecordRaw[]
	// In the main menu, under Favorites.
	nav?: ModuleNavItem[]
	adminNav?: (ModuleNavItem & { section: AdminSection })[]
	slots?: { [S in keyof ModuleSlots]?: Component }
}

// Filled at build time from DAMVIA_MODULES, see vite.config.ts.
export const clientModules: ClientModule[] = loaded

export const moduleRoutes = clientModules.flatMap((module) => module.routes ?? [])
export const moduleNav = clientModules.flatMap((module) => module.nav ?? [])
export const moduleAdminNav = (section: AdminSection) => clientModules.flatMap((module) => module.adminNav ?? []).filter((item) => item.section === section)
export const moduleSlot = (name: keyof ModuleSlots) => clientModules.flatMap((module) => module.slots?.[name] ?? [])

// The module's own procedures, typed by its router: moduleClient<HelloRouter>('hello').add.mutate(...)
export function moduleClient<TRouter extends AnyRouter>(name: string) {
	const prefix: TRPCLink<TRouter> = () => ({ next, op }) => next({ ...op, path: `modules.${name}.${op.path}` })
	return createTRPCProxyClient<TRouter>({
		links: [
			prefix,
			httpLink<AnyRouter>({
				url: endpoint,
				fetch: (url, options) => fetch(url, { ...options, credentials: 'include' }),
			}) as TRPCLink<TRouter>,
		],
	})
}
