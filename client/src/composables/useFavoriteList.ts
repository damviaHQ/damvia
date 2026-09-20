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
import { useMutation, useMutationState, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, type ComputedRef } from 'vue'

type Favorite = { id: string }

type Options<T extends Favorite> = {
  queryKey: ComputedRef<(string | undefined)[]>
  enabled: ComputedRef<boolean>
  list: () => Promise<T[]>
  add: (id: string) => Promise<unknown>
  remove: (id: string) => Promise<unknown>
}

export function useFavoriteList<T extends Favorite>(options: Options<T>) {
  const queryClient = useQueryClient()
  const toast = useGlobalToast()
  const mutationKey = computed(() => [...options.queryKey.value, 'toggle'])
  type Change = { item: T; remove: boolean }
  const pendingIds = useMutationState({
    filters: { mutationKey, exact: true, status: 'pending' },
    select: mutation => (mutation.state.variables as Change).item.id,
  })
  const query = useQuery<T[]>({
    queryKey: options.queryKey,
    queryFn: options.list,
    // Keep a reload in another view from overwriting changes still being saved.
    enabled: computed(() => options.enabled.value && pendingIds.value.length === 0),
  })
  const favoriteIds = computed(() => new Set((query.data.value ?? []).map(item => item.id)))
  const isFavorite = (id: string) => favoriteIds.value.has(id)
  const isSaving = (id: string) => pendingIds.value.includes(id)
  const mutation = useMutation({
    mutationKey,
    mutationFn: ({ item, remove }: Change) => remove ? options.remove(item.id) : options.add(item.id),
    onMutate: async ({ item, remove }: Change) => {
      const queryKey = [...options.queryKey.value]
      await queryClient.cancelQueries({ queryKey, exact: true })
      const favorites = queryClient.getQueryData<T[]>(queryKey) ?? []
      const index = favorites.findIndex(favorite => favorite.id === item.id)
      const previous = favorites[index]
      queryClient.setQueryData<T[]>(queryKey, current => {
        const otherItems = (current ?? []).filter(favorite => favorite.id !== item.id)
        return remove ? otherItems : [...otherItems, item]
      })
      return { queryKey, previous, index }
    },
    onError: (error: Error, { item }, context) => {
      if (context) {
        // Restore only this item, preserving simultaneous changes to other favorites.
        queryClient.setQueryData<T[]>(context.queryKey, current => {
          const items = (current ?? []).filter(favorite => favorite.id !== item.id)
          if (context.previous) items.splice(Math.min(context.index, items.length), 0, context.previous)
          return items
        })
      }
      toast.error(error.message)
    },
    onSettled: (_data, _error, _variables, context) => {
      if (context && queryClient.isMutating({ mutationKey: [...context.queryKey, 'toggle'], exact: true }) === 1) {
        // Re-enabling the shared query after the final save fetches the settled list.
        return queryClient.invalidateQueries({ queryKey: context.queryKey, exact: true, refetchType: 'none' })
      }
    },
  })
  function toggle(item: T) {
    if (options.enabled.value && query.isSuccess.value && !isSaving(item.id)) {
      mutation.mutate({ item, remove: isFavorite(item.id) })
    }
  }
  return { ...query, canFavorite: options.enabled, isFavorite, isSaving, toggle }
}
