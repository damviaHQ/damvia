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
import {
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
  DialogTrigger,
} from "radix-vue"
import { computed, ref, watch } from "vue"
import Treeselect from "vue3-treeselect-ts"

type MenuItem = RouterOutput["menuItem"]["list"]
type Collection = RouterOutput["collection"]["tree"][number]

const props = defineProps<{ parent?: MenuItem; item?: MenuItem }>()
const emit = defineEmits<{
  "update:open": [boolean]
}>()
const queryClient = useQueryClient()
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

async function handleSubmit() {
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
</script>

<template>
  <dialog-root ref="dialog" v-model:open="isDialogOpen" @update:open="$emit('update:open', $event)">
    <dialog-trigger as-child>
      <slot />
    </dialog-trigger>
    <dialog-portal>
      <dialog-overlay class="item-dialog__overlay" />
      <dialog-content class="item-dialog__content">
        <DialogTitle>
          {{ item ? "Edit item" : "Add item to menu" }}
        </DialogTitle>
        <DialogDescription class="text-sm text-neutral-400 mb-4">
          You can add an existing collection, a page, a custom text or a divider to the menu from the selector
          below, then fill in the relevant fields.
        </DialogDescription>

        <form @submit.prevent="handleSubmit" class="flex flex-col gap-3">
          <div v-if="error" class="bg-red-100 text-red-600 p-4 text-sm">
            {{ error }}
          </div>
          <div class="form-field">
            <Label class="form" for="type">Type</Label>
            <Select v-model="form.type" :disabled="!!item">
              <SelectTrigger class="w-full">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="collection">Collection</SelectItem>
                <SelectItem value="text">Text/Link</SelectItem>
                <SelectItem value="divider">Divider</SelectItem>
                <SelectItem value="page">Page</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <template v-if="form.type === 'collection'">
            <div class="form-field">
              <label class="form">Collection</label>
              <treeselect v-model="form.collectionId" class="mb-075" placeholder="Choose an existing collection"
                :options="subCollections" :disabled="!!item" />
            </div>
            <div class="form-field flex items-center space-x-2">
              <Checkbox v-model:checked="form.data.sync" :disabled="!!item" id="sync" />
              <Label for="sync"
                class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                Display and synchronize all sub-collections in the menu
              </Label>
            </div>
          </template>
          <template v-if="form.type === 'page'">
            <div class="form-field">
              <Label class="form">Page</Label>
              <treeselect v-model="form.pageId" class="mb-075" placeholder="Page" :options="pageOptions"
                :disabled="!!item" />
            </div>
          </template>
          <div v-else-if="form.type === 'divider'" class="flex flex-col gap-6">
            <div class="form-field">
              <Checkbox v-model:checked="form.data.border" id="border" />
              <Label for="border"
                class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                Show a divider line
              </Label>
            </div>
            <div class="form-field flex flex-col gap-2">
              <Label class="form">Spacing top</Label>
              <Slider :model-value="form.data.spacingTop"
                @update:model-value="(value) => handleSliderChange('spacingTop', value)" :max="100" :step="5"
                class="w-full my-2" />
              <div class="form-field-description">
                {{ form.data.spacingTop?.[0] ? `${form.data.spacingTop[0]}px` : "0px" }}
              </div>
            </div>
            <div class="form-field  flex flex-col gap-2">
              <Label class="form">Spacing bottom</Label>
              <Slider :model-value="form.data.spacingBottom" @update:model-value="(value) => handleSliderChange('spacingBottom', value)
                " :max="100" :step="5" class="w-full my-2" />
              <div class="form-field-description">
                {{
                  form.data.spacingBottom?.[0] ? `${form.data.spacingBottom[0]}px` : "0px"
                }}
              </div>
            </div>
          </div>
          <template v-if="form.type === 'text'">
            <div class="flex flex-col gap-2">
              <Label class="form" for="text">Text</Label>
              <Input id="text" v-model="form.data.text" type="text" />
            </div>
            <div class="form-field">
              <Label class="form" for="url">URL (optional)</Label>
              <Input id="url" v-model="form.data.url" type="url" />
            </div>
            <div v-if="form.data.url" class="form-field flex items-center space-x-2">
              <Checkbox v-model:checked="form.data.external" id="external" />
              <Label for="external"
                class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                Open in new tab
              </Label>
            </div>
          </template>
          <Button type="submit" class="mt-4">Save</Button>
        </form>
      </dialog-content>
    </dialog-portal>
  </dialog-root>
</template>

<style scoped>
label {
  @apply text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70;
}

.item-dialog__overlay {
  position: fixed;
  z-index: 1;
  background: rgba(0, 0, 0, 0.8);
  inset: 0;
}

.item-dialog__content {
  @apply flex flex-col gap-2 bg-neutral-50;
  position: fixed;
  z-index: 2;
  top: 50%;
  left: 50%;
  max-height: 85vh;
  width: 90vw;
  max-width: 450px;
  padding: 25px;
  transform: translate(-50%, -50%);
}
</style>
