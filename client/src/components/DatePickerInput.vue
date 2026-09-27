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
<template>
  <Popover>
    <PopoverTrigger as-child>
      <Button
        :id="id" :aria-labelledby="labelledby ? `${labelledby} ${id}` : undefined"
        variant="outline" :class="cn(
          'w-full ps-3 text-start font-normal bg-white',
          !modelValue && 'text-muted-foreground',
        )"
      >
        <span>{{ modelValue ? df.format(toDate(modelValue as DateValue)) : "Pick a date" }}</span>
        <CalendarIcon class="ms-auto h-4 w-4 opacity-50" />
      </Button>
    </PopoverTrigger>
    <PopoverContent class="w-auto p-0">
      <Calendar v-bind="forwarded" />
    </PopoverContent>
  </Popover>
</template>

<script setup lang="ts">
import {cn} from '@/lib/utils.ts'
import {Button} from '@/components/ui/button'
import {Calendar} from '@/components/ui/calendar'
import {Popover, PopoverContent, PopoverTrigger} from '@/components/ui/popover'
import {CalendarIcon} from '@lucide/vue'
import {DateValue, toDate} from 'reka-ui/date'
import {CalendarRootEmits, CalendarRootProps, useForwardPropsEmits} from "reka-ui";
import {HTMLAttributes, computed, useId} from "vue";
import {DateFormatter} from '@internationalized/date'

const df = new DateFormatter('en-US', {
  dateStyle: 'long',
})

const props = defineProps<CalendarRootProps & { class?: HTMLAttributes['class'], labelledby?: string }>()

const emits = defineEmits<CalendarRootEmits>()

const id = useId()
const delegatedProps = computed(() => {
  const { labelledby: _, ...delegated } = props

  return delegated
})
const forwarded = useForwardPropsEmits(delegatedProps, emits)
</script>
