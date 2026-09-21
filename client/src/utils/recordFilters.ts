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
import type { RecordValueType } from "./recordValues"

export type FilterOp = "contains" | "is" | "is_not" | "is_empty" | "is_not_empty" | "has_any"
export type RecordFilter = { column: string, op: FilterOp, value?: string, values?: string[] }

export const FILTER_OPERATORS: Record<FilterOp, string> = { contains: "contains", is: "is", is_not: "is not", is_empty: "is empty", is_not_empty: "is not empty", has_any: "is any of" }

// The conditions a column offers, the first being the default.
export function operatorsFor(type: RecordValueType | "key"): FilterOp[] {
  if (type === "key") return ["contains", "is"]
  if (type === "single_select" || type === "multi_select") return ["has_any", "is_empty", "is_not_empty"]
  if (type === "number" || type === "date") return ["is", "is_not", "is_empty", "is_not_empty"]
  return ["contains", "is", "is_not", "is_empty", "is_not_empty"]
}

// A filter still being written does not narrow the list yet.
export function filterIsComplete(filter: RecordFilter): boolean {
  if (filter.op === "is_empty" || filter.op === "is_not_empty") return true
  if (filter.op === "has_any") return !!filter.values?.length
  return !!filter.value?.trim()
}
