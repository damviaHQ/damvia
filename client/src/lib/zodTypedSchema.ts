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
import type { TypedSchema } from "vee-validate"
import type { z } from "zod"

// Adapts a zod 4 schema to vee-validate's typed schema contract. Replaces
// @vee-validate/zod, which only supports zod 3.
export function zodTypedSchema<Schema extends z.ZodType>(schema: Schema): TypedSchema<z.input<Schema>, z.output<Schema>> {
  return {
    __type: "VVTypedSchema",
    async parse(values) {
      const result = await schema.safeParseAsync(values)
      if (result.success) {
        return { value: result.data, errors: [] }
      }
      const byPath = new Map<string, string[]>()
      for (const issue of result.error.issues) {
        const path = issue.path.map(String).join(".")
        byPath.set(path, [...(byPath.get(path) ?? []), issue.message])
      }
      return { errors: [...byPath].map(([path, errors]) => ({ path, errors })) }
    },
  }
}
