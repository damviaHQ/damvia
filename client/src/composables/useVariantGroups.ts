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
import { extractErrors, trpc, type RouterOutput } from '@/services/server'
import { useGlobalStore } from '@/stores/globalStore'
import { useQueryClient } from '@tanstack/vue-query'
import { computed, onScopeDispose, ref, shallowReactive, type Ref } from 'vue'

type File = RouterOutput['collection']['findById']['files'][number]
export type VariantGroup = RouterOutput['variantGroup']['findById']
export type VariantMember = VariantGroup['members'][number]
type CheckState = 'check' | 'undetermined' | false

// A closed card stands for its whole group: its checkbox takes every variant,
// its preview walks through them before the next card, and its label opens
// them in a band under the row.
export function useVariantGroups(files: Ref<File[]>, localFiles: Ref<File[] | undefined>) {
  const store = useGlobalStore()
  const toast = useGlobalToast()
  const queryClient = useQueryClient()
  const groups = shallowReactive<Record<string, VariantGroup>>({})
  const openGroupId = ref<string | null>(null)
  // An admin editing the group refetches it; the band follows.
  onScopeDispose(queryClient.getQueryCache().subscribe(event => {
    const [scope, id] = event.query.queryKey as [string, string]
    if (scope !== 'variant-group' || !groups[id]) return
    const data = event.query.state.data as VariantGroup | undefined
    if (event.type === 'updated' && data) groups[id] = data
    if (event.type === 'removed' || event.query.state.status === 'error') {
      delete groups[id]
      if (openGroupId.value === id) openGroupId.value = null
    }
  }))

  const grouped = (file: File) => store.groupVariants && !!file.variantGroup
  const isSelected = (id: string) => store.selection.some(item => item.type === 'file' && item.id === id)

  async function load(groupId: string) {
    if (groups[groupId]) return groups[groupId]
    try {
      const group = await queryClient.fetchQuery({ queryKey: ['variant-group', groupId], queryFn: () => trpc.variantGroup.findById.query(groupId) })
      groups[groupId] = group
      return group
    } catch (error) {
      toast.error(extractErrors(error as Error).message)
      return null
    }
  }

  // A variant also listed on screen keeps the id it has there, so the card and
  // the band select the very same entry.
  function members(file: File): (File | VariantMember)[] {
    const group = file.variantGroup && groups[file.variantGroup.id]
    if (!group) return [file]
    const shown = new Map([...(localFiles.value ?? []), ...files.value].map(entry => [entry.assetFileId, entry]))
    shown.set(file.assetFileId, file)
    const list: (File | VariantMember)[] = group.members.map((member: VariantMember) => shown.get(member.assetFileId) ?? member)
    return [...list.filter(member => member.id === file.id), ...list.filter(member => member.id !== file.id)]
  }

  function groupState(file: File): CheckState {
    const list = members(file)
    const count = list.filter(member => isSelected(member.id)).length
    return count === 0 ? false : count === list.length ? 'check' : 'undetermined'
  }

  function selectedCount(file: File) {
    return members(file).filter(member => isSelected(member.id)).length
  }

  async function toggleGroup(file: File) {
    if (!grouped(file)) return toggleOne(file.id)
    await load(file.variantGroup!.id)
    const list = members(file)
    if (list.every(member => isSelected(member.id))) list.forEach(member => store.removeFromSelection({ type: 'file', id: member.id }))
    else list.filter(member => !isSelected(member.id)).forEach(member => store.addToSelection({ type: 'file', id: member.id }))
  }

  function toggleOne(id: string) {
    if (isSelected(id)) store.removeFromSelection({ type: 'file', id })
    else store.addToSelection({ type: 'file', id })
  }

  // The preview steps from a cover through its variants, then on to the next card.
  const previewFiles = computed(() => files.value.flatMap(file => grouped(file) ? members(file) : [file]) as File[])
  function preview(file: File) {
    if (grouped(file)) load(file.variantGroup!.id)
  }

  async function toggleBand(file: File) {
    const id = file.variantGroup!.id
    if (openGroupId.value === id) {
      openGroupId.value = null
      return
    }
    if (await load(id)) openGroupId.value = id
  }

  return { grouped, groups, openGroupId, members, groupState, selectedCount, toggleGroup, toggleOne, isSelected, previewFiles, preview, toggleBand }
}
