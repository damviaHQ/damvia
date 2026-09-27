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
import { TRPCClientError } from "@trpc/client"
import Cookie from 'js-cookie'
import { defineStore } from "pinia"
import { computed, getCurrentInstance, onMounted, ref } from "vue"
import { useRouter } from "vue-router"
import { queryClient } from "../services/queryClient"
import { RouterOutput, trpc, upgradeLegacyToken } from "../services/server.ts"
import { readDisplayDetails, type DisplayDetails, type DisplayView } from "../utils/displayPreferences"
import { clearRecentSearches } from "../utils/recentSearches"

export type SelectionItem = { type: 'collection' | 'file' | 'record', id: string }

export const useGlobalStore = defineStore('global', () => {
	const router = useRouter()
	const user = ref<RouterOutput['user']['me']>()
	const env = ref<RouterOutput['env']>()
	// The session cookie is HttpOnly, so whether someone is signed in is known
	// only once the API has answered `user.me`.
	const authChecked = ref(false)
	const isAuthenticated = computed(() => user.value !== undefined)
	// A selection holds whatever the reader is about to act on: collections,
	// files, or products from the catalogue.
	const selection = ref<SelectionItem[]>([])
	const productNavigationSources = ref<{ id: number, productIds: string[] }[]>([])
	let nextProductNavigationSource = 0
	const productNavigationIds = computed(() => [...new Set(productNavigationSources.value.flatMap(source => source.productIds))])
	function registerProductNavigationSource() {
		const id = nextProductNavigationSource++
		productNavigationSources.value.push({ id, productIds: [] })
		return id
	}
	function updateProductNavigationSource(id: number, productIds: string[]) {
		const source = productNavigationSources.value.find(source => source.id === id)
		if (source) source.productIds = productIds
	}
	function removeProductNavigationSource(id: number) {
		productNavigationSources.value = productNavigationSources.value.filter(source => source.id !== id)
	}
	const displayPreferences = ref<{ [assetTypeId: string]: DisplayView }>(
		JSON.parse(localStorage.getItem('dam_display_preferences') || '{}')
	)

	const displayDetails = ref(readDisplayDetails())
	// On unless the reader switched it off: the admin turned grouping on per asset type.
	const groupVariants = ref(localStorage.getItem('dam_group_variants') !== 'false')

	function setGroupVariants(value: boolean) {
		groupVariants.value = value
		localStorage.setItem('dam_group_variants', String(value))
	}

	// Only Save persists the available dimensions; selected values stay in the view.
	const pageFilters = ref<string[]>(readPageFilters())
	const savedPageFilters = ref<string[]>([...pageFilters.value])
	const pageFiltersChanged = computed(() => pageFilters.value.length !== savedPageFilters.value.length
		|| pageFilters.value.some(key => !savedPageFilters.value.includes(key)))

	function savePageFilters() {
		localStorage.setItem('dam_page_filters', JSON.stringify(pageFilters.value))
		savedPageFilters.value = [...pageFilters.value]
	}

	function readPageFilters(): string[] {
		try {
			const saved = JSON.parse(localStorage.getItem('dam_page_filters') || '[]')
			return Array.isArray(saved) ? saved.filter((key): key is string => typeof key === 'string' && key !== 'name') : []
		} catch {
			return []
		}
	}

	function togglePageFilter(key: string) {
		pageFilters.value = pageFilters.value.includes(key)
			? pageFilters.value.filter(current => current !== key)
			: [...pageFilters.value, key]
	}

	function clearPageFilters() {
		pageFilters.value = []
	}

	function setDisplayDetails(id: string, details: DisplayDetails) {
		displayDetails.value[id] = { ...displayDetails.value[id], ...details }
		localStorage.setItem('dam_display_details', JSON.stringify(displayDetails.value))
	}

	function resetDisplayPreference(id: string) {
		delete displayPreferences.value[id]
		delete displayDetails.value[id]
		localStorage.setItem('dam_display_preferences', JSON.stringify(displayPreferences.value))
		localStorage.setItem('dam_display_details', JSON.stringify(displayDetails.value))
	}

	function setDisplayPreferences(assetTypeId: string, display: DisplayView) {
		displayPreferences.value[assetTypeId] = display
		localStorage.setItem('dam_display_preferences', JSON.stringify(displayPreferences.value))
	}

	function clearDisplayPreferences() {
		displayPreferences.value = {}
		localStorage.removeItem('dam_display_preferences')
		displayDetails.value = {}
		localStorage.removeItem('dam_display_details')
		groupVariants.value = true
		localStorage.removeItem('dam_group_variants')
	}

	function fetchUser() {
		return trpc.user.me.query()
			.then((data) => {
				user.value = data
			})
			.catch((error) => {
				if (error instanceof TRPCClientError && error.data?.code === 'UNAUTHORIZED') {
					const wasSignedIn = user.value !== undefined
					clearSession()
					if (wasSignedIn) router.push({ name: 'login' })
				}
			})
	}

	function fetchEnv() {
		return trpc.env.query().then((data) => {
			env.value = data
			const title = router.currentRoute.value.meta.title
			document.title = title ? `${title} · ${data.appName}` : data.appName
		})
	}

	// Nothing from one person's session may show to the next person on the
	// same browser: cached queries are keyed by resource, not by user.
	function clearSession() {
		clearRecentSearches()
		localStorage.removeItem('damvia_search_options')
		queryClient.clear()
		selection.value = []
		user.value = undefined
	}

	async function logout() {
		await trpc.auth.logout.mutate().catch(() => undefined)
		clearSession()
		router.push({ name: 'login' })
	}

	// Never rejects: the router waits on it, and a failed check means signed out.
	async function restoreSession() {
		try {
			const url = new URL(window.location.href)
			const legacyToken = url.searchParams.get('dam_token') ?? Cookie.get('dam_token')
			if (legacyToken) {
				Cookie.remove('dam_token')
				url.searchParams.delete('dam_token')
				window.history.replaceState(window.history.state, '', url.toString())
				await upgradeLegacyToken(legacyToken).catch(() => undefined)
			}
			await fetchUser()
		} catch {
			user.value = undefined
		} finally {
			authChecked.value = true
		}
	}

	const ready = restoreSession()

	// The app creates the store while mounting; created anywhere else, there is
	// no component to wait for.
	if (getCurrentInstance()) onMounted(fetchEnv)
	else fetchEnv()

	return {
		authChecked,
		whenReady: () => ready,
		isAuthenticated,
		user,
		fetchUser,
		logout,
		env,
		displayPreferences,
		displayDetails,
		groupVariants,
		setGroupVariants,
		pageFilters,
		pageFiltersChanged,
		savePageFilters,
		togglePageFilter,
		clearPageFilters,
		setDisplayDetails,
		resetDisplayPreference,
		clearDisplayPreferences,
		setDisplayPreferences,
		fetchEnv,
		selection,
		productNavigationIds,
		registerProductNavigationSource,
		updateProductNavigationSource,
		removeProductNavigationSource,
		setSelection(items: SelectionItem[]) {
			selection.value = items
		},
		addToSelection(item: SelectionItem) {
			selection.value = [...selection.value, item]
		},
		removeFromSelection(item: SelectionItem) {
			selection.value = selection.value.filter(
				(selection) => !(selection.type === item.type && selection.id === item.id)
			)
		},
		clearSelection() {
			selection.value = []
		},
		// Called after a sign-in procedure has set the session cookie.
		async signedIn() {
			await fetchUser()
		},
	}
})
