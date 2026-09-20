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
import FieldGroup from "@/components/ui/field/FieldGroup.vue"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useId } from "vue"
import LinkField from "./LinkField.vue"

const props = defineProps<{ data: any }>()
const emit = defineEmits<{ (e: "update", data: any): void }>()
const fieldId = useId()

function patch(values: Record<string, unknown>) {
  emit("update", { ...props.data, ...values })
}
</script>

<template>
  <div class="grid gap-3">
    <FieldGroup>
      <Label :for="`${fieldId}-alt`">Description for screen readers</Label>
      <Input :id="`${fieldId}-alt`" type="text" :model-value="data.alt ?? ''"
        @update:model-value="patch({ alt: $event })" />
    </FieldGroup>
    <FieldGroup>
      <Label :for="`${fieldId}-caption`">Caption (optional)</Label>
      <Input :id="`${fieldId}-caption`" type="text" :model-value="data.caption ?? ''"
        @update:model-value="patch({ caption: $event })" />
    </FieldGroup>
    <LinkField :model-value="data.link ?? null" @update:model-value="patch({ link: $event })" />
  </div>
</template>
