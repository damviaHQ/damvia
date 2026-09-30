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
import RecordTargetPicker, { type RecordTarget } from "@/components/admin/RecordTargetPicker.vue"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ref } from "vue"

export type { RecordTarget }

defineProps<{ open: boolean; title: string; description: string; saving?: boolean }>()
const emit = defineEmits<{ "update:open": [boolean]; confirm: [RecordTarget] }>()
const target = ref<RecordTarget | null>(null)
</script>

<template>
  <Dialog :open="open" @update:open="(value) => !saving && emit('update:open', value)">
    <DialogContent class="flex flex-col">
      <DialogHeader>
        <DialogTitle>{{ title }}</DialogTitle>
        <DialogDescription>{{ description }} Nothing is written to Dropbox, OneDrive or Google Drive.</DialogDescription>
      </DialogHeader>
      <RecordTargetPicker v-model:target="target" :active="open" :saving="saving" @create="(key) => emit('confirm', { kind: 'record', key, create: true })" />
      <DialogFooter class="items-center">
        <DialogClose as-child><Button type="button" variant="outline" :disabled="saving">Cancel</Button></DialogClose>
        <Button type="button" :disabled="!target || saving" @click="target && emit('confirm', target)">{{ saving ? "Linking…" : "Link" }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
