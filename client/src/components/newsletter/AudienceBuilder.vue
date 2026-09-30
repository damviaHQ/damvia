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
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { trpc } from "@/services/server.ts"
import { AUDIENCE_ROLES, describeAudience, type AudienceFilter, type AudienceRole } from "@/utils/newsletter"
import { useQuery } from "@tanstack/vue-query"
import { Check, Users } from "@lucide/vue"
import { computed, onBeforeUnmount, ref, watch } from "vue"
import Treeselect from "vue3-treeselect-ts"

const filter = defineModel<AudienceFilter>({ required: true })
const count = defineModel<number | null>("count", { default: null })
const props = defineProps<{ disabled?: boolean }>()

const { data: groups } = useQuery({ queryKey: ["groups"], queryFn: () => trpc.group.list.query() })
const { data: regions } = useQuery({ queryKey: ["regions"], queryFn: () => trpc.region.list.query() })
const { data: people } = useQuery({ queryKey: ["newsletter-people"], queryFn: () => trpc.newsletter.people.query() })

const groupOptions = computed(() => (groups.value ?? []).map(group => ({ id: group.id, label: group.name })))
const regionOptions = computed(() => (regions.value ?? []).map(region => ({ id: region.id, label: region.name })))
// People who cannot receive newsletters stay listed, marked, so nobody wonders where they went.
const peopleOptions = computed(() => (people.value ?? []).map(person => ({
  id: person.id,
  label: `${person.name} (${person.email})${person.reachable ? "" : " · won't receive it"}`,
})))
const names = computed(() => ({
  groups: new Map((groups.value ?? []).map(group => [group.id, group.name])),
  regions: new Map((regions.value ?? []).map(region => [region.id, region.name])),
  people: new Map((people.value ?? []).map(person => [person.id, person.name])),
}))
const summary = computed(() => describeAudience(filter.value, names.value))

function toggleRole(role: AudienceRole) {
  const roles = filter.value.roles
  filter.value = { ...filter.value, roles: roles.includes(role) ? roles.filter(current => current !== role) : [...roles, role] }
}
function update<K extends keyof AudienceFilter>(key: K, value: AudienceFilter[K]) {
  filter.value = { ...filter.value, [key]: value }
}

