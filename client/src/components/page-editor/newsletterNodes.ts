/* Damvia - Open Source Digital Asset Manager
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
along with this program.  If not, see <https://www.gnu.org/licenses/>. */
import { mergeAttributes, Node } from "@tiptap/vue-3"

declare module "@tiptap/vue-3" {
  interface Commands<ReturnType> {
    emailImage: { insertEmailImage: (attributes: { src: string, alt?: string, width?: number }) => ReturnType }
    emailButton: { insertEmailButton: (attributes: { href: string, label: string }) => ReturnType }
  }
}

// An image uploaded for a newsletter. The server keeps only its own image
// addresses, so an image pasted from a website does not survive saving.
export const EmailImage = Node.create({
  name: "emailImage",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      src: { default: null },
      alt: { default: "" },
      width: { default: null, parseHTML: element => Number(element.getAttribute("width")) || null },
    }
  },
  parseHTML() {
    return [{ tag: "img[src]" }]
  },
  renderHTML({ HTMLAttributes }) {
    return ["img", mergeAttributes(HTMLAttributes)]
  },
  addCommands() {
    return {
      insertEmailImage: attributes => ({ commands }) => commands.insertContent({ type: this.name, attrs: attributes }),
    }
  },
})

// A call-to-action button: the email shows it in the accent colour.
export const EmailButton = Node.create({
  name: "emailButton",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      href: { default: null },
      label: { default: "", parseHTML: element => element.textContent ?? "" },
    }
  },
  parseHTML() {
    return [{ tag: "a[data-button]", priority: 60 }]
  },
  renderHTML({ node }) {
    return ["a", { "data-button": "", href: node.attrs.href }, node.attrs.label]
  },
  addCommands() {
    return {
      insertEmailButton: attributes => ({ commands }) => commands.insertContent({ type: this.name, attrs: attributes }),
    }
  },
})
