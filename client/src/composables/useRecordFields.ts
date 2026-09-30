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
import type { GridField } from "@/components/records/RecordsGrid.vue"
import { useGlobalToast } from "@/composables/useGlobalToast"
import { trpc, type RouterOutput } from "@/services/server"
import { useQuery, useQueryClient } from "@tanstack/vue-query"
import { computed, type Ref } from "vue"

export type RecordAttribute = RouterOutput["recordAttribute"]["list"][number]

// The field catalogue as the grid and the product card read it.
// The catalogue loads when `enabled` turns true, for screens that only need it in a card.
export function useRecordFields(enabled?: Ref<boolean>) {
  const toast = useGlobalToast()
  const queryClient = useQueryClient()
  const { data: attributes } = useQuery({ queryKey: ["records", "attributes"], queryFn: () => trpc.recordAttribute.list.query(), enabled: computed(() => enabled?.value ?? true) })
  const toGridField = (field: RecordAttribute): GridField => ({ id: field.id, name: field.name, displayName: field.displayName, valueType: field.valueType, options: field.options })
  const allFields = computed<GridField[]>(() => (attributes.value ?? []).map(toGridField))

  async function addOption(field: GridField, option: string) {
    try {
      await trpc.recordAttribute.update.mutate({ id: field.id, options: [...field.options, option] })
      await queryClient.invalidateQueries({ queryKey: ["records", "attributes"] })
    } catch (failure) {
      toast.error((failure as Error).message)
      throw failure
    }
  }

  return { attributes, allFields, toGridField, addOption }
}
