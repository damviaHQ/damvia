/* Damvia - Open Source Digital Asset Manager
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
along with this program.  If not, see <https://www.gnu.org/licenses/>. */
import { useGlobalToast } from '@/composables/useGlobalToast'
import { trpc } from '@/services/server'
import { useGlobalStore } from '@/stores/globalStore'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed } from 'vue'

export function useCollectionFavorites() {
  const store = useGlobalStore()
  const toast = useGlobalToast()
  const queryClient = useQueryClient()
  const canFavorite = computed(() => ['admin', 'manager', 'member'].includes(store.user?.role ?? ''))
  const query = useQuery({
    queryKey: computed(() => ['collection-favorites', store.user?.id]),
    queryFn: () => trpc.favorite.listCollections.query(),
    enabled: canFavorite,
  })
  const favoriteIds = computed(() => new Set((query.data.value ?? []).map(collection => collection.id)))
  const isFavorite = (id: string) => favoriteIds.value.has(id)
  const mutation = useMutation({
    mutationFn: ({ id, remove }: { id: string; remove: boolean }) => remove
      ? trpc.favorite.removeCollection.mutate({ collectionId: id })
      : trpc.favorite.addCollection.mutate({ collectionId: id }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['collection-favorites'] }),
    onError: (error: Error) => toast.error(error.message),
  })
  const toggle = (id: string) => {
    if (canFavorite.value && query.isSuccess.value && !mutation.isPending.value) {
      mutation.mutate({ id, remove: isFavorite(id) })
    }
  }
  return { ...query, canFavorite, isFavorite, toggle, isSaving: mutation.isPending }
}
