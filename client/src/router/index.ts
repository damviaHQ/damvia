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
import { isPhoneNow } from "@/composables/useIsPhone"
import { guardNavigation } from "@/router/guard.ts"
import { moduleRoutes } from "@/modules"
import { useGlobalStore } from "@/stores/globalStore"
import { defineAsyncComponent, nextTick, type Component } from 'vue'
import { createRouter, createWebHistory, type RouteLocationRaw, type RouteRecordRaw } from 'vue-router'

declare module 'vue-router' {
	interface RouteMeta {
		layout?: 'main' | 'auth' | 'admin' | 'editor' | 'public'
		title?: string
		// Roles allowed on the route; the server checks again on every call.
		roles?: string[]
		// The phone screen for this route. Without one, phones get a "use a computer" screen.
		mobile?: () => Promise<{ default: Component }>
		// Screens that exist only on phones; a computer is sent home, or to `desktop`.
		mobileOnly?: boolean
		desktop?: RouteLocationRaw
	}
}

// Vue Router downloads a route's component before showing it. On a phone the
// phone screen replaces the desktop one, so the desktop view is handed over
// unloaded: it downloads only if that screen is ever shown at desktop width.
type Loader = () => Promise<unknown>
const deferOnPhone = (load: Loader): Loader => () => isPhoneNow() ? Promise.resolve(defineAsyncComponent(load as () => Promise<Component>)) : load()

// Sign-in and public pages are the same on every screen and load normally.
function signedInScreens(routes: RouteRecordRaw[]): RouteRecordRaw[] {
	return routes.map((route) => 'component' in route && typeof route.component === 'function' && ['main', 'admin', 'editor'].includes(route.meta?.layout ?? '')
		? { ...route, component: deferOnPhone(route.component as Loader) } as RouteRecordRaw
		: route)
}

