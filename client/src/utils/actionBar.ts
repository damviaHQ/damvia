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
export type ActionBarMode = 'everyone' | 'only' | 'except' | 'nobody'
export type ActionBarRole = 'admin' | 'manager' | 'member' | 'guest'
export type ActionBarRule = { mode: ActionBarMode, roles: ActionBarRole[], groupIds: string[], userIds: string[] }
export type ActionBarAction = 'filter' | 'search' | 'display' | 'share'
export type ActionBarSettings = Partial<Record<ActionBarAction, ActionBarRule>>

export const ACTION_BAR_MODES: { value: ActionBarMode, label: string }[] = [
  { value: 'everyone', label: 'Everyone' },
  { value: 'only', label: 'Only…' },
  { value: 'except', label: 'Everyone except…' },
  { value: 'nobody', label: 'No one' },
]

// Admins always see every action, so they are not offered.
export const ACTION_BAR_ROLES: { value: ActionBarRole, label: string }[] = [
  { value: 'manager', label: 'Managers' },
  { value: 'member', label: 'Members' },
  { value: 'guest', label: 'Guests' },
]

export function emptyRule(mode: ActionBarMode = 'everyone'): ActionBarRule {
  return { mode, roles: [], groupIds: [], userIds: [] }
}

// Every action gets a rule of its own, so the form never shares arrays with
// the collection it was read from.
export function editableSettings(settings: ActionBarSettings | null | undefined): Required<ActionBarSettings> {
  const copy = (rule?: ActionBarRule) => rule
    ? { mode: rule.mode, roles: [...rule.roles], groupIds: [...rule.groupIds], userIds: [...rule.userIds] }
    : emptyRule()
  return { filter: copy(settings?.filter), search: copy(settings?.search), display: copy(settings?.display), share: copy(settings?.share) }
}

function list(parts: string[]) {
  if (parts.length <= 1) return parts.join('')
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

export function describeAudience(rule: ActionBarRule, names: { groups: Map<string, string>, users: Map<string, string> }) {
  const parts = ACTION_BAR_ROLES.filter(role => rule.roles.includes(role.value)).map(role => role.label)
  const groups = rule.groupIds.map(id => names.groups.get(id)).filter((name): name is string => !!name)
  parts.push(...(groups.length > 2 ? [`${groups.length} groups`] : groups))
  const users = rule.userIds.map(id => names.users.get(id)).filter((name): name is string => !!name)
  parts.push(...(users.length > 2 ? [`${users.length} people`] : users))
  return list(parts)
}

// One plain sentence per action, so the editor reads the setting without
// opening anything.
export function describeRule(rule: ActionBarRule | undefined, names: { groups: Map<string, string>, users: Map<string, string> }) {
  if (!rule || rule.mode === 'everyone') return 'Visible to everyone'
  if (rule.mode === 'nobody') return 'Hidden from everyone'
  const audience = describeAudience(rule, names)
  if (rule.mode === 'only') return audience ? `Visible to ${audience} only` : 'Hidden from everyone until you pick who sees it'
  return audience ? `Hidden from ${audience}` : 'Visible to everyone'
}

export function isRestricted(rule: ActionBarRule | undefined) {
  return !!rule && rule.mode !== 'everyone' && !(rule.mode === 'except' && !rule.roles.length && !rule.groupIds.length && !rule.userIds.length)
}
