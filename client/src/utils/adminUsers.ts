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
import type { RouterOutput } from '@/services/server'
export type AdminUser = RouterOutput['user']['list'][number]
export type UserView = 'all' | 'active' | 'pending' | 'unverified'
export type UserFilters = { search: string; view: UserView; role: string; region: string; group: string }
export type UserSort = 'name' | 'createdAt'
type Viewer = { id: string; role: string; regionId: string } | undefined

export function userState(user: Pick<AdminUser, 'approved' | 'emailVerified'>): Exclude<UserView, 'all'> {
  return !user.emailVerified ? 'unverified' : user.approved ? 'active' : 'pending'
}
export const userStateLabels = { active: 'Active', pending: 'Needs approval', unverified: 'Unverified' }
export function filterUsers(users: AdminUser[], filters: UserFilters, sort: UserSort, ascending: boolean) {
  const query = filters.search.trim().toLocaleLowerCase()
  return users.filter(user =>
    (!query || [user.name, user.email, user.company].some(value => value.toLocaleLowerCase().includes(query))) &&
    (filters.view === 'all' || userState(user) === filters.view) &&
    (filters.role === 'all' || (filters.role === 'no-guests' ? user.role !== 'guest' : user.role === filters.role)) &&
    (filters.region === 'all' || user.regionId === filters.region) &&
    (filters.group === 'all' || user.groups.some(group => group.id === filters.group))
  ).sort((a, b) => ((ascending ? 1 : -1) * a[sort].localeCompare(b[sort])) || a.id.localeCompare(b.id))
}
export function canEditUser(viewer: Viewer, user: AdminUser) {
  return !!viewer && (viewer.role === 'admin' || (viewer.role === 'manager' && viewer.regionId === user.regionId && (viewer.id === user.id || ['member', 'guest'].includes(user.role))))
}
export function canApproveUser(viewer: Viewer, user: AdminUser) {
  return userState(user) === 'pending' && !!viewer && (viewer.role === 'admin' || (viewer.role === 'manager' && viewer.regionId === user.regionId && ['member', 'guest'].includes(user.role)))
}
export function canDeleteUser(viewer: Viewer, user: AdminUser) {
  return viewer?.id !== user.id && canEditUser(viewer, user)
}
export function csvCell(value: unknown) {
  const text = String(value ?? '')
  const safe = /^(?:[\s\uFEFF]*[=+\-@]|[\t\r\n])/.test(text) ? `'${text}` : text
  return `"${safe.replace(/"/g, '""')}"`
}
export function usersCsv(users: AdminUser[]) {
  const rows = [['Name', 'Email', 'Company', 'Role', 'Region', 'Groups', 'Status', 'Joined', 'Last login'], ...users.map(user => [
    user.name, user.email, user.company, user.role, user.region, user.groups.map(group => group.name).join('; '), userStateLabels[userState(user)], user.createdAt, user.lastLoginAt,
  ])]
  return '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n')
}
