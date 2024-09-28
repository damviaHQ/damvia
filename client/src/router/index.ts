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
import { useGlobalStore } from "@/stores/globalStore"
import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
	history: createWebHistory(),
	routes: [
		{ name: 'login', path: '/login', component: () => import('@/views/auth/auth-login.vue'), meta: { layout: 'auth' } },
		{ name: 'sign-up', path: '/sign-up', component: () => import('@/views/auth/auth-sign-up.vue'), meta: { layout: 'auth' } },
		{ name: 'password-reset', path: '/password-reset', component: () => import('@/views/auth/auth-password-reset.vue'), meta: { layout: 'auth' } },
		{ name: 'password-update', path: '/password-update', component: () => import('@/views/auth/auth-password-update.vue'), meta: { layout: 'auth' } },
		{ name: 'home', path: '/', component: () => import('@/views/home.vue'), meta: { layout: 'main' } },
		{ name: 'page', path: '/pages/:id', component: () => import('@/views/page.vue'), meta: { layout: 'main' } },
		{ name: 'collection', path: '/collections/:id', component: () => import('@/views/collection.vue'), meta: { layout: 'main' } },
		{ name: 'collection-404', path: '/collections/:id/404', component: () => import('@/views/collection-404.vue'), meta: { layout: 'main' } },
		{ name: 'search', path: '/search', component: () => import('@/views/search.vue'), meta: { layout: 'main' } },
		{ name: 'favorites', path: '/favorites', component: () => import('@/views/favorites.vue'), meta: { layout: 'main' } },
		{ name: 'admin-groups', path: '/admin/groups', component: () => import('@/views/admin/admin-groups.vue'), meta: { layout: 'admin' } },
		{ name: 'admin-regions', path: '/admin/regions', component: () => import('@/views/admin/admin-regions.vue'), meta: { layout: 'admin' } },
		{ name: 'admin-authorized-domains', path: '/admin/authorized-domains', component: () => import('@/views/admin/admin-authorized-domains.vue'), meta: { layout: 'admin' } },
		{ name: 'admin-users', path: '/admin/users', component: () => import('@/views/admin/admin-users.vue'), meta: { layout: 'admin' } },
		{ name: 'admin-settings', path: '/admin/settings', component: () => import('@/views/admin/admin-settings.vue'), meta: { layout: 'admin' } },
		{ name: 'admin-assets', path: '/admin/assets/:id?', component: () => import('@/views/admin/admin-assets.vue'), meta: { layout: 'admin' } },
		{ name: 'admin-asset-types', path: '/admin/asset-types', component: () => import('@/views/admin/admin-asset-types.vue'), meta: { layout: 'admin' } },
		{ name: 'admin-licenses', path: '/admin/licenses', component: () => import('@/views/admin/admin-licenses.vue'), meta: { layout: 'admin' } },
		{ name: 'admin-products', path: '/admin/products', component: () => import('@/views/admin/products/index.vue'), meta: { layout: 'admin' } },
		{ name: 'admin-product-import', path: '/admin/products/import', component: () => import('@/views/admin/products/admin-product-import.vue'), meta: { layout: 'admin' } },
		{ name: 'admin-product-attributes', path: '/admin/products/attributes', component: () => import('@/views/admin/products/admin-product-attributes.vue'), meta: { layout: 'admin' } },
		{ name: 'admin-menu-items', path: '/admin/menu-items', component: () => import('@/views/admin/admin-menu.vue'), meta: { layout: 'admin' } },
		{ name: 'admin-collections', path: '/admin/collections', component: () => import('@/views/admin/admin-collections.vue'), meta: { layout: 'admin' } },
		{ name: 'admin-pages', path: '/admin/pages', component: () => import('@/views/admin/pages/index.vue'), meta: { layout: 'admin' } },
		{ name: 'admin-page', path: '/admin/pages/:id', component: () => import('@/views/admin/pages/admin-page-edit.vue'), meta: { layout: 'admin' } },
		{ name: 'privacy-policy', path: '/privacy-policy', component: () => import('@/views/public/public-privacy-policy.vue'), meta: { layout: 'public' } },
		{ name: 'legal-information', path: '/legal-information', component: () => import('@/views/public/public-legal-information.vue'), meta: { layout: 'public' } },
	],
})

const authRoutes = ['login', 'sign-up', 'password-reset', 'password-update']
const publicRoutes = ['legal-information', 'privacy-policy']

router.beforeEach((to) => {
	const store = useGlobalStore()
	if (publicRoutes.includes(to.name as string)) {
		return true
	}

	if (!store.isAuthenticated && !authRoutes.includes(to.name as string)) {
		return { name: 'login', query: to.query }
	} else if (store.isAuthenticated && authRoutes.includes(to.name as string)) {
		return { name: 'home' }
	}
})

export default router
