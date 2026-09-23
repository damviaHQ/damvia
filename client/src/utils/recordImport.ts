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
import { parse } from "papaparse"

export type CsvFile = { name: string, columns: string[], rows: Record<string, string>[] }
// Where a CSV column goes: the name of the field it fills (an existing field,
// or a new text field named after the column), or "" to leave it out.
export type ColumnTargets = Record<string, string>
export type ImportStatus = "new" | "changed" | "unchanged" | "invalid" | "duplicate" | "missing_key"
export type ReviewGroup = "new" | "changed" | "unchanged" | "skipped"

export const REVIEW_GROUP_OF: Record<ImportStatus, ReviewGroup> = {
  new: "new",
  changed: "changed",
  unchanged: "unchanged",
  invalid: "skipped",
  duplicate: "skipped",
  missing_key: "skipped",
}

// Spreadsheets leave blank lines, padded headers and cells past the last
// header; none of them is data.
export function cleanCsv(name: string, fields: string[], data: Record<string, unknown>[]): CsvFile {
  const columns = [...new Set(fields.map((field) => field.trim()).filter(Boolean))]
  const rows = data.map((row) => {
    const clean: Record<string, string> = {}
    for (const [column, value] of Object.entries(row)) {
      const name = column.trim()
      if (!name || column === "__parsed_extra") continue
      clean[name] = typeof value === "string" ? value : value == null ? "" : String(value)
    }
    return clean
  }).filter((row) => Object.values(row).some((value) => value.trim() !== ""))
  return { name, columns, rows }
}

export function readCsv(file: File): Promise<CsvFile> {
  return new Promise((resolve, reject) => {
    parse<Record<string, unknown>>(file, {
      header: true,
      skipEmptyLines: "greedy",
      complete: (results) => {
        const csv = cleanCsv(file.name, results.meta.fields ?? [], results.data)
        if (!csv.columns.length) reject(new Error("The file has no header row."))
        else if (!csv.rows.length) reject(new Error("The file has a header row but no data under it."))
        else resolve(csv)
      },
      error: (error) => reject(error),
    })
  })
}

export type WorkbookSheet = { name: string, csv: CsvFile | null, error: string | null }
type SheetCell = string | number | boolean | Date | null | undefined | ((...args: never[]) => unknown)

// A date cell becomes a day, as date fields store it; a date with a time
// keeps the time.
export function cellText(value: SheetCell): string {
  if (value == null) return ""
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return ""
    const iso = value.toISOString()
    return iso.endsWith("T00:00:00.000Z") ? iso.slice(0, 10) : iso.slice(0, 19).replace("T", " ")
  }
  return typeof value === "function" ? "" : String(value)
}

// A sheet read like a CSV: the first row with a value names the columns.
export function sheetToCsv(name: string, data: SheetCell[][]): WorkbookSheet {
  const start = data.findIndex((row) => row.some((cell) => cellText(cell).trim() !== ""))
  if (start < 0) return { name, csv: null, error: "The sheet is empty." }
  const header = data[start].map((cell) => cellText(cell))
  const rows = data.slice(start + 1).map((row) => Object.fromEntries(header.map((column, index) => [column, cellText(row[index])])))
  const csv = cleanCsv(name, header, rows)
  if (!csv.columns.length) return { name, csv: null, error: "The sheet has no header row." }
  if (!csv.rows.length) return { name, csv: null, error: "The sheet has a header row but no data under it." }
  return { name, csv, error: null }
}

// Every sheet of an Excel workbook, in order.
export async function readWorkbook(file: File): Promise<WorkbookSheet[]> {
  const { default: readExcelFile } = await import("read-excel-file/browser")
  const sheets = await readExcelFile(file)
  return sheets.map((sheet) => sheetToCsv(sheet.sheet, sheet.data as SheetCell[][]))
}

// "Shoes", then "Shoes (1)", "Shoes (2)"… when the name is taken, as the
// server names a new table.
export function uniqueTableName(name: string, taken: string[]): string {
  const names = new Set(taken.map((item) => item.toLowerCase()))
  const base = name.trim() || "Table"
  if (!names.has(base.toLowerCase())) return base
  for (let n = 1; ; n++) {
    const candidate = `${base} (${n})`
    if (!names.has(candidate.toLowerCase())) return candidate
  }
}

export function sampleValues(rows: Record<string, string>[], column: string, count = 3): string[] {
  const samples: string[] = []
  for (const row of rows) {
    const value = row[column]?.trim()
    if (value && !samples.includes(value)) samples.push(value)
    if (samples.length === count) break
  }
  return samples
}

// A column goes into the field whose name or display name it carries, case
// aside, or into a new text field named after it. The key column's entry is
// ignored.
export function defaultTargets(columns: string[], fields: { name: string, displayName?: string | null }[] = []): ColumnTargets {
  const match = (column: string) => {
    const wanted = column.trim().toLocaleLowerCase()
    return fields.find((field) => field.name === column)
      ?? fields.find((field) => field.name.toLocaleLowerCase() === wanted || field.displayName?.trim().toLocaleLowerCase() === wanted)
  }
  const taken = new Set<string>()
  return Object.fromEntries(columns.map((column) => {
    const field = match(column)
    const target = field && !taken.has(field.name) ? field.name : column
    taken.add(target)
    return [column, target]
  }))
}

export function mappingErrors(targets: ColumnTargets, keyColumn: string, catalogueKey: string | null): Record<string, string> {
  const errors: Record<string, string> = {}
  const seen = new Map<string, string>()
  for (const [column, target] of Object.entries(targets)) {
    if (!target || column === keyColumn) continue
    if (target === catalogueKey || target === keyColumn) errors[column] = `${target} holds the key; it cannot also be a field.`
    else if (seen.has(target)) errors[column] = `${seen.get(target)} already goes into ${target}.`
    else seen.set(target, column)
  }
  return errors
}

// The rows sent to the server: the key under its column, then each kept
// column under its field. Empty cells are dropped when stored values stay.
export function buildRows(csv: CsvFile, keyColumn: string, targets: ColumnTargets, keepStored: boolean): Record<string, string>[] {
  return csv.rows.map((row) => {
    const out: Record<string, string> = { [keyColumn]: row[keyColumn] ?? "" }
    for (const [column, target] of Object.entries(targets)) {
      if (!target || column === keyColumn) continue
      const value = row[column] ?? ""
      if (keepStored && value.trim() === "") continue
      out[target] = value
    }
    return out
  })
}
