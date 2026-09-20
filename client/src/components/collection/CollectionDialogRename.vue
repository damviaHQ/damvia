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
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import FieldGroup from '@/components/ui/field/FieldGroup.vue'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useGlobalToast } from '@/composables/useGlobalToast'
import { trpc } from '@/services/server'
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { computed, ref } from 'vue'

const props = defineProps<{ modelValue: boolean; collection: { id: string; name: string } }>()
const emit = defineEmits<{ 'update:modelValue': [boolean] }>()
const name = ref(props.collection.name)
const queryClient = useQueryClient()
const toast = useGlobalToast()
const { mutate, isPending, error } = useMutation({
  mutationFn: (name: string) => trpc.collection.rename.mutate({ id: props.collection.id, name }),
  onSuccess: async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['collection'] }),
      queryClient.invalidateQueries({ queryKey: ['collection-favorites'] }),
      queryClient.invalidateQueries({ queryKey: ['menu-items'] }),
    ])
    emit('update:modelValue', false)
    toast.success('Collection renamed')
  },
})
const canSubmit = computed(() => !isPending.value && name.value.trim().length > 0 && name.value.trim().length <= 80 && name.value.trim() !== props.collection.name)
function submit() {
  if (canSubmit.value) mutate(name.value.trim())
}
</script>

<template>
  <Dialog :open="modelValue" @update:open="emit('update:modelValue', $event)">
    <DialogContent class="sm:max-w-[480px]">
      <form class="grid gap-6" @submit.prevent="submit">
        <DialogHeader>
          <DialogTitle>Rename collection</DialogTitle>
          <DialogDescription>Choose a new name for this collection.</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Label for="rename-collection-name">Collection name</Label>
          <Input id="rename-collection-name" v-model="name" required maxlength="80" :disabled="isPending" />
          <p v-if="error" role="alert" class="text-body text-destructive">{{ error.message }}</p>
        </FieldGroup>
        <DialogFooter>
          <Button type="button" variant="outline" :disabled="isPending" @click="emit('update:modelValue', false)">Cancel</Button>
          <Button type="submit" :disabled="!canSubmit">{{ isPending ? 'Renaming…' : 'Rename' }}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
