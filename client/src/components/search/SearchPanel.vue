<!-- Damvia - Open Source Digital Asset Manager
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
along with this program. If not, see <https://www.gnu.org/licenses/>. -->
<script setup lang="ts">
import { menuIconClasses, menuIconSlotClasses, sidebarRowClasses, sidebarSectionTitleClasses } from "@/components/layout-main/navigationStyles"
import SearchFacetGroup, { type FacetOption } from "@/components/search/SearchFacetGroup.vue"
import SearchTermsEditor from "@/components/search/SearchTermsEditor.vue"
import { Button } from "@/components/ui/button"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { useGlobalToast } from "@/composables/useGlobalToast"
import { useSearchState } from "@/composables/useSearchState"
import { type SearchScope } from "@/utils/searchQuery"
import { trpc } from "@/services/server"
import { useQuery } from "@tanstack/vue-query"
import { ArrowLeft, Copy, Trash2 } from "@lucide/vue"
import { computed } from "vue"

const { form, terms, hasQuery, filters, setTerms, setExactMatch, setScope, toggleValue, clearFilters } = useSearchState()
const toast = useGlobalToast()

const { data: assetTypes } = useQuery({ queryKey: ["asset-types"], queryFn: () => trpc.assetType.list.query() })
const { data: productViews } = useQuery({ queryKey: ["product-views"], queryFn: () => trpc.asset.listProductViews.query() })
const { data: productFacets } = useQuery({ queryKey: ["products", "attributes", "facets"], queryFn: () => trpc.productAttribute.listFacets.query() })
const { data: collection } = useQuery({
  enabled: computed(() => !!form.value.collectionId),
  queryKey: computed(() => ["collection", form.value.collectionId]),
  queryFn: () => trpc.collection.findById.query(form.value.collectionId!),
})
// Same key as the results view, so the counts come from the one request.
const { data: search } = useQuery({
  queryKey: computed(() => ["search", form.value]),
  queryFn: () => trpc.collection.search.query(form.value),
})
const notFoundInput = computed(() => ({
  query: terms.value,
  collectionId: form.value.collectionId,
  assetTypes: form.value.assetTypes,
  productViews: form.value.productViews,
  fileTypes: form.value.fileTypes,
  searchScope: form.value.searchScope,
}))
const { data: notFound } = useQuery({
  enabled: computed(() => !form.value.exactMatch && terms.value.length > 0),
  queryKey: computed(() => ["search-not-found", notFoundInput.value]),
  queryFn: () => trpc.collection.searchNotFound.query(notFoundInput.value),
})
const missing = computed(() => (form.value.exactMatch ? [] : notFound.value ?? []))

const facets = computed(() => search.value?.facets ?? { assetTypes: {}, fileTypes: {}, productViews: {}, attributes: {} })
const collectionName = computed(() => collection.value?.name ?? "this collection")

const assetTypeOptions = computed<FacetOption[]>(() =>
  (assetTypes.value ?? [])
    .map((assetType: any) => ({ id: assetType.id, label: assetType.name, count: facets.value.assetTypes[assetType.id] ?? 0 }))
    .sort((a, b) => a.label.localeCompare(b.label))
)
const productViewOptions = computed<FacetOption[]>(() =>
  (productViews.value ?? [])
    .map((view: string) => ({ id: view, label: view, count: facets.value.productViews[view] ?? 0 }))
    .sort((a, b) => a.label.localeCompare(b.label))
)
const attributeGroups = computed(() =>
  (productFacets.value ?? []).map((facet: any) => {
    const counts = facets.value.attributes[facet.id] ?? {}
    const values = new Set<string>([...facet.values, ...(form.value.attributes[facet.id] ?? [])])
    return {
      id: facet.id as string,
      title: (facet.displayName || facet.name) as string,
      options: Array.from(values)
        .map((value) => ({ id: value, label: value, count: counts[value] ?? 0 }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    }
  })
)

const backTarget = computed(() =>
  form.value.collectionId ? { name: "collection", params: { id: form.value.collectionId } } : { name: "home" }
)

function escapeHtml(value: string) {
  return value.replace(/[&<>]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[character] as string))
}

// Last resort when the page is not served over HTTPS and the clipboard API is missing.
function copyWithSelection(text: string) {
  const area = document.createElement("textarea")
  area.value = text
  area.setAttribute("readonly", "")
  area.style.position = "fixed"
  area.style.opacity = "0"
  document.body.appendChild(area)
  area.select()
  const copied = document.execCommand("copy")
  document.body.removeChild(area)
  if (!copied) {
    throw new Error("copy rejected")
  }
}

// One reference per line, plus a single-column table, so a spreadsheet pastes it as a column.
async function copyMissing() {
  const rows = missing.value
  const text = rows.join("\r\n")
  const html = `<table>${rows.map((row) => `<tr><td>${escapeHtml(row)}</td></tr>`).join("")}</table>`
  try {
    if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
      await navigator.clipboard.write([new ClipboardItem({
        "text/plain": new Blob([text], { type: "text/plain" }),
        "text/html": new Blob([html], { type: "text/html" }),
      })])
    } else if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
    } else {
      copyWithSelection(text)
    }
    toast.success(`${rows.length} ${rows.length === 1 ? "reference" : "references"} copied, one per line`)
  } catch (_) {
    toast.error("Could not copy to the clipboard")
  }
}

