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
import { EntityManager } from "typeorm"
import { RecordChangeAction } from "../entity/record-change"
import { logger } from "../env"
import { moduleEventQueue } from "../worker"

// What the core tells modules. Adding an event or a field is a minor change
// of the module contract; renaming or removing one is a breaking change.
export type ModuleEvents = {
	// A synchronisation pass over every asset source has finished.
	'assets.synced': Record<string, never>
	// Records were created, edited, moved or deleted, by hand, import or sync.
	'records.changed': { changes: { recordId: string | null, recordKey: string, action: RecordChangeAction }[], changedById: string | null }
}
export type ModuleEventName = keyof ModuleEvents
export type ModuleHooks = { [E in ModuleEventName]?: (payload: ModuleEvents[E]) => Promise<unknown> | unknown }
export type ModuleEventJob = { module: string, event: ModuleEventName, payload: unknown }

const subscribers = new Map<string, ModuleHooks>()

export function subscribeModule(name: string, hooks: ModuleHooks) {
	subscribers.set(name, hooks)
}

// Each subscribed module gets its own job, so a module whose hook fails is
// retried alone and never holds up the core or another module. Given the
// caller's transaction, the jobs are only delivered once it commits.
export async function emitModuleEvent<E extends ModuleEventName>(event: E, payload: ModuleEvents[E], em?: EntityManager) {
	for (const [module, hooks] of subscribers) {
		if (hooks[event]) await moduleEventQueue.push({ module, event, payload }, { em })
	}
}

export async function deliverModuleEvent(job: ModuleEventJob) {
	const hook = subscribers.get(job.module)?.[job.event] as ((payload: unknown) => unknown) | undefined
	if (!hook) {
		logger.warn('module.event.unhandled', { module: job.module, event: job.event })
		return
	}
	await hook(job.payload)
}
