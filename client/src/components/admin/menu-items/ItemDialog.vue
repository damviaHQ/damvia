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
import FieldGroup from "@/components/ui/field/FieldGroup.vue"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { RouterOutput, trpc } from "@/services/server.ts"
import { useQuery, useQueryClient } from "@tanstack/vue-query"
import { Dialog as DialogRoot, DialogContent, DialogDescription, DialogTitle, DialogTrigger, DialogHeader, DialogFooter } from '@/components/ui/dialog'
import { computed, ref, useId, watch } from "vue"
import Treeselect from "vue3-treeselect-ts"

type MenuItem = RouterOutput["menuItem"]["list"]
type Collection = RouterOutput["collection"]["tree"][number]

const props = defineProps<{ parent?: MenuItem; item?: MenuItem }>()
const emit = defineEmits<{
  "update:open": [boolean]
}>()
const queryClient = useQueryClient()
const fieldId = useId()
const isDialogOpen = ref(false)
const form = ref<{
  id?: string
  parentId?: string | null
  collectionId?: string | null
  pageId?: string | null
  type: string
  data: {
    spacingTop?: number[]
    spacingBottom?: number[]
    sync?: boolean
    border?: boolean
    text?: string
    url?: string
    external?: boolean
  }
}>(initialFormValues())
const error = ref<string>('')
const { data: collections } = useQuery({
  queryKey: ["collection", "treeAdmin"],
  queryFn: () => trpc.collection.treeAdmin.query(),
})
const { data: pages } = useQuery({
  queryKey: ["pages"],
  queryFn: () => trpc.page.list.query(),
})

const pageOptions = computed(() =>
  (pages.value ?? []).map((page) => ({
    id: page.id,
    label: page.name,
  }))
)
const subCollections = computed(() => {
  if (!collections.value) {
    return []
  }

  const path = props.parent?.collectionPath
  const root = path
    ? path.reduce((collections: Collection[], id: string) => {
      return collections?.find((c: Collection) => c.id === id)?.children
    }, collections.value)
    : collections.value
  const mapCollection = (collection: Collection | Collection) => ({
    id: collection.id,
    label: collection.name,
    children: collection.children?.length
      ? collection.children.map(mapCollection)
      : undefined,
  })
  return root ? root.map(mapCollection) : []
})

watch([() => props, isDialogOpen], () => {
  form.value = initialFormValues()
})

function initialFormValues() {
  if (props.item) {
    const data = JSON.parse(JSON.stringify(props.item.data)) ?? {}
    return {
      id: props.item.id,
      type: props.item.type,
      data: {
        ...data,
        spacingTop: data.spacingTop ? [data.spacingTop] : [0],
        spacingBottom: data.spacingBottom ? [data.spacingBottom] : [0],
      },
      collectionId: props.item.collectionId,
    }
  }

  return {
    type: "text",
    parentId: props.parent?.id ?? null,
    data: {
      // Add default values in an array or the shadcn slider will throw an error
      spacingTop: [0],
      spacingBottom: [0],
    },
  }
}

function handleSliderChange(key: "spacingTop" | "spacingBottom", value: number[]) {
  form.value.data[key] = value
}

async function submitChanges() {
  error.value = ''
  if (form.value.type === 'page' && !form.value.pageId) {
    error.value = 'Page is required.'
    return
  }

  if (props.item) {
    await trpc.menuItem.update.mutate(form.value as any)
  } else {
    await trpc.menuItem.create.mutate(form.value as any)
  }
  await queryClient.invalidateQueries({ queryKey: ["menu-items"] })
  isDialogOpen.value = false
  emit("update:open", false)
}
const saving = ref(false)
async function handleSubmit() {
  if (saving.value) return
  saving.value = true
  try { await submitChanges() } catch (cause) { error.value = (cause as Error).message } finally { saving.value = false }
}
</script>

