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
import { menuIconClasses } from "@/components/layout-main/navigationStyles"
import DialogMemberDisplay from "@/components/dialog-member/DialogMemberDisplay.vue"
import DialogMemberDownloads from "@/components/dialog-member/DialogMemberDownloads.vue"
import DialogMemberLinks from "@/components/dialog-member/DialogMemberLinks.vue"
import DialogMemberProfile from "@/components/dialog-member/DialogMemberProfile.vue"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useMediaQuery } from "@vueuse/core"
import { FileDown, LayoutDashboard, Link, User } from "lucide-vue-next"
import { TabsTrigger as TabsTriggerPrimitive } from "reka-ui"
import { computed, ref, watch } from "vue"

const props = defineProps<{
  open: boolean
  initialTab?: "downloads" | "links" | "profile" | "display-preferences"
}>()

const emit = defineEmits<{
  "update:open": [boolean]
}>()

const accountTabs = [
  { id: 'profile', label: 'Profile', icon: User, description: 'Manage your profile and account details.' },
  { id: 'downloads', label: 'Downloads', icon: FileDown, description: 'Downloads from the last 30 days. Links are available for 7 days.' },
  { id: 'links', label: 'Links', icon: Link, description: 'Manage collection invitations and guest access.' },
  { id: 'display-preferences', label: 'Display preferences', icon: LayoutDashboard, description: 'Choose grid or list for each type. Changes are saved in this browser.' },
] as const
const currentTab = computed(() => accountTabs.find(tab => tab.id === activeTab.value) ?? accountTabs[0])
const activeTab = ref(props.initialTab || "downloads")
const isDesktop = useMediaQuery("(min-width: 768px)")

watch(
  () => props.open,
  (newValue) => {
    if (newValue && props.initialTab) {
      activeTab.value = props.initialTab
    }
  }
)

const closeDialog = () => {
  emit("update:open", false)
}
</script>

<template>
  <Dialog :open="open" @update:open="closeDialog">
    <DialogContent class="w-[min(1100px,calc(100vw-48px))] h-[min(760px,calc(100dvh-48px))] max-w-none flex flex-col gap-0 bg-white p-0 overflow-hidden">
      <Tabs v-model="activeTab" :orientation="isDesktop ? 'vertical' : 'horizontal'" class="flex min-h-0 flex-1">
        <aside v-if="isDesktop" class="w-56 shrink-0 flex-col border-r border-neutral-200 bg-neutral-50 p-4 md:flex">
          <p class="px-3 py-2 text-base font-semibold">Account</p>
          <TabsList aria-label="Account sections" class="mt-4 grid h-auto justify-stretch gap-1 rounded-none bg-transparent p-0">
            <TabsTriggerPrimitive v-for="tab in accountTabs" :key="tab.id" :value="tab.id" as-child>
              <Button type="button" variant="ghost"
                class="w-full min-w-0 justify-start gap-2 px-3 py-2.5 text-left transition-none"
                :class="activeTab === tab.id && 'bg-neutral-200 text-neutral-900 hover:bg-neutral-200'">
                <component :is="tab.icon" :class="menuIconClasses" />
                <span>{{ tab.label }}</span>
              </Button>
            </TabsTriggerPrimitive>
          </TabsList>
        </aside>
        <div class="flex min-h-0 min-w-0 flex-1 flex-col">
          <header class="shrink-0 px-7 py-6 pr-16">
            <DialogTitle>{{ currentTab.label }}</DialogTitle>
            <DialogDescription class="mt-2">{{ currentTab.description }}</DialogDescription>
          </header>
          <TabsList v-if="!isDesktop" aria-label="Account sections" class="flex h-auto shrink-0 justify-start overflow-x-auto rounded-none border-b border-neutral-200 bg-transparent px-7 py-0 md:hidden">
            <TabsTrigger v-for="tab in accountTabs" :key="tab.id" :value="tab.id" class="shrink-0 border-b-2 border-transparent px-3 py-2.5 data-[state=active]:border-neutral-900 data-[state=active]:bg-transparent">{{ tab.label }}</TabsTrigger>
          </TabsList>
          <div class="min-h-0 flex-1 overflow-y-auto p-7" data-account-content>
            <TabsContent value="downloads" class="m-0"><DialogMemberDownloads @close="closeDialog" /></TabsContent>
            <TabsContent value="links" class="m-0"><DialogMemberLinks @close="closeDialog" /></TabsContent>
            <TabsContent value="profile" class="m-0"><DialogMemberProfile /></TabsContent>
            <TabsContent value="display-preferences" class="m-0"><DialogMemberDisplay /></TabsContent>
          </div>
        </div>
      </Tabs>
    </DialogContent>
  </Dialog>
</template>
