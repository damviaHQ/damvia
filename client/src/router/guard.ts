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
import type { RouteLocationNormalized, RouteLocationRaw } from 'vue-router'

export const authRoutes = ['login', 'sign-up', 'password-reset', 'password-update']
export const publicRoutes = ['legal-information', 'privacy-policy', 'link-expired']

export function guardNavigation(to: Pick<RouteLocationNormalized, 'name' | 'query'>, isAuthenticated: boolean): true | RouteLocationRaw | undefined {
  const name = to.name as string
  if (publicRoutes.includes(name)) {
    return true
  }
  if (!isAuthenticated && !authRoutes.includes(name)) {
    return { name: 'login', query: to.query }
  } else if (isAuthenticated && authRoutes.includes(name)) {
    return { name: 'home' }
  }
  return undefined
}
