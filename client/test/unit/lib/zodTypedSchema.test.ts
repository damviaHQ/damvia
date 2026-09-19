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
import { describe, expect, it } from "vitest"
import { z } from "zod"
import { zodTypedSchema } from "@/lib/zodTypedSchema"

const schema = zodTypedSchema(z.object({
  name: z.string().min(1, "Name is required"),
  email: z.email("Invalid email"),
  address: z.object({ city: z.string().min(1, "City is required") }),
}))

describe("zodTypedSchema", () => {
  it("returns the parsed value when valid", async () => {
    const result = await schema.parse({ name: "Ada", email: "ada@example.test", address: { city: "London" } })
    expect(result.errors).toEqual([])
    expect(result.value).toEqual({ name: "Ada", email: "ada@example.test", address: { city: "London" } })
  })

  it("groups messages by dotted field path", async () => {
    const result = await schema.parse({ name: "", email: "nope", address: { city: "" } })
    expect(result.value).toBeUndefined()
    expect(result.errors).toEqual([
      { path: "name", errors: ["Name is required"] },
      { path: "email", errors: ["Invalid email"] },
      { path: "address.city", errors: ["City is required"] },
    ])
  })
})