<template>
  <dialog-root ref="dialog" v-model:open="isDialogOpen" @update:open="$emit('update:open', $event)">
    <dialog-trigger as-child>
      <slot />
    </dialog-trigger>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>
          {{ item ? "Edit item" : "Add item to menu" }}
        </DialogTitle>
        <DialogDescription class="text-sm admin-text-secondary mb-4">
          Choose a collection, page, link or divider for your navigation.
        </DialogDescription>

      </DialogHeader>
        <form @submit.prevent="handleSubmit" class="flex flex-col gap-3">
          <div v-if="error" role="alert" class="admin-form-error">
            {{ error }}
          </div>
          <FieldGroup class="form-field">
            <Label class="form" for="type">Type</Label>
            <Select v-model="form.type" :disabled="!!item">
              <SelectTrigger id="type" class="w-full">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="collection">Collection</SelectItem>
                <SelectItem value="text">Text/Link</SelectItem>
                <SelectItem value="divider">Divider</SelectItem>
                <SelectItem value="page">Page</SelectItem>
              </SelectContent>
            </Select>
          </FieldGroup>
          <template v-if="form.type === 'collection'">
            <div class="form-field" role="group" :aria-labelledby="`${fieldId}-collection`">
              <label class="form" :id="`${fieldId}-collection`">Collection</label>
              <treeselect v-model="form.collectionId" class="mb-075" placeholder="Choose an existing collection"
                :options="subCollections" :disabled="!!item" />
            </div>
            <div class="form-field flex items-center space-x-2">
              <Checkbox v-model="form.data.sync" :disabled="!!item" id="sync" />
              <Label for="sync"
                class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                Display and synchronize all sub-collections in the menu
              </Label>
            </div>
          </template>
          <template v-if="form.type === 'page'">
            <FieldGroup class="form-field" role="group" :aria-labelledby="`${fieldId}-page`">
              <Label class="form" :id="`${fieldId}-page`">Page</Label>
              <treeselect v-model="form.pageId" class="mb-075" placeholder="Page" :options="pageOptions"
                :disabled="!!item" />
            </FieldGroup>
          </template>
          <div v-else-if="form.type === 'divider'" class="flex flex-col gap-6">
            <div class="form-field">
              <Checkbox v-model="form.data.border" id="border" />
              <Label for="border"
                class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                Show a divider line
              </Label>
            </div>
            <div class="form-field flex flex-col gap-2">
              <Label class="form" :id="`${fieldId}-spacing-top`">Spacing top</Label>
              <Slider :model-value="form.data.spacingTop" :thumb-labelledby="`${fieldId}-spacing-top`"
                @update:model-value="(value) => handleSliderChange('spacingTop', value)" :max="100" :step="5"
                class="w-full my-2" />
              <div class="form-field-description">
                {{ form.data.spacingTop?.[0] ? `${form.data.spacingTop[0]}px` : "0px" }}
              </div>
            </div>
            <div class="form-field  flex flex-col gap-2">
              <Label class="form" :id="`${fieldId}-spacing-bottom`">Spacing bottom</Label>
              <Slider :model-value="form.data.spacingBottom" :thumb-labelledby="`${fieldId}-spacing-bottom`" @update:model-value="(value) => handleSliderChange('spacingBottom', value)
                " :max="100" :step="5" class="w-full my-2" />
              <div class="form-field-description">
                {{
                  form.data.spacingBottom?.[0] ? `${form.data.spacingBottom[0]}px` : "0px"
                }}
              </div>
            </div>
          </div>
          <template v-if="form.type === 'text'">
            <FieldGroup >
              <Label class="form" for="text">Text</Label>
              <Input id="text" v-model="form.data.text" type="text" />
            </FieldGroup>
            <FieldGroup class="form-field">
              <Label class="form" for="url">URL (optional)</Label>
              <Input id="url" v-model="form.data.url" type="url" />
            </FieldGroup>
            <div v-if="form.data.url" class="form-field flex items-center space-x-2">
              <Checkbox v-model="form.data.external" id="external" />
              <Label for="external"
                class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                Open in new tab
              </Label>
            </div>
          </template>
          <DialogFooter><Button type="button" variant="outline" :disabled="saving" @click="isDialogOpen = false">Cancel</Button><Button type="submit" :disabled="saving">{{ saving ? 'Saving…' : 'Save menu item' }}</Button></DialogFooter>
        </form>
    </DialogContent>
  </dialog-root>
</template>

<style scoped>
.form-field { display:flex; flex-direction:column; gap:8px; }
.form-field.space-x-2 { flex-direction:row; }
</style>
