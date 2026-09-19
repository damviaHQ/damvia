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
