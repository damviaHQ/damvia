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
import { useFavoriteList } from '@/composables/useFavoriteList'
import { trpc, type RouterOutput } from '@/services/server'
import { useGlobalStore } from '@/stores/globalStore'
import { computed } from 'vue'

type File = RouterOutput['favorite']['list'][number]

export function useFileFavorites() {
  const store = useGlobalStore()
  const favorites = useFavoriteList<File>({
    queryKey: computed(() => ['favorites', store.user?.id]),
    enabled: computed(() => ['admin', 'manager', 'member'].includes(store.user?.role ?? '')),
    list: () => trpc.favorite.list.query(),
    add: id => trpc.favorite.add.mutate({ collectionFileId: id }),
    remove: id => trpc.favorite.remove.mutate({ collectionFileId: id }),
  })
  return { ...favorites, isFavorite: (file: File) => favorites.isFavorite(file.id) }
}
