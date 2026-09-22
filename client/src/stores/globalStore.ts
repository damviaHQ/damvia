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
import { computed, onMounted, ref, watch } from "vue"
import { useRouter } from "vue-router"
import { RouterOutput, trpc } from "../services/server.ts"
import { readDisplayDetails, type DisplayDetails, type DisplayView } from "../utils/displayPreferences"
import { clearRecentSearches } from "../utils/recentSearches"

export type SelectionItem = { type: 'collection' | 'file' | 'record', id: string }

export const useGlobalStore = defineStore('global', () => {
	const router = useRouter()
	const searchParamsToken = new URLSearchParams(window.location.search).get('dam_token')
	if (searchParamsToken) {
		Cookie.set('dam_token', searchParamsToken, { expires: 365 })
	}

	const authToken = ref<string | undefined>(Cookie.get('dam_token'))
	const user = ref<RouterOutput['user']['me']>()
	const env = ref<RouterOutput['env']>()
	const isAuthenticated = computed(() => authToken.value !== undefined)
	// A selection holds whatever the reader is about to act on: collections,
	// files, or products from the catalogue.
	const selection = ref<SelectionItem[]>([])
	const displayPreferences = ref<{ [assetTypeId: string]: DisplayView }>(
		JSON.parse(localStorage.getItem('dam_display_preferences') || '{}')
	)

	const displayDetails = ref(readDisplayDetails())

	// Which filters the reader has put on the bar. Showing every facet at once
	// was a wall of controls, so the funnel offers the page's filters and only
	// the chosen ones are drawn. A choice stays everywhere until it is taken
	// back, the same promise the display preferences make.
	const pageFilters = ref<string[]>(readPageFilters())

	function readPageFilters(): string[] {
		try {
			const saved = JSON.parse(localStorage.getItem('dam_page_filters') || '[]')
			return Array.isArray(saved) ? saved.filter((key): key is string => typeof key === 'string') : []
		} catch {
			return []
		}
	}

	function togglePageFilter(key: string) {
		pageFilters.value = pageFilters.value.includes(key)
			? pageFilters.value.filter(current => current !== key)
			: [...pageFilters.value, key]
		localStorage.setItem('dam_page_filters', JSON.stringify(pageFilters.value))
	}

	function clearPageFilters() {
		pageFilters.value = []
		localStorage.removeItem('dam_page_filters')
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
	}

	function fetchUser() {
		return trpc.user.me.query()
			.then((data) => {
				user.value = data
			})
			.catch((error) => {
				if (error instanceof TRPCClientError && error.data?.code === 'UNAUTHORIZED') {
					logout()
					router.push({ name: 'login' })
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

	function logout() {
		Cookie.remove('dam_token')
		clearRecentSearches()
		localStorage.removeItem('damvia_search_options')
		authToken.value = undefined
		router.push({ name: 'login' })
	}

	watch(isAuthenticated, () => {
		if (isAuthenticated.value) {
			fetchUser()
		}
	}, { immediate: true })

	onMounted(fetchEnv)

	return {
		authToken,
		isAuthenticated,
		user,
		fetchUser,
		logout,
		env,
		displayPreferences,
		displayDetails,
		pageFilters,
		togglePageFilter,
		clearPageFilters,
		setDisplayDetails,
		resetDisplayPreference,
		clearDisplayPreferences,
		setDisplayPreferences,
		fetchEnv,
		selection,
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
		async setAuthToken(newToken: string) {
			Cookie.set('dam_token', newToken, { expires: 365 })
			authToken.value = newToken
			await fetchUser()
		},
	}
})
