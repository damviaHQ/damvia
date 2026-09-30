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
// A module as a private package would ship its client part, built into the
// client for test/ui/modules.spec.ts: a page with a menu entry and an admin page.
import type { ClientModule } from "@/modules"
import { NotebookPen } from "@lucide/vue"

export default {
	name: 'hello',
	routes: [
		{ name: 'hello-notes', path: '/notes', component: () => import('./HelloNotes.vue'), meta: { layout: 'main', title: 'Notes', roles: ['admin', 'manager', 'member'] } },
		{ name: 'admin-hello', path: '/admin/notes', component: () => import('./HelloAdmin.vue'), meta: { layout: 'admin', title: 'All notes', roles: ['admin'] } },
	],
	nav: [{ label: 'Notes', to: { name: 'hello-notes' }, icon: NotebookPen }],
	adminNav: [{ section: 'users', label: 'All notes', to: { name: 'admin-hello' }, icon: NotebookPen }],
} satisfies ClientModule
