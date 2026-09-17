/* Damvia - Open Source Digital Asset Manager
Copyright (C) 2026 Arnaud DE SAINT JEAN
This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version. */

export type BreadcrumbNode = {
  id: string
  label: string
}

export type BreadcrumbEllipsisNode = {
  id: '__breadcrumb-ellipsis__'
  label: '…'
  isEllipsis: true
}

export function collapseBreadcrumb<T extends BreadcrumbNode>(
  items: T[],
  headItems = 1,
  tailItems = 2,
): { visibleItems: Array<T | BreadcrumbEllipsisNode>, hiddenItems: T[] } {
  const head = Math.max(1, headItems)
  const tail = Math.max(1, tailItems)

  if (items.length <= head + tail) {
    return { visibleItems: items, hiddenItems: [] }
  }

  return {
    visibleItems: [
      ...items.slice(0, head),
      { id: '__breadcrumb-ellipsis__', label: '…', isEllipsis: true },
      ...items.slice(-tail),
    ],
    hiddenItems: items.slice(head, -tail),
  }
}
