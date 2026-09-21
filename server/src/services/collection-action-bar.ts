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
import { EntityManager, In } from "typeorm"
import { ACTION_BAR_ACTIONS, ActionBarAction, ActionBarRule, ActionBarSettings, Collection } from "../entity/collection"
import { User } from "../entity/user"
import { dataSource } from "../env"

export type InheritedActionBar = {
	settings: ActionBarSettings
	inheritedFrom: { id: string, name: string } | null
}

// The nearest ancestor with its own settings wins. Read at request time, so a
// moved or newly synchronized collection follows its new parent without
// anything being copied.
export async function inheritedActionBar(collection: Collection, em: EntityManager = dataSource.manager): Promise<InheritedActionBar> {
	const ancestorIds = (collection.parentCollectionIds ?? []).filter((id) => id !== collection.id)
	if (!ancestorIds.length) {
		return { settings: {}, inheritedFrom: null }
	}
	const ancestors = await em.getRepository(Collection).find({
		where: { id: In(ancestorIds) },
		select: { id: true, name: true, actionBar: true },
	})
	for (const id of ancestorIds.reverse()) {
		const ancestor = ancestors.find((current) => current.id === id)
		if (ancestor?.actionBar) {
			return { settings: ancestor.actionBar, inheritedFrom: { id: ancestor.id, name: ancestor.name } }
		}
	}
	return { settings: {}, inheritedFrom: null }
}

export function ruleAllows(rule: ActionBarRule | undefined, user: User, groupIds: string[]) {
	if (!rule || rule.mode === 'everyone') return true
	if (rule.mode === 'nobody') return false
	const listed = rule.roles.includes(user.role) ||
		rule.userIds.includes(user.id) ||
		rule.groupIds.some((groupId) => groupIds.includes(groupId))
	return rule.mode === 'only' ? listed : !listed
}

// Whoever can edit the collection keeps every action, so nobody locks
// themselves out of what they configure.
export function visibleActions(settings: ActionBarSettings, user: User, groupIds: string[], canEdit: boolean) {
	return Object.fromEntries(
		ACTION_BAR_ACTIONS.map((action) => [action, canEdit || ruleAllows(settings[action], user, groupIds)]),
	) as Record<ActionBarAction, boolean>
}

// What the collection page needs to draw its bar. Readers only learn what
// they can use; editors also get the rules, where they come from, and how
// many sub-collections have their own.
export async function formatActionBar(collection: Collection, user: User) {
	const canEdit = collection.canEdit(user)
	const inherited = await inheritedActionBar(collection)
	const settings = collection.actionBar ?? inherited.settings
	const groupIds: string[] = canEdit ? [] : (await dataSource.query(
		`SELECT group_id::text AS id FROM user_groups WHERE user_id = $1`, [user.id],
	)).map((row: { id: string }) => row.id)
	return {
		visibleActions: visibleActions(settings, user, groupIds, canEdit),
		actionBar: canEdit ? {
			own: collection.actionBar,
			inherited: inherited.settings,
			inheritedFrom: inherited.inheritedFrom,
			descendantOverrides: await countDescendantOverrides(collection),
		} : null,
	}
}

export async function countDescendantOverrides(collection: Collection, em: EntityManager = dataSource.manager) {
	const [row] = await em.query(
		`SELECT count(*)::int AS count FROM collections
		WHERE $1::text = ANY(string_to_array(mpath, '.')) AND id <> $1::uuid AND action_bar IS NOT NULL`,
		[collection.id],
	)
	return row.count as number
}

export async function resetDescendantActionBars(em: EntityManager, collection: Collection) {
	await em.query(
		`UPDATE collections SET action_bar = NULL
		WHERE $1::text = ANY(string_to_array(mpath, '.')) AND id <> $1::uuid AND action_bar IS NOT NULL`,
		[collection.id],
	)
}
