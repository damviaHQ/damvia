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
	const selection = ref<{ type: 'collection' | 'file', id: string }[]>([])
	const displayPreferences = ref<{ [assetTypeId: string]: 'grid' | 'list' }>(
		JSON.parse(localStorage.getItem('dam_display_preferences') || '{}')
	)

	function setDisplayPreferences(assetTypeId: string, display: 'grid' | 'list') {
		displayPreferences.value[assetTypeId] = display
		localStorage.setItem('dam_display_preferences', JSON.stringify(displayPreferences.value))
	}

	function clearDisplayPreferences() {
		displayPreferences.value = {}
		localStorage.removeItem('dam_display_preferences')
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
			document.title = data.appName
		})
	}

	function logout() {
		Cookie.remove('dam_token')
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
		clearDisplayPreferences,
		setDisplayPreferences,
		fetchEnv,
		selection,
		setSelection(items: { type: 'collection' | 'file', id: string }[]) {
			selection.value = items
		},
		addToSelection(item: { type: 'collection' | 'file', id: string }) {
			selection.value = [...selection.value, item]
		},
		removeFromSelection(item: { type: 'collection' | 'file', id: string }) {
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
