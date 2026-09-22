import { describe, expect, it } from "vitest"
import { familyKey } from "@/utils/familyKey"

// The same list is checked against the database function in
// server/test/families.cjs, so both sides group products the same way.
const cases: [string, string | null][] = [
  ["Pampa", "pampa"],
  [" pampa ", "pampa"],
  ["PAMPÁ", "pampa"],
  ["Crème  Brûlée", "creme brulee"],
  ["ÀÉÎÕÜ", "aeiou"],
  ["", null],
  ["   ", null],
]

describe("familyKey", () => {
  it("ignores case, accents and stray spaces", () => {
    for (const [input, expected] of cases) {
      expect(familyKey(input), input).toBe(expected)
    }
  })

  it("treats a missing value as no family", () => {
    expect(familyKey(null)).toBeNull()
    expect(familyKey(undefined)).toBeNull()
  })
})