const sample = ref<{ id: string, name: string, email: string }[]>([])
const counting = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined
let run = 0
async function refresh() {
  const current = ++run
  counting.value = true
  try {
    const result = await trpc.newsletter.audienceSize.mutate(filter.value)
    if (current !== run) return
    count.value = result.count
    sample.value = result.sample
  } catch {
    if (current === run) count.value = null
  } finally {
    if (current === run) counting.value = false
  }
}
watch(filter, () => {
  clearTimeout(timer)
  timer = setTimeout(refresh, 300)
}, { deep: true, immediate: true })
onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <div class="audience" :aria-disabled="props.disabled">
    <RadioGroup :model-value="filter.everyone ? 'everyone' : 'choose'" :disabled="props.disabled" class="audience-modes" aria-label="Who receives it"
      @update:model-value="update('everyone', $event === 'everyone')">
      <Label v-for="option in [
        { value: 'everyone', title: 'Everyone', hint: 'Every approved account that has not unsubscribed.' },
        { value: 'choose', title: 'Choose who', hint: 'By role, group or region, and people picked by hand.' },
      ]" :key="option.value" :for="`audience-${option.value}`" class="audience-mode" :data-checked="(option.value === 'everyone') === filter.everyone">
        <RadioGroupItem :id="`audience-${option.value}`" :value="option.value" class="mt-0.5" />
        <span class="grid gap-1">
          <span class="text-sm font-medium">{{ option.title }}</span>
          <span class="text-xs font-normal leading-4 text-neutral-500">{{ option.hint }}</span>
        </span>
      </Label>
    </RadioGroup>

    <div v-if="!filter.everyone" class="audience-criteria">
      <p class="audience-help">People must match every row you fill in. Leave a row empty to ignore it.</p>
      <div class="audience-row">
        <span class="audience-label" id="audience-roles-label">Role</span>
        <div class="audience-chips" role="group" aria-labelledby="audience-roles-label">
          <button v-for="role in AUDIENCE_ROLES" :key="role.value" type="button" class="audience-chip" :disabled="props.disabled"
            :aria-pressed="filter.roles.includes(role.value)" @click="toggleRole(role.value)">
            <Check v-if="filter.roles.includes(role.value)" class="size-3" aria-hidden="true" />{{ role.label }}
          </button>
        </div>
      </div>
      <div class="audience-row">
        <label class="audience-label" for="audience-groups">Group</label>
        <Treeselect :model-value="filter.groupIds" :options="groupOptions" :multiple="true" :disabled="props.disabled"
          placeholder="Any group" input-id="audience-groups" @update:model-value="update('groupIds', $event ?? [])" />
      </div>
      <div class="audience-row">
        <label class="audience-label" for="audience-regions">Region</label>
        <Treeselect :model-value="filter.regionIds" :options="regionOptions" :multiple="true" :disabled="props.disabled"
          placeholder="Any region" input-id="audience-regions" @update:model-value="update('regionIds', $event ?? [])" />
      </div>
      <div class="audience-row">
        <label class="audience-label" for="audience-include">Also send to</label>
        <Treeselect :model-value="filter.includeUserIds" :options="peopleOptions" :multiple="true" :disabled="props.disabled"
          placeholder="Add people by name or email…" input-id="audience-include" @update:model-value="update('includeUserIds', $event ?? [])" />
      </div>
    </div>
    <div class="audience-row">
      <label class="audience-label" for="audience-exclude">Leave out</label>
      <Treeselect :model-value="filter.excludeUserIds" :options="peopleOptions" :multiple="true" :disabled="props.disabled"
        placeholder="Nobody" input-id="audience-exclude" @update:model-value="update('excludeUserIds', $event ?? [])" />
    </div>

    <div class="audience-result" role="status" aria-live="polite">
      <Users class="size-4 shrink-0" aria-hidden="true" />
      <div class="grid gap-0.5 min-w-0">
        <strong>{{ count === null ? (counting ? 'Counting…' : '—') : `${count} ${count === 1 ? 'recipient' : 'recipients'}` }}</strong>
        <span>{{ summary }}<template v-if="sample.length && count">: {{ sample.map(person => person.name).join(', ') }}{{ count > sample.length ? '…' : '' }}</template></span>
      </div>
    </div>
    <p class="audience-help">Accounts that are unapproved, unverified, suspended or unsubscribed never receive newsletters, even when picked by hand.</p>
  </div>
</template>

<style scoped>
.audience { display:grid; gap:16px; }
.audience[aria-disabled=true] { opacity:.7; }
.audience-modes { display:grid; gap:8px; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); }
.audience-mode { display:flex; align-items:flex-start; gap:10px; padding:10px 12px; border:1px solid var(--dv-color-line); cursor:pointer; }
.audience-mode:hover { border-color:var(--dv-text-secondary); }
.audience-mode[data-checked=true] { border-color:var(--dv-text-primary); background:var(--dv-surface-canvas); }
.audience-criteria { display:grid; gap:14px; padding:16px; border:1px solid var(--dv-color-line); }
.audience-row { display:grid; grid-template-columns:120px minmax(0, 1fr); gap:12px; align-items:center; }
.audience-label { font-size:var(--dv-size-body); font-weight:500; }
.audience-help { color:var(--dv-text-secondary); font-size:var(--dv-size-caption); }
.audience-chips { display:flex; flex-wrap:wrap; gap:6px; }
.audience-chip { display:inline-flex; align-items:center; gap:5px; min-height:30px; padding:3px 12px; border:1px solid var(--dv-color-line); background:white; color:var(--dv-text-secondary); font-size:var(--dv-size-caption); cursor:pointer; }
.audience-chip:hover:not(:disabled) { border-color:var(--dv-text-secondary); color:var(--dv-text-primary); }
.audience-chip[aria-pressed=true] { border-color:var(--dv-text-primary); background:var(--dv-surface-canvas); color:var(--dv-text-primary); }
.audience-chip:focus-visible { outline:2px solid hsl(var(--ring)); outline-offset:2px; }
.audience-result { display:flex; align-items:flex-start; gap:10px; padding:12px 14px; background:var(--dv-action-soft); color:var(--dv-text-primary); font-size:var(--dv-size-body); }
.audience-result span { color:var(--dv-text-secondary); font-size:var(--dv-size-caption); }
@media(max-width:600px) { .audience-row { grid-template-columns:1fr; gap:6px; } }
</style>
