<!-- Damvia - Open Source Digital Asset Manager
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
along with this program.  If not, see <https://www.gnu.org/licenses/>. -->
<script setup lang="ts">
import { computed, ref, watch } from "vue"
import { useQuery, useQueryClient } from "@tanstack/vue-query"
import { DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from "reka-ui"
import { Folder, Plus, X } from "@lucide/vue"
import { Button } from "@/components/ui/button"
import { useGlobalToast } from "@/composables/useGlobalToast"
import { trpc } from "@/services/server"
import type { SelectionItem } from "@/stores/globalStore"

const props = defineProps<{ items: SelectionItem[] }>()
const open = defineModel<boolean>("open", { default: false })
const emit = defineEmits<{ done: [] }>()
const toast = useGlobalToast()
const queryClient = useQueryClient()
const creating = ref(false)
const name = ref("")
const busy = ref(false)

const { data: collections, refetch } = useQuery({
  enabled: open,
  queryKey: ["collection", "private"],
  queryFn: () => trpc.collection.ListPrivateCollections.query(),
})
watch(open, (value) => { if (value) { creating.value = false; name.value = ""; refetch() } })
const sorted = computed(() => [...(collections.value ?? [])].sort((a, b) => a.name.localeCompare(b.name)))

async function addTo(id: string, label: string) {
  busy.value = true
  try {
    await trpc.collection.addItems.mutate({ id, items: props.items })
    await queryClient.invalidateQueries({ queryKey: ["collection"] })
    toast.success(`Added to ${label}`)
    open.value = false
    emit("done")
  } catch (error) {
    toast.error((error as Error).message)
  } finally {
    busy.value = false
  }
}
async function createAndAdd() {
  if (!name.value.trim()) return
  busy.value = true
  try {
    const created = await trpc.collection.createUserCollection.mutate({ name: name.value.trim() })
    busy.value = false
    await addTo(created.id, created.name)
  } catch (error) {
    toast.error((error as Error).message)
    busy.value = false
  }
}
</script>

<template>
  <DialogRoot v-model:open="open">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-50 bg-black/40" />
      <DialogContent class="fixed inset-x-0 bottom-0 z-50 grid max-h-[85dvh] grid-rows-[auto_1fr_auto] rounded-t-[var(--dv-radius-xl)] bg-[var(--dv-surface-panel)] text-base dv-theme dv-neutral dv-client">
        <header class="flex items-center gap-2 border-b border-[var(--dv-color-line)] px-4 py-3">
          <DialogTitle class="flex-1 text-[17px] font-semibold">Add to collection</DialogTitle>
          <button type="button" class="-mr-3 grid size-11 place-items-center" aria-label="Close" @click="open = false"><X :size="22" aria-hidden="true" /></button>
        </header>
        <DialogDescription class="sr-only">Choose one of your collections or create a new one.</DialogDescription>
        <ul class="m-0 list-none overflow-y-auto p-0">
          <li v-for="collection in sorted" :key="collection.id">
            <button type="button" class="flex min-h-[52px] w-full items-center gap-3 border-0 border-b border-[var(--dv-color-line)] bg-transparent px-4 text-left" :disabled="busy" @click="addTo(collection.id, collection.name)">
              <Folder :size="20" aria-hidden="true" /><span class="truncate">{{ collection.name }}</span>
            </button>
          </li>
          <li v-if="!sorted.length" class="px-4 py-6 text-center text-[var(--dv-text-secondary)]">You have no collections yet.</li>
        </ul>
        <footer class="grid gap-2 border-t border-[var(--dv-color-line)] px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]">
          <form v-if="creating" class="flex gap-2" @submit.prevent="createAndAdd">
            <label class="sr-only" for="mobile-new-collection">Collection name</label>
            <input id="mobile-new-collection" v-model="name" maxlength="80" autocomplete="off" placeholder="Collection name" class="min-h-11 flex-1 rounded-[var(--dv-radius-field)] border border-[var(--dv-color-line-strong)] px-3 text-base" />
            <Button type="submit" class="min-h-11" :disabled="busy || !name.trim()">Create</Button>
          </form>
          <Button v-else type="button" variant="outline" class="min-h-12" @click="creating = true"><Plus :size="18" aria-hidden="true" />New collection</Button>
        </footer>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
