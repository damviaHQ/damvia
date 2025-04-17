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
import CollectionDialogCreate from "@/components/collection/CollectionDialogCreate.vue"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useGlobalToast } from "@/composables/useGlobalToast"
import { RouterOutput, trpc } from "@/services/server.ts"
import { useGlobalStore } from "@/stores/globalStore"
import { useQuery, useQueryClient } from "@tanstack/vue-query"
import { ChevronDown, ChevronRight, CirclePlus, Folder, Loader2Icon } from "lucide-vue-next"
import { TreeItem, TreeRoot } from 'radix-vue'
import {computed, ref} from "vue"
import {Tabs, TabsContent, TabsList, TabsTrigger} from "@/components/ui/tabs";

const queryClient = useQueryClient()
const toast = useGlobalToast()
const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{
  (e: "update:modelValue", isOpen: boolean): void
}>()

const globalStore = useGlobalStore()
const isCollectionModalOpen = ref(false)
const selectedCollection = ref<RouterOutput["collection"]["tree"][number] | null>(null)

const { status, data: privateCollections } = useQuery({
  queryKey: ["collection", "ListPrivateCollections"],
  queryFn: () => trpc.collection.ListPrivateCollections.query(),
})

const { data: publicCollections } = useQuery({
  queryKey: ['collection', 'treeAdmin', 'public'],
  queryFn: () => trpc.collection.treeAdmin.query(),
})

const usablePublicCollections = computed(() => (publicCollections.value ?? []).filter(
  (collection: RouterOutput['collection']['findById']) => !collection.synchronized,
))

function handleSelect(collection: RouterOutput["collection"]["tree"][number]) {
  selectedCollection.value = collection
}

function openCreateCollection() {
  isCollectionModalOpen.value = true
}

const isLoading = ref(false)

async function addToCollection() {
  if (!selectedCollection.value || isLoading.value) {
    return
  }

  isLoading.value = true
  try {
    await trpc.collection.addItems.mutate({
      id: selectedCollection.value.id,
      items: globalStore.selection,
    })

    queryClient.invalidateQueries({ queryKey: ["collection", "tree"] })
    queryClient.invalidateQueries({ queryKey: ["collection", "ListPrivateCollections"] })
    emit("update:modelValue", false)
    toast.success("Items added to collection")
  } catch (error) {
    console.error("Error adding items to collection:", error)
    toast.error("Failed to add items to collection")
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <Dialog :open="props.modelValue" @update:open="emit('update:modelValue', $event)">
    <DialogContent class="sm:max-w-[500px]">
      <DialogHeader>
        <DialogTitle>Add selection to a collection</DialogTitle>
        <DialogDescription>
          Choose one of your collections to add your selected items or create a new one.
        </DialogDescription>
      </DialogHeader>
      <Tabs default-value="private">
        <div class="mt-4">
          <div class="flex justify-between items-center mb-2">
            <TabsList>
              <TabsTrigger value="private">
                Your Collections
              </TabsTrigger>
              <TabsTrigger v-if="globalStore.user?.role === 'admin'" value="public">
                Public Collections
              </TabsTrigger>
            </TabsList>
            <Button variant="ghost" @click="openCreateCollection">
              Create new
              <CirclePlus class="h-4 w-4 ml-2" />
            </Button>
          </div>
          <TabsContent value="private">
            <ScrollArea class="min-h-[200px] max-h-[400px] w-full rounded-md border">
              <div class="p-4">
                <div v-if="!privateCollections || privateCollections.length === 0" class="text-sm text-muted-foreground">
                  No collections found. Create your first collection to get started.
                </div>
                <TreeRoot
                  v-else
                  v-slot="{ flattenItems }"
                  :items="privateCollections"
                  :get-key="(item) => item.id"
                  :get-children="(item) => item.children"
                >
                  <TreeItem
                    v-for="item in flattenItems" :key="item._id" v-slot="{ isExpanded }"
                    :style="{ paddingLeft: `${item.level * 16}px` }" v-bind="item.bind"
                    class="flex items-center py-2 hover:bg-neutral-100 rounded cursor-pointer"
                    :class="{ 'bg-neutral-100': selectedCollection?.id === item.value.id }"
                    @click="handleSelect(item.value)"
                  >
                    <template v-if="item.value.children && item.value.children.length > 0">
                      <ChevronDown v-if="isExpanded" class="h-4 w-4 mr-2" />
                      <ChevronRight v-else class="h-4 w-4 mr-2" />
                    </template>
                    <div v-else class="w-4 h-4 mr-2"></div>
                    <Folder class="h-5 w-5 mr-2 text-neutral-600" />
                    <span class="flex-grow text-sm">{{ item.value.name }}</span>
                  </TreeItem>
                </TreeRoot>
              </div>
            </ScrollArea>
          </TabsContent>
          <TabsContent value="public">
            <ScrollArea class="min-h-[200px] max-h-[400px] w-full rounded-md border">
              <div class="p-4">
                <div v-if="!usablePublicCollections?.length" class="text-sm text-muted-foreground">
                  No collections found. Create your first collection to get started.
                </div>
                <TreeRoot
                  v-else
                  v-slot="{ flattenItems }"
                  :items="usablePublicCollections"
                  :get-key="(item) => item.id"
                  :get-children="(item) => item.children"
                >
                  <TreeItem
                    v-for="item in flattenItems"
                    :key="item._id"
                    v-slot="{ isExpanded }"
                    :style="{ paddingLeft: `${item.level * 16}px` }"
                    v-bind="item.bind"
                    class="flex items-center py-2 hover:bg-neutral-100 rounded cursor-pointer"
                    :class="{ 'bg-neutral-100': selectedCollection?.id === item.value.id }"
                    @click="handleSelect(item.value)"
                  >
                    <template v-if="item.value.children && item.value.children.length > 0">
                      <ChevronDown v-if="isExpanded" class="h-4 w-4 mr-2" />
                      <ChevronRight v-else class="h-4 w-4 mr-2" />
                    </template>
                    <div v-else class="w-4 h-4 mr-2" />
                    <Folder class="h-5 w-5 mr-2 text-neutral-600" />
                    <span class="flex-grow text-sm">
                      {{ item.value.name }}
                    </span>
                  </TreeItem>
                </TreeRoot>
              </div>
            </ScrollArea>
          </TabsContent>
        </div>
      </Tabs>
      <DialogFooter class="mt-4">
        <Button variant="link" @click="emit('update:modelValue', false)">Cancel</Button>
        <Button @click="addToCollection" :disabled="!selectedCollection || isLoading">
          Add to {{ selectedCollection ? selectedCollection.name : 'Collection' }}
          <Loader2Icon v-if="isLoading" class="h-4 w-4 animate-spin ml-2" />
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
  <CollectionDialogCreate v-model="isCollectionModalOpen" />
</template>
