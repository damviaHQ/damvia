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
// "Publish on a schedule" for a draft of the catalogue, shown under its
// draft checkbox when a collection is created and in its settings.
import FieldDescription from "@/components/ui/field/FieldDescription.vue"
import FieldGroup from "@/components/ui/field/FieldGroup.vue"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { formatDateTime, localInput } from "@/utils/publishSchedule"

const props = defineProps<{ id: string; scheduledAt?: Date | string | null }>()
const enabled = defineModel<boolean>("enabled", { required: true })
const at = defineModel<string>("at", { required: true })
const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
const minimum = localInput(new Date(Date.now() + 60_000))
</script>

<template>
  <div class="grid gap-3 pl-7">
    <div class="flex items-start gap-3">
      <Checkbox :id="`${props.id}-publish-later`" v-model="enabled" class="mt-0.5" :aria-describedby="`${props.id}-publish-later-help`" />
      <div class="grid gap-1">
        <Label :for="`${props.id}-publish-later`">Publish on a schedule</Label>
        <FieldDescription :id="`${props.id}-publish-later-help`">
          At that time the collection and everything inside it stop being a draft and become visible to readers.
        </FieldDescription>
      </div>
    </div>
    <FieldGroup v-if="enabled">
      <Label :for="`${props.id}-publish-at`">Date and time <span class="font-normal text-neutral-500">{{ timeZone }}</span></Label>
      <Input :id="`${props.id}-publish-at`" v-model="at" type="datetime-local" :min="minimum" :aria-describedby="`${props.id}-publish-at-help`" />
      <FieldDescription :id="`${props.id}-publish-at-help`">
        <template v-if="props.scheduledAt">Currently scheduled for {{ formatDateTime(props.scheduledAt) }}.</template>
        Published within a minute of that time.
      </FieldDescription>
    </FieldGroup>
  </div>
</template>
