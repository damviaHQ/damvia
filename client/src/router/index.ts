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
import { guardNavigation } from "@/router/guard.ts"
import { useGlobalStore } from "@/stores/globalStore"
import { nextTick } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
	history: createWebHistory(),
	routes: [
		{ name: 'login', path: '/login', component: () => import('@/views/auth/auth-login.vue'), meta: { layout: 'auth', title: 'Sign in' } },
		{ name: 'sign-up', path: '/sign-up', component: () => import('@/views/auth/auth-sign-up.vue'), meta: { layout: 'auth', title: 'Sign up' } },
		{ name: 'password-reset', path: '/password-reset', component: () => import('@/views/auth/auth-password-reset.vue'), meta: { layout: 'auth', title: 'Reset password' } },
		{ name: 'password-update', path: '/password-update', component: () => import('@/views/auth/auth-password-update.vue'), meta: { layout: 'auth', title: 'Update password' } },
		{ name: 'home', path: '/', component: () => import('@/views/home.vue'), meta: { layout: 'main', title: 'Home' } },
		{ name: 'page', path: '/pages/:id', component: () => import('@/views/page.vue'), meta: { layout: 'main', title: 'Page' } },
		{ name: 'my-collections', path: '/collections', component: () => import('@/views/my-collections.vue'), meta: { layout: 'main', title: 'My collections' } },
		{ name: 'collection', path: '/collections/:id', component: () => import('@/views/collection.vue'), meta: { layout: 'main', title: 'Collection' } },
		{ name: 'collection-edit', path: '/collections/:id/edit', component: () => import('@/views/page-edit.vue'), meta: { layout: 'editor', title: 'Edit page' } },
		{ name: 'collection-404', path: '/collections/:id/404', component: () => import('@/views/collection-404.vue'), meta: { layout: 'main', title: 'Collection not found' } },
		{ name: 'search', path: '/search', component: () => import('@/views/search.vue'), meta: { layout: 'main', title: 'Search' } },
		{ name: 'favorites', path: '/favorites', component: () => import('@/views/favorites.vue'), meta: { layout: 'main', title: 'Favorites' } },
		{ name: 'admin-dashboard', path: '/admin', component: () => import('@/views/admin/admin-dashboard.vue'), meta: { layout: 'admin', title: 'Dashboard' } },
		{ name: 'admin-analytics', path: '/admin/analytics', component: () => import('@/views/admin/admin-analytics.vue'), meta: { layout: 'admin', title: 'Insights' } },
		{ name: 'admin-groups', path: '/admin/groups', component: () => import('@/views/admin/admin-groups.vue'), meta: { layout: 'admin', title: 'Groups' } },
		{ name: 'admin-regions', path: '/admin/regions', component: () => import('@/views/admin/admin-regions.vue'), meta: { layout: 'admin', title: 'Regions' } },
		{ name: 'admin-authorized-domains', path: '/admin/authorized-domains', component: () => import('@/views/admin/admin-authorized-domains.vue'), meta: { layout: 'admin', title: 'Authorized domains' } },
		{ name: 'admin-users', path: '/admin/users', component: () => import('@/views/admin/admin-users.vue'), meta: { layout: 'admin', title: 'Users' } },
		{ name: 'admin-settings', path: '/admin/settings', component: () => import('@/views/admin/admin-settings.vue'), meta: { layout: 'admin', title: 'Settings' } },
		{ name: 'admin-assets', path: '/admin/assets/:id?', component: () => import('@/views/admin/admin-assets.vue'), meta: { layout: 'admin', title: 'Assets' } },
		{ name: 'admin-asset-types', path: '/admin/asset-types', component: () => import('@/views/admin/admin-asset-types.vue'), meta: { layout: 'admin', title: 'Asset types' } },
		{ name: 'admin-folder-rules', path: '/admin/folder-rules', component: () => import('@/views/admin/admin-folder-rules.vue'), meta: { layout: 'admin', title: 'Folder rules' } },
		{ name: 'admin-licenses', path: '/admin/licenses', component: () => import('@/views/admin/admin-licenses.vue'), meta: { layout: 'admin', title: 'Licenses' } },
		{ name: 'admin-records', path: '/admin/data-enrichment/records', component: () => import('@/views/admin/records/index.vue'), meta: { layout: 'admin', title: 'Records' } },
		{ name: 'admin-record-import', path: '/admin/data-enrichment/records/import', component: () => import('@/views/admin/records/admin-record-import.vue'), meta: { layout: 'admin', title: 'Import records' } },
		{ name: 'admin-record-attributes', path: '/admin/data-enrichment/records/attributes', component: () => import('@/views/admin/records/admin-record-attributes.vue'), meta: { layout: 'admin', title: 'Record attributes' } },
		{ path: '/admin/data-enrichment/settings', redirect: '/admin/settings' },
		{ path: '/admin/products', redirect: '/admin/data-enrichment/records' },
		{ path: '/admin/products/import', redirect: '/admin/data-enrichment/records/import' },
		{ path: '/admin/products/attributes', redirect: '/admin/data-enrichment/records/attributes' },
		{ name: 'admin-menu-items', path: '/admin/menu-items', component: () => import('@/views/admin/admin-menu.vue'), meta: { layout: 'admin', title: 'Menu' } },
		{ name: 'admin-collections', path: '/admin/collections', component: () => import('@/views/admin/admin-collections.vue'), meta: { layout: 'admin', title: 'Collections' } },
		{ name: 'admin-pages', path: '/admin/pages', component: () => import('@/views/admin/pages/index.vue'), meta: { layout: 'admin', title: 'Pages' } },
		{ name: 'admin-page', path: '/admin/pages/:id', component: () => import('@/views/page-edit.vue'), meta: { layout: 'editor', title: 'Edit page' } },
		{ name: 'privacy-policy', path: '/privacy-policy', component: () => import('@/views/public/public-privacy-policy.vue'), meta: { layout: 'public', title: 'Privacy Policy' } },
		{ name: 'legal-information', path: '/legal-information', component: () => import('@/views/public/public-legal-information.vue'), meta: { layout: 'public', title: 'Legal Information' } },
		{ name: 'link-expired', path: '/link-expired', component: () => import('@/views/public/public-link-expired.vue'), meta: { layout: 'public', title: 'Link expired' } },
	],
})

router.beforeEach((to) => guardNavigation(to, useGlobalStore().isAuthenticated))

router.afterEach((to, from, failure) => {
	if (failure) {
		return
	}
	const appName = useGlobalStore().env?.appName
	if (appName) {
		document.title = to.meta.title ? `${to.meta.title} · ${appName}` : appName
	}
	if (from.matched.length && to.path !== from.path) {
		nextTick(() => document.querySelector<HTMLElement>('main')?.focus())
	}
})

export default router
