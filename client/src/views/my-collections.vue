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
import CollectionRender from "@/components/collection/CollectionRender.vue"
import DisplayPreferences from "@/components/DisplayPreferences.vue"
import CollectionDialogCreate from "@/components/collection/CollectionDialogCreate.vue"
import Loader from "@/components/Loader.vue"
import { Button } from "@/components/ui/button"
import { useMyCollections } from "@/composables/useMyCollections"
import { Plus } from "@lucide/vue"
import { ref } from "vue"
import { useRouter } from "vue-router"

const router = useRouter()
const { myCollections, status, refetch } = useMyCollections()
const isCreateOpen = ref(false)
</script>

<template>
  <div>
    <div class="mb-6 flex min-h-10 flex-wrap items-center justify-between gap-4">
      <h1 class="text-body font-semibold leading-5 tracking-normal">My collections</h1>
      <div v-if="myCollections.length" class="flex items-center gap-1">
        <DisplayPreferences :collections="myCollections" />
        <Button @click="isCreateOpen = true">
          <Plus aria-hidden="true" /> Create collection
        </Button>
      </div>
    </div>
    <Loader v-if="status === 'pending'" :text="true" />
    <div v-else-if="status === 'error'" role="alert" class="grid justify-items-center gap-3 py-20 text-center">
      <h2>Couldn’t load your collections</h2>
      <p class="max-w-sm text-body text-muted-foreground">Please try again.</p>
      <Button variant="outline" @click="refetch()">Try again</Button>
    </div>
    <div v-else-if="!myCollections.length" class="grid justify-items-center gap-3 py-20 text-center">
      <h2>No collections yet</h2>
      <p class="max-w-sm text-body text-muted-foreground">Create your first collection to keep the assets you need together.</p>
      <Button @click="isCreateOpen = true"><Plus aria-hidden="true" /> Create your first collection</Button>
    </div>
    <CollectionRender v-else :collections="myCollections"
      :generate-route="collection => ({ name: 'collection', params: { id: collection.id } })" />
    <CollectionDialogCreate v-model="isCreateOpen"
      @created="router.push({ name: 'collection', params: { id: $event.id } })" />
  </div>
</template>
