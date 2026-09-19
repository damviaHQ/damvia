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
import {
  activeFilters,
  clearFilterQuery,
  parseQueryParts,
  parseSearchQuery,
  patchSearchQuery,
  toggleQueryValue,
  type QueryPatch,
  type SearchSort,
} from "@/utils/searchQuery"
import { computed } from "vue"
import { useRoute, useRouter } from "vue-router"

// The URL is the only search state: every change is a route push and the results refetch from it.
export function useSearchState() {
  const route = useRoute()
  const router = useRouter()

  const form = computed(() => parseSearchQuery(route.query, "all"))
  const terms = computed(() => {
    if (form.value.exactMatch) {
      const phrase = form.value.query?.trim()
      return phrase ? [phrase] : []
    }
    return parseQueryParts(form.value.query)
  })
  const hasQuery = computed(() => terms.value.length > 0)
  const filters = computed(() => activeFilters(form.value))
  const isScoped = computed(() => !!form.value.collectionId && form.value.searchScope !== "all")

  function push(patch: QueryPatch) {
    router.push({ name: "search", query: patchSearchQuery(route.query, patch) })
  }

  return {
    form,
    terms,
    hasQuery,
    filters,
    isScoped,
    setTerms: (values: string[]) => push({ q: values.join(" ") }),
    setExactMatch: (exactMatch: boolean) => push({ exact_match: exactMatch ? "true" : undefined }),
    setScope: (searchScope: string) => push({ search_scope: searchScope }),
    setSort: (sort: SearchSort | undefined) => push({ sort }),
    setValues: (key: string, values: string[]) => push({ [key]: values }),
    toggleValue: (key: string, value: string) =>
      router.push({ name: "search", query: toggleQueryValue(route.query, key, value) }),
    clearFilters: () => router.push({ name: "search", query: clearFilterQuery(route.query) }),
    setPage: (page: number) =>
      router.push({ name: "search", query: { ...route.query, page: page > 1 ? String(page) : undefined } }),
  }
}
