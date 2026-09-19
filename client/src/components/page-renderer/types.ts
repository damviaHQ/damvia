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
import type { BlockSize, BlockType } from "server/src/page-blocks/schema"
import type { RouterOutput } from "@/services/server.ts"

export type PageData = RouterOutput["page"]["findById"]
export type PageBlock = NonNullable<PageData["blocks"]>[number]
export type PageAssets = PageData["assets"]
export type Collection = RouterOutput["collection"]["findById"]

// A block that has not been saved yet has no id of its own.
export type EditorBlock = {
  id?: string
  type: BlockType
  size: BlockSize
  data: any
}
