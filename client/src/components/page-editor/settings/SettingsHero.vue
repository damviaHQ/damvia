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

// With the whole banner linked, the button is only a cue and follows that link.
function setLabel(label: string) {
  const link = props.data.link ? null : props.data.button?.link ?? { kind: "url", url: "", external: true }
  patch({ button: label ? { label, link } : null })
}
</script>

<template>
  <div class="grid gap-3">
    <LinkField :model-value="data.link ?? null" label="Whole banner links to"
      @update:model-value="patch({ link: $event })" />
    <FieldGroup>
      <Label :for="`${fieldId}-button`">Button text (optional)</Label>
      <Input :id="`${fieldId}-button`" type="text" :model-value="data.button?.label ?? ''"
        @update:model-value="setLabel($event as string)" />
    </FieldGroup>
    <LinkField v-if="data.button?.label && !data.link" :model-value="data.button.link ?? null"
      label="Button links to"
      @update:model-value="patch({ button: { ...data.button, link: $event } })" />
  </div>
</template>
