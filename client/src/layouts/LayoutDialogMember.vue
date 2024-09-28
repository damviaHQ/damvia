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
import DialogMemberDisplay from "@/components/dialog-member/DialogMemberDisplay.vue"
import DialogMemberDownloads from "@/components/dialog-member/DialogMemberDownloads.vue"
import DialogMemberLinks from "@/components/dialog-member/DialogMemberLinks.vue"
import DialogMemberProfile from "@/components/dialog-member/DialogMemberProfile.vue"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Tabs, TabsContent } from "@/components/ui/tabs"
import { FileDown, LayoutDashboard, Link, User } from "lucide-vue-next"
import { ref, watch } from "vue"

const props = defineProps<{
  open: boolean
  initialTab?: "downloads" | "links" | "profile" | "display-preferences"
}>()

const emit = defineEmits<{
  "update:open": [boolean]
}>()

const activeTab = ref(props.initialTab || "downloads")

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

const setActiveTab = (tab: "downloads" | "links" | "profile" | "display-preferences") => {
  activeTab.value = tab
}
</script>

<template>
  <Dialog :open="open" @update:open="closeDialog">
    <DialogContent class="w-[95%] h-[95%] max-w-none flex flex-col bg-white p-0 overflow-hidden">
      <Tabs v-model="activeTab" class="flex h-full">
        <!-- Sidebar -->
        <div class="hidden md:flex flex-col w-60 bg-neutral-50 p-4 border-r border-neutral-300">
          <h2 class="text-lg font-medium mb-6 text-neutral-800">Member Area</h2>
          <div class="flex flex-col items-start gap-2 text-neutral-600 w-full">
            <Button
              class="flex items-center justify-start text-neutral-600 px-4 py-5 text-left w-full bg-transparent hover:bg-neutral-200 hover:text-neutral-800"
              :class="{
                active: activeTab === 'profile',
                'bg-neutral-200 text-neutral-800': activeTab === 'profile',
              }" @click="setActiveTab('profile')">
              <User class="w-5 h-5 mr-3" />
              Profile
            </Button>
            <Button
              class="flex items-center justify-start text-neutral-600 px-4 py-5 text-left w-full bg-transparent hover:bg-neutral-200 hover:text-neutral-800"
              :class="{
                active: activeTab === 'downloads',
                'bg-neutral-200 text-neutral-800': activeTab === 'downloads',
              }" @click="setActiveTab('downloads')">
              <FileDown class="w-5 h-5 mr-3" />
              Downloads
            </Button>
            <Button
              class="flex items-center justify-start text-neutral-600 px-4 py-5 text-left w-full bg-transparent hover:bg-neutral-200 hover:text-neutral-800"
              :class="{
                active: activeTab === 'links',
                'bg-neutral-200 text-neutral-800': activeTab === 'links',
              }" @click="setActiveTab('links')">
              <Link class="w-5 h-5 mr-3" />
              Links
            </Button>
            <Button
              class="flex items-center justify-start text-neutral-600 px-4 py-5 text-left w-full bg-transparent hover:bg-neutral-200 hover:text-neutral-800"
              :class="{
                active: activeTab === 'display-preferences',
                'bg-neutral-200 text-neutral-800': activeTab === 'display-preferences',
              }" @click="setActiveTab('display-preferences')">
              <LayoutDashboard class="w-5 h-5 mr-3" />
              Display Preferences
            </Button>
          </div>
        </div>

        <!-- Content area -->
        <div class="flex-1 px-6 py-3 overflow-auto">
          <TabsContent value="downloads">
            <h3 class="text-sm font-semibold text-neutral-500 mb-4">My Downloads</h3>
            <DialogMemberDownloads @close="closeDialog" />
          </TabsContent>
          <TabsContent value="links">
            <h3 class="text-sm font-semibold text-neutral-500 mb-4">Your Links</h3>
            <DialogMemberLinks @close="closeDialog" />
          </TabsContent>
          <TabsContent value="profile">
            <h3 class="text-sm font-semibold text-neutral-500 mb-4">Your Profile</h3>
            <DialogMemberProfile class="h-full" />
          </TabsContent>
          <TabsContent value="display-preferences">
            <h3 class="text-sm font-semibold text-neutral-500 mb-4">Display Preferences</h3>
            <DialogMemberDisplay />
          </TabsContent>
        </div>
      </Tabs>
    </DialogContent>
  </Dialog>
</template>
