<template>
  <Popover>
    <PopoverTrigger as-child>
      <Button
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
import {CalendarIcon} from 'lucide-vue-next'
import {DateValue, toDate} from 'reka-ui/date'
import {CalendarRootEmits, CalendarRootProps, useForwardPropsEmits} from "reka-ui";
import {HTMLAttributes} from "vue";
import {DateFormatter} from '@internationalized/date'

const df = new DateFormatter('en-US', {
  dateStyle: 'long',
})

const props = defineProps<CalendarRootProps & { class?: HTMLAttributes['class'] }>()

const emits = defineEmits<CalendarRootEmits>()

const forwarded = useForwardPropsEmits(props, emits)
</script>
