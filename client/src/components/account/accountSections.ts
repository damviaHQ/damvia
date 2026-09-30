// Damvia - Open Source Digital Asset Manager
// Copyright (C) 2024  Arnaud DE SAINT JEAN
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as
// published by the Free Software Foundation, either version 3 of the
// License, or (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.
import { FileDown, LayoutDashboard, Link, ShieldCheck, User } from '@lucide/vue'

export const accountSections = [
  { id: 'profile', label: 'Profile', icon: User, description: 'Your name, company and email, and a copy of your data.' },
  { id: 'security', label: 'Security', icon: ShieldCheck, description: 'Two-step verification and the browsers where you are signed in.' },
  { id: 'downloads', label: 'Downloads', icon: FileDown, description: 'Download links stay available for 7 days after they are ready.' },
  { id: 'links', label: 'Links', icon: Link, description: 'Guests you invited to your collections.' },
  { id: 'display', label: 'Display preferences', icon: LayoutDashboard, description: 'The layout each kind of content opens in for you: grid, list or masonry.' },
] as const

export type AccountSectionId = typeof accountSections[number]['id']

export function accountSection(id: unknown) {
  return accountSections.find(section => section.id === id) ?? accountSections[0]
}
