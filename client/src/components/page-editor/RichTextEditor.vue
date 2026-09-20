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
import { Button } from "@/components/ui/button"
import Link from "@tiptap/extension-link"
import Placeholder from "@tiptap/extension-placeholder"
import StarterKit from "@tiptap/starter-kit"
import { Editor, EditorContent } from "@tiptap/vue-3"
import { BubbleMenu } from "@tiptap/vue-3/menus"
import { Bold, Heading1, Heading2, Heading3, Italic, Link2, List, ListOrdered, Quote } from "@lucide/vue"
import { onBeforeUnmount, shallowRef, watch } from "vue"

const props = defineProps<{ modelValue: string; placeholder?: string }>()
const emit = defineEmits<{ (e: "update:modelValue", value: string): void }>()

// The editor produces exactly the nodes the server sanitizer keeps, so nothing
// an author writes is silently dropped when the page is saved.
const editor = shallowRef(
  new Editor({
    content: props.modelValue || "",
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] },
        code: false,
        codeBlock: false,
        link: false,
      }),
      Link.configure({ openOnClick: false, autolink: true, protocols: ["http", "https", "mailto"] }),
      Placeholder.configure({ placeholder: () => props.placeholder ?? "Write something…" }),
    ],
    onUpdate: ({ editor }) => emit("update:modelValue", editor.isEmpty ? "" : editor.getHTML()),
  })
)

watch(() => props.modelValue, (value) => {
  if (editor.value && value !== editor.value.getHTML()) {
    editor.value.commands.setContent(value || "", { emitUpdate: false })
  }
})

onBeforeUnmount(() => editor.value?.destroy())

function toggleLink() {
  const previous = editor.value?.getAttributes("link").href ?? ""
  const href = window.prompt("Link address", previous)
  if (href === null) {
    return
  }
  if (!href) {
    editor.value?.chain().focus().unsetLink().run()
    return
  }
  editor.value?.chain().focus().extendMarkRange("link").setLink({ href }).run()
}
</script>

<template>
  <div class="rich-text">
    <BubbleMenu v-if="editor" :editor="editor"
      class="flex items-center gap-0.5 rounded-md border border-neutral-200 bg-white p-1 shadow-md">
      <Button type="button" variant="ghost" size="icon" class="size-8" aria-label="Bold"
        :aria-pressed="editor.isActive('bold')" :class="editor.isActive('bold') && 'bg-muted'"
        @click="editor.chain().focus().toggleBold().run()"><Bold class="size-4" /></Button>
      <Button type="button" variant="ghost" size="icon" class="size-8" aria-label="Italic"
        :aria-pressed="editor.isActive('italic')" :class="editor.isActive('italic') && 'bg-muted'"
        @click="editor.chain().focus().toggleItalic().run()"><Italic class="size-4" /></Button>
      <Button type="button" variant="ghost" size="icon" class="size-8" aria-label="Title"
        :aria-pressed="editor.isActive('heading', { level: 1 })" :class="editor.isActive('heading', { level: 1 }) && 'bg-muted'"
        @click="editor.chain().focus().toggleHeading({ level: 1 }).run()"><Heading1 class="size-4" /></Button>
      <Button type="button" variant="ghost" size="icon" class="size-8" aria-label="Heading"
        :aria-pressed="editor.isActive('heading', { level: 2 })" :class="editor.isActive('heading', { level: 2 }) && 'bg-muted'"
        @click="editor.chain().focus().toggleHeading({ level: 2 }).run()"><Heading2 class="size-4" /></Button>
      <Button type="button" variant="ghost" size="icon" class="size-8" aria-label="Subheading"
        :aria-pressed="editor.isActive('heading', { level: 3 })" :class="editor.isActive('heading', { level: 3 }) && 'bg-muted'"
        @click="editor.chain().focus().toggleHeading({ level: 3 }).run()"><Heading3 class="size-4" /></Button>
      <Button type="button" variant="ghost" size="icon" class="size-8" aria-label="Bulleted list"
        :aria-pressed="editor.isActive('bulletList')" :class="editor.isActive('bulletList') && 'bg-muted'"
        @click="editor.chain().focus().toggleBulletList().run()"><List class="size-4" /></Button>
      <Button type="button" variant="ghost" size="icon" class="size-8" aria-label="Numbered list"
        :aria-pressed="editor.isActive('orderedList')" :class="editor.isActive('orderedList') && 'bg-muted'"
        @click="editor.chain().focus().toggleOrderedList().run()"><ListOrdered class="size-4" /></Button>
      <Button type="button" variant="ghost" size="icon" class="size-8" aria-label="Quote"
        :aria-pressed="editor.isActive('blockquote')" :class="editor.isActive('blockquote') && 'bg-muted'"
        @click="editor.chain().focus().toggleBlockquote().run()"><Quote class="size-4" /></Button>
      <Button type="button" variant="ghost" size="icon" class="size-8" aria-label="Add a link"
        :aria-pressed="editor.isActive('link')" :class="editor.isActive('link') && 'bg-muted'"
        @click="toggleLink"><Link2 class="size-4" /></Button>
    </BubbleMenu>
    <EditorContent :editor="editor" class="page-text" />
  </div>
</template>

<style scoped>
.rich-text :deep(.tiptap) { outline: none; min-height: 2rem; }
.rich-text :deep(.tiptap p.is-editor-empty:first-child::before) {
  content: attr(data-placeholder); float: left; height: 0; pointer-events: none; color: var(--dv-text-secondary, #929292);
}
.page-text :deep(h1) { font-size: 2rem; font-weight: 600; padding-bottom: .5rem; }
.page-text :deep(h2) { font-size: 1.5rem; font-weight: 600; padding-bottom: .5rem; }
.page-text :deep(h3) { font-size: 1.25rem; font-weight: 600; padding-bottom: .5rem; }
.page-text :deep(h4) { font-size: 1.125rem; font-weight: 600; padding-bottom: .5rem; }
.page-text :deep(p) { padding-bottom: .5rem; }
.page-text :deep(ul) { list-style: disc; padding-left: 1.5rem; padding-bottom: .5rem; }
.page-text :deep(ol) { list-style: decimal; padding-left: 1.5rem; padding-bottom: .5rem; }
.page-text :deep(blockquote) { border-left: 4px solid var(--dv-color-line, #e2e8f0); padding: .25rem 0 .25rem 1rem; }
.page-text :deep(a) { color: inherit; font-weight: 500; text-decoration: underline; text-decoration-color: color-mix(in srgb, currentColor 35%, transparent); text-decoration-thickness: 1px; text-underline-offset: .2em; transition: text-decoration-color .15s; }
.page-text :deep(a:hover) { text-decoration-color: currentColor; }
</style>
