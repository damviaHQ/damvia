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
// Shared list geometry for collections and files; thumbnails may make file rows taller.
export const listTableClasses = 'w-full border-collapse text-body text-neutral-600 [&_th]:px-3 [&_th]:py-3 [&_th]:text-left [&_th]:text-caption [&_th]:font-medium [&_th]:whitespace-nowrap [&_td]:px-3 [&_td]:py-3 [&_td]:h-14 [&_td]:align-middle [&_td]:whitespace-nowrap [&_thead]:bg-neutral-50 [&_thead]:border-b [&_thead]:border-neutral-200 [&_tbody_tr]:border-b [&_tbody_tr]:border-neutral-100 [&_tbody_tr:hover]:bg-neutral-50 [&_tbody_tr:focus-within]:bg-neutral-50'
export const listActionsClasses = 'flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100'
