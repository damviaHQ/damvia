<script setup lang="ts">
import { provide, ref } from 'vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Slider } from '@/components/ui/slider'
import { RangeCalendar } from '@/components/ui/range-calendar'
import { Toaster } from '@/components/ui/sonner'
import { toast } from 'vue-sonner'
const props = defineProps<{ neutral: boolean }>()
provide('damvia-admin-theme', !props.neutral)
const checked = ref(false)
const format = ref('original')
const zoom = ref([50])
</script>
<template>
  <section id="production-controls" class="production-controls dv-theme" :class="neutral ? 'dv-neutral dv-client' : 'dv-admin'">
    <header><h2>Production components</h2><p>The controls used in the DAM, with the same interactions in both themes.</p></header>
    <div class="production-controls__grid">
      <div class="dv-panel production-controls__group">
        <h3>Actions and fields</h3>
        <div class="production-controls__row"><Button @click="toast.success('Download prepared')">Download assets</Button><Button variant="outline">Cancel</Button><Button disabled>Unavailable</Button></div>
        <label for="reference-search">Search assets</label><Input id="reference-search" placeholder="Search by name or keyword" />
        <div class="production-controls__row"><Checkbox id="reference-checkbox" v-model="checked" /><label for="reference-checkbox">Include metadata</label><span role="status">{{ checked ? 'Included' : 'Excluded' }}</span></div>
        <label for="reference-format">Download format</label>
        <Select v-model="format"><SelectTrigger id="reference-format"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="original">Original files</SelectItem><SelectItem value="web">Web ready</SelectItem></SelectContent></Select>
        <div class="production-controls__row"><Badge>24 assets</Badge><Badge variant="secondary">Draft</Badge><Badge variant="destructive">Expired</Badge></div>
        <Skeleton class="h-4 w-32" />
      </div>
      <div class="dv-panel production-controls__group">
        <h3>Menus and overlays</h3>
        <div class="production-controls__row">
          <Dialog><DialogTrigger as-child><Button variant="outline">Edit collection</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Edit collection</DialogTitle><DialogDescription>Update the collection name. This preview does not save data.</DialogDescription></DialogHeader><label for="reference-name">Collection name</label><Input id="reference-name" default-value="Autumn campaign" /><DialogFooter><DialogClose as-child><Button variant="outline">Cancel</Button></DialogClose><DialogClose as-child><Button>Save changes</Button></DialogClose></DialogFooter></DialogContent></Dialog>
          <DropdownMenu><DropdownMenuTrigger as-child><Button variant="outline">More actions</Button></DropdownMenuTrigger><DropdownMenuContent><DropdownMenuItem @select="toast('Link copied')">Copy link</DropdownMenuItem><DropdownMenuItem disabled>Delete collection</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
          <TooltipProvider :delay-duration="0"><Tooltip><TooltipTrigger as-child><Button variant="ghost">Help</Button></TooltipTrigger><TooltipContent>Download the original asset files.</TooltipContent></Tooltip></TooltipProvider>
        </div>
        <Tabs default-value="details"><TabsList><TabsTrigger value="details">Details</TabsTrigger><TabsTrigger value="activity">Activity</TabsTrigger></TabsList><TabsContent value="details">24 assets in this collection.</TabsContent><TabsContent value="activity">No recent downloads.</TabsContent></Tabs>
        <label id="reference-zoom">Preview size</label><Slider v-model="zoom" aria-labelledby="reference-zoom" :max="100" :step="1" />
        <RangeCalendar aria-label="Download date range" />
      </div>
    </div>
    <Toaster :neutral="neutral" />
  </section>
</template>
<style>
.production-controls { padding:32px; border-top:1px solid var(--dv-color-line); }
.production-controls header { margin-bottom:24px; }
.production-controls header p { margin-top:8px; color:var(--dv-text-secondary); }
.production-controls__grid { display:grid; grid-template-columns:1fr 1fr; gap:24px; }
.production-controls__group { padding:24px; display:flex; flex-direction:column; align-items:stretch; gap:16px; min-width:0; }
.production-controls__row { display:flex; flex-wrap:wrap; align-items:center; gap:12px; }
.production-controls__group h3 { font-weight:600; }
.production-controls__group label { font-size:13px; }
@media(max-width:760px) { .production-controls { padding:20px; } .production-controls__grid { grid-template-columns:1fr; } }
</style>
