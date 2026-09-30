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
export type AudienceRole = 'admin' | 'manager' | 'member' | 'guest'
export type AudienceFilter = {
  everyone: boolean
  roles: AudienceRole[]
  groupIds: string[]
  regionIds: string[]
  includeUserIds: string[]
  excludeUserIds: string[]
}
export type NewsletterStatus = 'draft' | 'scheduled' | 'sending' | 'sent'

export const AUDIENCE_ROLES: { value: AudienceRole, label: string }[] = [
  { value: 'admin', label: 'Admins' },
  { value: 'manager', label: 'Managers' },
  { value: 'member', label: 'Members' },
  { value: 'guest', label: 'Guests' },
]

export const STATUS_LABELS: Record<NewsletterStatus, string> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  sending: 'Sending',
  sent: 'Sent',
}

export function emptyAudience(): AudienceFilter {
  return { everyone: false, roles: [], groupIds: [], regionIds: [], includeUserIds: [], excludeUserIds: [] }
}

export type AudienceNames = { groups: Map<string, string>, regions: Map<string, string>, people: Map<string, string> }

function list(items: string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} or ${items.at(-1)}`
}

function people(count: number): string {
  return `${count} ${count === 1 ? 'person' : 'people'}`
}

// One sentence saying who a filter reaches, as the server reads it: every
// criterion set must match, plus the people added, minus the people left out.
export function describeAudience(filter: AudienceFilter, names: AudienceNames): string {
  const named = (ids: string[], map: Map<string, string>) => ids.map(id => map.get(id)).filter((name): name is string => !!name)
  let base: string
  if (filter.everyone) {
    base = 'Everyone'
  } else {
    const roles = AUDIENCE_ROLES.filter(role => filter.roles.includes(role.value)).map(role => role.label.toLowerCase())
    const groups = named(filter.groupIds, names.groups)
    const regions = named(filter.regionIds, names.regions)
    const criteria = [
      groups.length && `in ${list(groups)}`,
      regions.length && `in ${regions.length === 1 ? 'the region ' : 'the regions '}${list(regions)}`,
    ].filter(Boolean)
    if (!roles.length && !criteria.length) {
      base = ''
    } else {
      const who = roles.length ? list(roles) : 'People'
      base = [who.charAt(0).toUpperCase() + who.slice(1), ...criteria].join(' ')
    }
  }
  const added = filter.everyone ? 0 : filter.includeUserIds.length
  const parts = [base, added && (base ? `plus ${people(added)}` : people(added))].filter(Boolean)
  if (!parts.length) return 'Nobody yet'
  const excluded = filter.excludeUserIds.length ? `, except ${people(filter.excludeUserIds.length)}` : ''
  return `${parts.join(', ')}${excluded}`
}
