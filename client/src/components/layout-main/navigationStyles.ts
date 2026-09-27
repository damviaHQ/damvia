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
// Match the dashboard's Lucide menu icons. Toolbars use their own action sizes.
export const menuIconClasses = 'size-4 shrink-0'
export const menuIconSlotClasses = 'grid size-5 shrink-0 place-items-center'
export const sidebarSectionTitleClasses = 'px-3 text-[11px] font-semibold uppercase tracking-[.08em] text-neutral-500'
export const sidebarRowClasses = 'flex h-9 min-w-0 items-center gap-2 px-3 text-left text-body font-medium text-neutral-600 hover:bg-neutral-200/60 hover:text-neutral-950'
export const treeActiveRowClasses = 'bg-neutral-100 text-neutral-900! font-bold!'
export const treeRowClasses = 'cursor-pointer flex h-9 min-w-0 items-center gap-2 pl-px pr-2 text-body font-medium no-underline text-neutral-600 hover:bg-neutral-200 hover:text-neutral-900'

// Start below the expanded chevron; keep the stem on its centre axis.
export const treeConnectorStartClasses = 'pointer-events-none absolute left-[11px] -top-[10px] h-[10px] w-px bg-[#d4d4d4]'
