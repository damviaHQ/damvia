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
import { AnyRouter } from "@trpc/server"
import { resolve } from "node:path"
import { MixedList } from "typeorm"
import { dataSource, logger } from "../env"
import { recordAudit } from "../services/audit"
import { authMiddleware, publicProcedure, router, userAdmin, userApproved, userManagerOrAdmin, userMember } from "../trpc"
import { createQueue } from "../worker"
import { ModuleHooks, subscribeModule } from "./events"

export type { ModuleEvents, ModuleHooks } from "./events"

// Everything a module may use from the core. A module gets nothing else, so
// the core can change freely behind this object.
export type ModuleApi = ReturnType<typeof moduleApi>

export type ModuleSetup = {
	// Tables are named after the module (hello_notes for the hello module).
	entities?: MixedList<Function | string>
	migrations?: MixedList<Function | string>
	// Served at modules.<name>.
	router?: AnyRouter
	hooks?: ModuleHooks
}

export type DamviaModule = {
	name: string
	setup: (damvia: ModuleApi) => ModuleSetup
}

function moduleApi(name: string) {
	return {
		dataSource,
		logger: logger.child({ module: name }),
		router,
		publicProcedure,
		authMiddleware,
		userAdmin,
		userManagerOrAdmin,
		userMember,
		userApproved,
		recordAudit,
		// Queues are named after the module: hello/digest for the hello module.
		createQueue: <T>(options: Parameters<typeof createQueue<T>>[0]) => createQueue<T>({ ...options, name: `${name}/${options.name}` }),
	}
}

// DAMVIA_MODULES lists packages, or paths from the working directory, separated by commas.
export function moduleEntries(value: string | undefined) {
	return (value ?? '').split(',').map((entry) => entry.trim()).filter(Boolean)
}

function loadModule(entry: string): DamviaModule & ModuleSetup {
	const exported = require(entry.startsWith('.') || entry.startsWith('/') ? resolve(entry) : entry)
	const definition: DamviaModule = exported.default ?? exported
	if (typeof definition?.name !== 'string' || !/^[a-z][a-zA-Z0-9]*$/.test(definition.name) || typeof definition.setup !== 'function') {
		throw new Error(`Module ${entry} must export a name in camelCase and a setup function.`)
	}
	return { ...definition, ...definition.setup(moduleApi(definition.name)) }
}

function loadModules() {
	const modules = moduleEntries(process.env.DAMVIA_MODULES).map(loadModule)
	for (const [index, module] of modules.entries()) {
		if (modules.findIndex((other) => other.name === module.name) !== index) {
			throw new Error(`Two modules are named ${module.name}.`)
		}
		subscribeModule(module.name, module.hooks ?? {})
		logger.info('module loaded', { module: module.name })
	}
	// Before the data source initializes, so their tables and migrations join the core's.
	dataSource.setOptions({
		entities: [...Object.values(dataSource.options.entities ?? {}), ...modules.flatMap((module) => Object.values(module.entities ?? {}))],
		migrations: [...Object.values(dataSource.options.migrations ?? {}), ...modules.flatMap((module) => Object.values(module.migrations ?? {}))],
	})
	return modules
}

export const modules = loadModules()

export const moduleRouters = Object.fromEntries(modules.filter((module) => module.router).map((module) => [module.name, module.router!]))
