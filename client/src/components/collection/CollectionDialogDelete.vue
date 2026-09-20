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
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { useGlobalToast } from '@/composables/useGlobalToast'
import { trpc } from '@/services/server'
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { useRouter } from 'vue-router'

const props = defineProps<{ modelValue: boolean; collection: { id: string; name: string; parentId?: string | null } }>()
const emit = defineEmits<{ 'update:modelValue': [boolean] }>()
const queryClient = useQueryClient()
const router = useRouter()
const toast = useGlobalToast()
const { mutate, isPending, error } = useMutation({
  mutationFn: () => trpc.collection.remove.mutate(props.collection.id),
  onSuccess: async () => {
    const route = router.currentRoute.value
    if (route.name === 'collection' && route.params.id === props.collection.id) {
      await router.push(props.collection.parentId
        ? { name: 'collection', params: { id: props.collection.parentId } }
        : { name: 'my-collections' })
    }
    emit('update:modelValue', false)
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['collection'] }),
      queryClient.invalidateQueries({ queryKey: ['collection-favorites'] }),
      queryClient.invalidateQueries({ queryKey: ['favorites'] }),
      queryClient.invalidateQueries({ queryKey: ['menu-items'] }),
    ])
    toast.success('Collection deleted')
  },
})
function updateOpen(open: boolean) {
  if (!isPending.value) emit('update:modelValue', open)
}
</script>

<template>
  <AlertDialog :open="modelValue" @update:open="updateOpen">
    <AlertDialogContent class="sm:max-w-[480px]">
      <AlertDialogHeader>
        <AlertDialogTitle>Delete collection?</AlertDialogTitle>
        <AlertDialogDescription>
          “{{ collection.name }}” and its subcollections will be deleted. Original assets will remain in your library. This cannot be undone.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <p v-if="error" role="alert" class="text-body text-destructive">{{ error.message }}</p>
      <AlertDialogFooter>
        <AlertDialogCancel :disabled="isPending">Cancel</AlertDialogCancel>
        <Button type="button" variant="destructive" :disabled="isPending" @click="!isPending && mutate()">
          {{ isPending ? 'Deleting…' : 'Delete collection' }}
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
