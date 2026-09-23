/* Damvia - Open Source Digital Asset Manager
Copyright (C) 2024 Arnaud DE SAINT JEAN
This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>. */
import type { DisplayCollection, DisplayFile, DisplayProduct } from '@/utils/displayPreferences'
import { computed, inject, onScopeDispose, provide, ref, watch, type InjectionKey, type Ref } from 'vue'

// Products are announced apart from files: they narrow with the same field
// facets, but the display preferences group files by asset type and a product
// has none.
type ListedCollection = DisplayCollection & { id: string; name: string }
export type PageListing = { files?: DisplayFile[], collections?: ListedCollection[], products?: DisplayProduct[] }

type Registry = { add: (source: Ref<PageListing>) => void }
const key = Symbol('page-listings') as InjectionKey<Registry>

// A page decides for itself what it lists: a block can point at another
// collection, or at collections chosen by hand, so what is on screen is not
// what the collection being browsed holds. The renderers announce what they
// draw, and the display preferences describe that rather than guessing.
export function providePageListings() {
	const entries = ref<{ id: number, files: DisplayFile[], collections: ListedCollection[], products: DisplayProduct[] }[]>([])
	let nextId = 0

	provide(key, {
		add(source) {
			const id = nextId++
			entries.value.push({ id, files: [], collections: [], products: [] })
			const stop = watch(source, listing => {
				const entry = entries.value.find(item => item.id === id)
				if (!entry) return
				entry.files = listing.files ?? []
				entry.collections = listing.collections ?? []
				entry.products = listing.products ?? []
			}, { immediate: true })
			// Runs in the registering component's scope, so a block that goes
			// away takes its listing with it.
			onScopeDispose(() => {
				stop()
				entries.value = entries.value.filter(item => item.id !== id)
			})
		},
	})

	return {
		files: computed(() => entries.value.flatMap(entry => entry.files)),
		collections: computed(() => entries.value.flatMap(entry => entry.collections)),
		products: computed(() => entries.value.flatMap(entry => entry.products)),
	}
}

// Nothing is registered outside a page or a collection, where no one is asking.
export function registerPageListing(source: Ref<PageListing>) {
	inject(key, null)?.add(source)
}
