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
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { RouterOutput, trpc } from "@/services/server"
import { useQuery, useQueryClient } from "@tanstack/vue-query"
import { computed, ref, useId, watch } from "vue"

type MenuItem = RouterOutput["menuItem"]["list"][number]
const props = defineProps<{ open: boolean; item: MenuItem }>()
const emit = defineEmits<{ "update:open": [boolean] }>()
const fieldId = useId()
const queryClient = useQueryClient()
const destination = ref("root")
const error = ref("")
const saving = ref(false)
const { data: items, isPending, isError } = useQuery({
  queryKey: ["menu-items"],
  queryFn: () => trpc.menuItem.list.query(),
})
watch(() => props.open, () => {
  destination.value = props.item.parentId ?? "root"
  error.value = ""
}, { immediate: true })
const destinations = computed(() => {
  const options: { id: string; label: string }[] = []
  function visit(nodes: MenuItem[], path: string[] = []) {
    for (const node of nodes) {
      if (node.id === props.item.id) continue
      const label = node.collectionName || node.pageName || node.data?.label || node.data?.text || "Divider"
      const parts = [...path, label]
      if (["section", "collection"].includes(node.type)) options.push({ id: node.id, label: parts.join(" / ") })
      if (node.children) visit(node.children, parts)
    }
  }
  visit(items.value ?? [])
  return options
})
async function submit() {
  if (saving.value) return
  saving.value = true
  error.value = ""
  try {
    await trpc.menuItem.move.mutate({ id: props.item.id, parentId: destination.value === "root" ? null : destination.value })
    await queryClient.invalidateQueries({ queryKey: ["menu-items"] })
    emit("update:open", false)
  } catch (cause) {
    error.value = (cause as Error).message
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Move menu item</DialogTitle>
        <DialogDescription v-if="item.followsCollectionParent">
          This entry automatically follows its parent collection. To change that relationship, move the collection in Collection settings, or make it private to hide it. To show another link elsewhere, use Add menu item.
        </DialogDescription>
        <DialogDescription v-else>
          Move this link and its menu children. Collections and their access rules stay unchanged.
        </DialogDescription>
      </DialogHeader>
      <form v-if="!item.followsCollectionParent" class="grid gap-4" @submit.prevent="submit">
        <p v-if="error || isError" role="alert" class="admin-form-error">{{ error || 'Could not load menu destinations.' }}</p>
        <Label :for="fieldId">Menu location</Label>
        <Select v-model="destination" :disabled="isPending || saving">
          <SelectTrigger :id="fieldId"><SelectValue placeholder="Choose a location" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="root">Top level</SelectItem>
            <SelectItem v-for="option in destinations" :key="option.id" :value="option.id">{{ option.label }}</SelectItem>
          </SelectContent>
        </Select>
        <DialogFooter>
          <Button type="button" variant="outline" @click="emit('update:open', false)">Cancel</Button>
          <Button type="submit" :disabled="saving || isPending || isError || destination === (item.parentId ?? 'root')">{{ saving ? 'Moving…' : 'Move' }}</Button>
        </DialogFooter>
      </form>
      <DialogFooter v-else>
        <Button type="button" variant="outline" @click="emit('update:open', false)">Close</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
