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
import type { EditorBlock } from "@/components/page-renderer/types"
import { Clock, Files, FileText, Image, LayoutGrid, LayoutPanelTop, PackageSearch, Video } from "@lucide/vue"
import { emptyBlockData, type BlockType } from "server/src/page-blocks/schema"

export type LibraryItem = {
  type: BlockType
  name: string
  description: string
  icon: typeof LayoutGrid
}

// What an author can add, in the order they are most likely to want it.
export const BLOCK_LIBRARY: LibraryItem[] = [
  { type: "hero", name: "Banner", description: "A picture with a title and a button", icon: LayoutPanelTop },
  { type: "text", name: "Text", description: "Titles and paragraphs", icon: FileText },
  { type: "image", name: "Picture", description: "Upload one or pick it from the library", icon: Image },
  { type: "video", name: "Video", description: "A file or a YouTube or Vimeo link", icon: Video },
  { type: "collections", name: "Collections", description: "Sub-collections or a chosen selection", icon: LayoutGrid },
  { type: "files", name: "Files", description: "Every file of a collection", icon: Files },
  { type: "last_files", name: "Latest files", description: "Recently added files", icon: Clock },
  { type: "products", name: "Products", description: "The products of a collection", icon: PackageSearch },
]

export function libraryItem(type: BlockType) {
  return BLOCK_LIBRARY.find((item) => item.type === type)
}

// What a collection looks like before anyone arranges it: the editor opens on
// these, so the author starts from the layout readers already see.
export function defaultCollectionBlocks(): EditorBlock[] {
  return [
    { type: "collections", size: "full", data: emptyBlockData("collections") },
    { type: "files", size: "full", data: emptyBlockData("files") },
  ]
}
