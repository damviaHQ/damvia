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
import FieldDescription from "@/components/ui/field/FieldDescription.vue"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { trpc } from "@/services/server.ts"
import {
  ACTION_BAR_MODES,
  ACTION_BAR_ROLES,
  describeRule,
  editableSettings,
  type ActionBarAction,
  type ActionBarMode,
  type ActionBarRole,
  type ActionBarRule,
  type ActionBarSettings,
} from "@/utils/actionBar"
import { useQuery } from "@tanstack/vue-query"
import { Check, Filter, LayoutGrid, Search } from "@lucide/vue"
import { computed } from "vue"
import Treeselect from "vue3-treeselect-ts"

const props = defineProps<{
  collectionId: string
  inherited: ActionBarSettings
  inheritedFrom: { id: string, name: string } | null
  descendantOverrides: number
}>()
const custom = defineModel<boolean>("custom", { required: true })
const rules = defineModel<Record<ActionBarAction, ActionBarRule>>("rules", { required: true })
const resetDescendants = defineModel<boolean>("resetDescendants", { required: true })

// Share is only offered to people who can edit the collection, and they always
// see every action, so a rule for it would change nothing yet.
const actions: { key: ActionBarAction, label: string, icon: typeof Filter }[] = [
  { key: "search", label: "Search in collection", icon: Search },
  { key: "filter", label: "Filter", icon: Filter },
  { key: "display", label: "Display preferences", icon: LayoutGrid },
]

const { data: audience } = useQuery({
  queryKey: computed(() => ["collection-action-bar-audience", props.collectionId]),
  queryFn: () => trpc.collection.actionBarAudience.query(props.collectionId),
})
const groupOptions = computed(() => (audience.value?.groups ?? []).map((group) => ({ id: group.id, label: group.name })))
const userOptions = computed(() => (audience.value?.users ?? []).map((user) => ({ id: user.id, label: `${user.name} (${user.email})` })))
const names = computed(() => ({
  groups: new Map((audience.value?.groups ?? []).map((group) => [group.id, group.name])),
  users: new Map((audience.value?.users ?? []).map((user) => [user.id, user.name])),
}))

// While following the parent, the rows show what the parent decides; the
// custom rules stay in the form for when the editor switches back.
const shown = computed(() => custom.value ? rules.value : editableSettings(props.inherited))

const followHint = computed(() => props.inheritedFrom
  ? `Follows “${props.inheritedFrom.name}”.`
  : "No parent sets it, so everyone sees every action.")

function setMode(action: ActionBarAction, mode: ActionBarMode) {
  rules.value[action].mode = mode
}

function toggleRole(action: ActionBarAction, role: ActionBarRole) {
  const roles = rules.value[action].roles
  rules.value[action].roles = roles.includes(role) ? roles.filter((current) => current !== role) : [...roles, role]
}
</script>