function removeMissing() {
  setTerms(terms.value.filter((term) => !missing.value.includes(term)))
}
</script>

<template>
  <div class="flex min-h-full min-w-0 flex-col gap-2" data-search-panel>
    <router-link :to="backTarget" :class="sidebarRowClasses" class="-mx-0">
      <span :class="menuIconSlotClasses"><ArrowLeft :class="menuIconClasses" aria-hidden="true" /></span>
      <span>{{ form.collectionId ? `Back to ${collectionName}` : "Back to Library" }}</span>
    </router-link>

    <section aria-labelledby="search-terms-title" class="flex min-w-0 flex-col gap-1.5">
      <div class="flex h-8 items-center justify-between">
        <label id="search-terms-title" for="search-panel-terms" :class="sidebarSectionTitleClasses">Search terms</label>
        <Button v-if="hasQuery" type="button" variant="ghost" class="h-7 px-2 text-caption text-neutral-600 hover:text-red-600" @click="setTerms([])">Clear</Button>
      </div>
      <SearchTermsEditor class="mx-3" :model-value="terms" :exact-match="form.exactMatch" :not-found="missing" @update:model-value="setTerms" />
      <RadioGroup :model-value="form.exactMatch ? 'exact' : 'any'" aria-label="How the words are matched" class="flex flex-wrap gap-x-4 gap-y-0.5 px-3 pb-1" @update:model-value="setExactMatch($event === 'exact')">
        <label class="flex cursor-pointer items-center gap-2 text-body text-neutral-700"><RadioGroupItem id="search-mode-any" value="any" /> Any of the words</label>
        <label class="flex cursor-pointer items-center gap-2 text-body text-neutral-700"><RadioGroupItem id="search-mode-exact" value="exact" /> Exact phrase</label>
      </RadioGroup>
      <div v-if="missing.length" role="status" class="mx-3 grid gap-1 border border-[var(--dv-color-warning)]/30 bg-[var(--dv-color-warning-soft)] px-3 py-1.5 text-body text-[var(--dv-color-warning)]">
        <p><strong class="font-semibold">{{ missing.length }} of {{ terms.length }}</strong> not found: <span class="break-words">{{ missing.join(", ") }}</span></p>
        <div class="flex flex-wrap gap-3">
          <button type="button" class="flex cursor-pointer items-center gap-1 text-caption font-medium underline-offset-2 hover:underline" title="One per line, ready to paste into a spreadsheet column" @click="copyMissing"><Copy class="size-3.5" aria-hidden="true" /> Copy the list</button>
          <button type="button" class="flex cursor-pointer items-center gap-1 text-caption font-medium underline-offset-2 hover:underline" @click="removeMissing"><Trash2 class="size-3.5" aria-hidden="true" /> Remove them</button>
        </div>
      </div>
    </section>

    <section v-if="form.collectionId" aria-labelledby="search-where-title" class="flex min-w-0 flex-col gap-1 border-t border-neutral-200 pt-1 pb-1">
      <h2 id="search-where-title" :class="sidebarSectionTitleClasses" class="flex h-8 items-center">Where</h2>
      <RadioGroup :model-value="form.searchScope" class="flex min-w-0 flex-col" @update:model-value="setScope($event as SearchScope)">
        <label class="flex h-7 w-full min-w-0 cursor-pointer items-center gap-2 px-3 text-body text-neutral-800 hover:bg-neutral-200/60"><RadioGroupItem class="shrink-0" id="search-scope-all" value="all" /> Everywhere</label>
        <label class="flex h-7 w-full min-w-0 cursor-pointer items-center gap-2 px-3 text-body text-neutral-800 hover:bg-neutral-200/60"><RadioGroupItem class="shrink-0" id="search-scope-sub" value="current_with_sub" /> <span class="min-w-0 flex-1 truncate">{{ collectionName }} and its sub-collections</span></label>
        <label class="flex h-7 w-full min-w-0 cursor-pointer items-center gap-2 px-3 text-body text-neutral-800 hover:bg-neutral-200/60"><RadioGroupItem class="shrink-0" id="search-scope-current" value="current" /> <span class="min-w-0 flex-1 truncate">{{ collectionName }} only</span></label>
      </RadioGroup>
    </section>

    <SearchFacetGroup id="search-asset-types" title="Asset type" :options="assetTypeOptions" :selected="form.assetTypes" empty-text="No asset type configured" @toggle="toggleValue('asset_types', $event)" />
    <SearchFacetGroup v-if="productViewOptions.length" id="search-product-views" title="Product view" :options="productViewOptions" :selected="form.productViews" :open="form.productViews.length > 0" @toggle="toggleValue('product_views', $event)" />
    <SearchFacetGroup v-for="group in attributeGroups" :id="`search-facet-${group.id}`" :key="group.id" :title="group.title" :options="group.options" :selected="form.attributes[group.id] ?? []" :open="(form.attributes[group.id]?.length ?? 0) > 0 || attributeGroups.length <= 3" @toggle="toggleValue(`attributes[${group.id}]`, $event)" />

    <div v-if="filters.length" class="sticky bottom-0 -mx-3 -mb-5 mt-auto border-t border-neutral-200 bg-neutral-50 p-2">
      <Button type="button" variant="outline" class="w-full" @click="clearFilters">Clear all filters ({{ filters.length }})</Button>
    </div>
  </div>
</template>
