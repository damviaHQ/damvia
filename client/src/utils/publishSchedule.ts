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

// A draft collection's publication time, as a datetime-local value in the
// admin's own time zone.
export function localInput(date: Date | string) {
  const value = new Date(date)
  return new Date(value.getTime() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

export const formatDateTime = (date: Date | string) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(date))

// Why a picked time cannot be used, or null when it can.
export function publishTimeProblem(value: string, now = Date.now()) {
  if (!value) return "Pick the date and time to publish the collection."
  if (new Date(value).getTime() <= now) return "Pick a time in the future to publish the collection."
  return null
}