<template>
  <section class="grid gap-4" aria-labelledby="collection-action-bar-heading">
    <div class="grid gap-1">
      <h3 id="collection-action-bar-heading" class="text-sm font-semibold">Action bar</h3>
      <FieldDescription>Choose who sees each tool above this collection. Admins and the owner always see all of them.</FieldDescription>
    </div>

    <RadioGroup :model-value="custom ? 'custom' : 'inherit'" @update:model-value="custom = $event === 'custom'"
      class="grid gap-2 sm:grid-cols-2" aria-label="Action bar settings">
      <Label v-for="option in [
        { value: 'inherit', title: 'Same as parent', hint: followHint },
        { value: 'custom', title: 'Custom', hint: 'Set for this collection and the sub-collections that follow it.' },
      ]" :key="option.value" :for="`action-bar-${option.value}`" class="action-bar-choice" :data-checked="(option.value === 'custom') === custom">
        <RadioGroupItem :id="`action-bar-${option.value}`" :value="option.value" class="mt-0.5" />
        <span class="grid gap-1">
          <span class="text-sm font-medium">{{ option.title }}</span>
          <span class="text-xs font-normal leading-4 text-neutral-500">{{ option.hint }}</span>
        </span>
      </Label>
    </RadioGroup>

    <ul class="action-bar-rows" :aria-disabled="!custom">
      <li v-for="action in actions" :key="action.key" class="grid gap-3 px-3 py-2.5">
        <div class="flex items-center gap-3">
          <component :is="action.icon" class="size-4 shrink-0 text-neutral-500" aria-hidden="true" />
          <div class="grid min-w-0 flex-1 gap-0.5">
            <span :id="`action-bar-${action.key}-label`" class="text-sm">{{ action.label }}</span>
            <span class="truncate text-xs text-neutral-500">{{ describeRule(shown[action.key], names) }}</span>
          </div>
          <Select :model-value="shown[action.key].mode" :disabled="!custom"
            @update:model-value="setMode(action.key, $event as ActionBarMode)">
            <SelectTrigger :aria-labelledby="`action-bar-${action.key}-label`" class="h-8 w-[168px] shrink-0 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem v-for="mode in ACTION_BAR_MODES" :key="mode.value" :value="mode.value">{{ mode.label }}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div v-if="custom && ['only', 'except'].includes(rules[action.key].mode)" class="grid gap-2 pl-7"
          role="group" :aria-label="`${action.label}: ${rules[action.key].mode === 'only' ? 'who sees it' : 'who does not see it'}`">
          <div class="flex flex-wrap gap-1.5" role="group" aria-label="Roles">
            <button v-for="role in ACTION_BAR_ROLES" :key="role.value" type="button" class="action-bar-chip"
              :aria-pressed="rules[action.key].roles.includes(role.value)" @click="toggleRole(action.key, role.value)">
              <Check v-if="rules[action.key].roles.includes(role.value)" class="size-3" aria-hidden="true" />{{ role.label }}
            </button>
          </div>
          <Treeselect v-model="rules[action.key].groupIds" :options="groupOptions" :multiple="true"
            placeholder="Add groups…" :input-id="`action-bar-${action.key}-groups`" />
          <Treeselect v-model="rules[action.key].userIds" :options="userOptions" :multiple="true"
            placeholder="Add people…" :input-id="`action-bar-${action.key}-users`" />
        </div>
      </li>
    </ul>

    <div v-if="custom && descendantOverrides > 0" class="flex items-start gap-3">
      <Checkbox id="action-bar-reset" v-model="resetDescendants" class="mt-0.5" aria-describedby="action-bar-reset-help" />
      <div class="grid gap-1">
        <Label for="action-bar-reset">Apply to all sub-collections</Label>
        <FieldDescription id="action-bar-reset-help">
          {{ descendantOverrides }} sub-collection{{ descendantOverrides > 1 ? "s have their" : " has its" }} own setting. Check this to make {{ descendantOverrides > 1 ? "them" : "it" }} follow this one.
        </FieldDescription>
      </div>
    </div>
  </section>
</template>

<style>
.action-bar-choice {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--dv-color-line);
  cursor: pointer;
}
.action-bar-choice:hover { border-color: var(--dv-text-secondary); }
.action-bar-choice[data-checked=true] { border-color: var(--dv-text-primary); background: var(--dv-surface-canvas); }
.action-bar-rows { border: 1px solid var(--dv-color-line); }
.action-bar-rows > li + li { border-top: 1px solid var(--dv-color-line); }
.action-bar-rows[aria-disabled=true] > li { color: var(--dv-text-secondary); }
.action-bar-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 28px;
  padding: 3px 10px;
  border: 1px solid var(--dv-color-line);
  background: transparent;
  color: var(--dv-text-secondary);
  font-size: 12px;
  line-height: 18px;
  cursor: pointer;
}
.action-bar-chip:hover { border-color: var(--dv-text-secondary); color: var(--dv-text-primary); }
.action-bar-chip[aria-pressed=true] { border-color: var(--dv-text-primary); background: var(--dv-surface-canvas); color: var(--dv-text-primary); }
.action-bar-chip:focus-visible { outline: 2px solid hsl(var(--ring)); outline-offset: 2px; }
</style>
