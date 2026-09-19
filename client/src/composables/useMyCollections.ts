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
import { trpc, type RouterOutput } from "@/services/server"
import { useGlobalStore } from "@/stores/globalStore"
import { useQuery } from "@tanstack/vue-query"
import { computed } from "vue"

type Collection = RouterOutput["collection"]["tree"][number]

export function useMyCollections() {
  const globalStore = useGlobalStore()
  const query = useQuery({
    queryKey: ["collection", "tree"],
    queryFn: () => trpc.collection.tree.query(),
  })
  const myCollections = computed(() => (query.data.value ?? [])
    .filter((collection: Collection) => collection.ownerId === globalStore.user?.id && !collection.public)
    .sort((a: Collection, b: Collection) => a.name.localeCompare(b.name)))

  return { ...query, myCollections }
}