const router = createRouter({
	history: createWebHistory(),
	routes: signedInScreens([
		{ name: 'login', path: '/login', component: () => import('@/views/auth/auth-login.vue'), meta: { layout: 'auth', title: 'Sign in' } },
		{ name: 'sign-up', path: '/sign-up', component: () => import('@/views/auth/auth-sign-up.vue'), meta: { layout: 'auth', title: 'Sign up' } },
		{ name: 'password-reset', path: '/password-reset', component: () => import('@/views/auth/auth-password-reset.vue'), meta: { layout: 'auth', title: 'Reset password' } },
		{ name: 'password-update', path: '/password-update', component: () => import('@/views/auth/auth-password-update.vue'), meta: { layout: 'auth', title: 'Update password' } },
		{ name: 'home', path: '/', component: () => import('@/views/home.vue'), meta: { layout: 'main', title: 'Home', mobile: () => import('@/mobile/views/MobileHome.vue') } },
		{ name: 'page', path: '/pages/:id', component: () => import('@/views/page.vue'), meta: { layout: 'main', title: 'Page', mobile: () => import('@/mobile/views/MobilePage.vue') } },
		{ name: 'my-collections', path: '/collections', component: () => import('@/views/my-collections.vue'), meta: { layout: 'main', title: 'My collections', mobile: () => import('@/mobile/views/MobileSaved.vue') } },
		{ name: 'collection', path: '/collections/:id', component: () => import('@/views/collection.vue'), meta: { layout: 'main', title: 'Collection', mobile: () => import('@/mobile/views/MobileCollection.vue') } },
		{ name: 'collection-edit', path: '/collections/:id/edit', component: () => import('@/views/page-edit.vue'), meta: { layout: 'editor', title: 'Edit page' } },
		{ name: 'collection-404', path: '/collections/:id/404', component: () => import('@/views/collection-404.vue'), meta: { layout: 'main', title: 'Collection not found', mobile: () => import('@/mobile/views/MobileNotFound.vue') } },
		{ name: 'catalogue', path: '/catalogue', component: () => import('@/views/catalogue.vue'), meta: { layout: 'main', title: 'Catalogue', mobile: () => import('@/mobile/views/MobileSearch.vue') } },
		{ name: 'product', path: '/products/:id', component: () => import('@/views/product.vue'), meta: { layout: 'main', title: 'Product', mobile: () => import('@/mobile/views/MobileProduct.vue') } },
		{ name: 'search', path: '/search', component: () => import('@/views/search.vue'), meta: { layout: 'main', title: 'Search', mobile: () => import('@/mobile/views/MobileSearch.vue') } },
		{ name: 'favorites', path: '/favorites', component: () => import('@/views/favorites.vue'), meta: { layout: 'main', title: 'Favorites', mobile: () => import('@/mobile/views/MobileSaved.vue') } },
		{ name: 'account', path: '/account/:section(profile|security|downloads|links|display)?', component: () => import('@/views/account.vue'), meta: { layout: 'main', title: 'Account', mobile: () => import('@/mobile/views/MobileAccount.vue') } },
		{ name: 'downloads', path: '/downloads', component: () => import('@/views/home.vue'), meta: { layout: 'main', title: 'Downloads', mobileOnly: true, desktop: { name: 'account', params: { section: 'downloads' } }, mobile: () => import('@/mobile/views/MobileDownloads.vue') } },
		{ name: 'admin-user', path: '/admin/users/:id', component: () => import('@/views/admin/admin-users.vue'), meta: { layout: 'admin', title: 'User', roles: ['admin', 'manager'], mobile: () => import('@/mobile/views/MobileUser.vue') } },
		{ name: 'admin-dashboard', path: '/admin', component: () => import('@/views/admin/admin-dashboard.vue'), meta: { layout: 'admin', roles: ['admin'], title: 'Dashboard', mobile: () => import('@/mobile/views/MobileStatus.vue') } },
		{ name: 'admin-analytics', path: '/admin/analytics', component: () => import('@/views/admin/admin-analytics.vue'), meta: { layout: 'admin', roles: ['admin'], title: 'Insights' } },
		{ name: 'admin-groups', path: '/admin/groups', component: () => import('@/views/admin/admin-groups.vue'), meta: { layout: 'admin', roles: ['admin'], title: 'Groups' } },
		{ name: 'admin-regions', path: '/admin/regions', component: () => import('@/views/admin/admin-regions.vue'), meta: { layout: 'admin', roles: ['admin'], title: 'Regions' } },
		{ name: 'admin-organisations', path: '/admin/organisations', component: () => import('@/views/admin/admin-organisations.vue'), meta: { layout: 'admin', roles: ['admin'], title: 'Organisations' } },
		{ name: 'admin-authorized-domains', path: '/admin/authorized-domains', component: () => import('@/views/admin/admin-authorized-domains.vue'), meta: { layout: 'admin', roles: ['admin'], title: 'Authorized domains' } },
		{ name: 'admin-audit-log', path: '/admin/audit-log', component: () => import('@/views/admin/admin-audit-log.vue'), meta: { layout: 'admin', roles: ['admin'], title: 'Audit log' } },
		{ name: 'admin-users', path: '/admin/users', component: () => import('@/views/admin/admin-users.vue'), meta: { layout: 'admin', title: 'Users', roles: ['admin', 'manager'], mobile: () => import('@/mobile/views/MobileUsers.vue') } },
		{ name: 'admin-settings', path: '/admin/settings', component: () => import('@/views/admin/admin-settings.vue'), meta: { layout: 'admin', roles: ['admin'], title: 'Settings' } },
		{ name: 'admin-emails', path: '/admin/emails', component: () => import('@/views/admin/admin-emails.vue'), meta: { layout: 'admin', roles: ['admin'], title: 'Emails' } },
		{ name: 'admin-email', path: '/admin/emails/:key', component: () => import('@/views/admin/admin-email-edit.vue'), meta: { layout: 'admin', roles: ['admin'], title: 'Edit email' } },
		{ name: 'admin-newsletters', path: '/admin/newsletters', component: () => import('@/views/admin/admin-newsletters.vue'), meta: { layout: 'admin', roles: ['admin'], title: 'Newsletters' } },
		{ name: 'admin-newsletter', path: '/admin/newsletters/:id', component: () => import('@/views/admin/admin-newsletter-edit.vue'), meta: { layout: 'admin', roles: ['admin'], title: 'Newsletter' } },
		{ name: 'admin-assets', path: '/admin/assets/:id?', component: () => import('@/views/admin/admin-assets.vue'), meta: { layout: 'admin', roles: ['admin'], title: 'Assets' } },
		{ name: 'admin-asset-types', path: '/admin/asset-types', component: () => import('@/views/admin/admin-asset-types.vue'), meta: { layout: 'admin', roles: ['admin'], title: 'Asset types' } },
		{ path: '/admin/data-enrichment', redirect: { name: 'admin-matching' } },
		{ name: 'admin-variants', path: '/admin/data-enrichment/variants', component: () => import('@/views/admin/admin-variants.vue'), meta: { layout: 'admin', roles: ['admin'], title: 'Variants' } },
		{ name: 'admin-matching', path: '/admin/data-enrichment/matching', component: () => import('@/views/admin/admin-matching.vue'), meta: { layout: 'admin', roles: ['admin'], title: 'Link to records' } },
		{ path: '/admin/data-enrichment/unmatched', redirect: (to) => ({ name: 'admin-matching', query: { tab: to.query.tab === 'manual' ? 'manual' : 'review' } }) },
		{ name: 'admin-folder-rules', path: '/admin/folder-rules', redirect: { name: 'admin-asset-types', query: { tab: 'folder-rules' } } },
		{ name: 'admin-licenses', path: '/admin/licenses', component: () => import('@/views/admin/admin-licenses.vue'), meta: { layout: 'admin', roles: ['admin'], title: 'Licenses' } },
		{ name: 'admin-records', path: '/admin/data-enrichment/records', component: () => import('@/views/admin/records/index.vue'), meta: { layout: 'admin', roles: ['admin'], title: 'Records' } },
		{ name: 'admin-record-import', path: '/admin/data-enrichment/records/import', component: () => import('@/views/admin/records/admin-record-import.vue'), meta: { layout: 'admin', roles: ['admin'], title: 'Import records' } },
		{ name: 'admin-file-metadata', path: '/admin/data-enrichment/file-metadata', component: () => import('@/views/admin/admin-file-metadata.vue'), meta: { layout: 'admin', roles: ['admin'], title: 'File metadata' } },
		// Record fields are set from the records page, file metadata on its own page.
		{ path: '/admin/data-enrichment/fields', redirect: (to) => to.query.tab === 'metadata' ? { name: 'admin-file-metadata', query: {} } : { name: 'admin-records', query: { fields: '1' } } },
		{ path: '/admin/data-enrichment/records/attributes', redirect: { name: 'admin-records', query: { fields: '1' } } },
		{ path: '/admin/data-enrichment/settings', redirect: '/admin/settings' },
		{ path: '/admin/products', redirect: '/admin/data-enrichment/records' },
		{ path: '/admin/products/import', redirect: '/admin/data-enrichment/records/import' },
		{ path: '/admin/products/attributes', redirect: '/admin/data-enrichment/records/attributes' },
		{ name: 'admin-menu-items', path: '/admin/menu-items', component: () => import('@/views/admin/admin-menu.vue'), meta: { layout: 'admin', roles: ['admin'], title: 'Menu' } },
		{ name: 'admin-collections', path: '/admin/collections', component: () => import('@/views/admin/admin-collections.vue'), meta: { layout: 'admin', roles: ['admin'], title: 'Collections' } },
		{ name: 'admin-product-collections', path: '/admin/product-collections', component: () => import('@/views/admin/admin-product-collections.vue'), meta: { layout: 'admin', roles: ['admin'], title: 'Products' } },
		{ name: 'admin-collection-products', path: '/admin/collections/:id/products', component: () => import('@/views/admin/admin-collection-products.vue'), meta: { layout: 'admin', roles: ['admin'], title: 'Products' } },
		{ name: 'admin-pages', path: '/admin/pages', component: () => import('@/views/admin/pages/index.vue'), meta: { layout: 'admin', roles: ['admin'], title: 'Pages' } },
		{ name: 'admin-page', path: '/admin/pages/:id', component: () => import('@/views/page-edit.vue'), meta: { layout: 'editor', roles: ['admin'], title: 'Edit page' } },
		{ name: 'privacy-policy', path: '/privacy-policy', component: () => import('@/views/public/public-privacy-policy.vue'), meta: { layout: 'public', title: 'Privacy Policy' } },
		{ name: 'legal-information', path: '/legal-information', component: () => import('@/views/public/public-legal-information.vue'), meta: { layout: 'public', title: 'Legal Information' } },
		{ name: 'link-expired', path: '/link-expired', component: () => import('@/views/public/public-link-expired.vue'), meta: { layout: 'public', title: 'Link expired' } },
		{ name: 'unsubscribe', path: '/unsubscribe', component: () => import('@/views/public/public-unsubscribe.vue'), meta: { layout: 'public', title: 'Newsletters' } },
		...moduleRoutes,
	]),
})

router.beforeEach(async (to) => {
	const globalStore = useGlobalStore()
	await globalStore.whenReady()
	return guardNavigation(to, globalStore.isAuthenticated, globalStore.user?.role, isPhoneNow())
})

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
