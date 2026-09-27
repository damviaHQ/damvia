<!-- Damvia - Open Source Digital Asset Manager
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
along with this program.  If not, see <https://www.gnu.org/licenses/>. -->
<template>
  <div class="filter-rail min-w-0 max-w-full pb-3">
    <div id="client-page-filters" class="relative min-w-0 w-full" />
  </div>
</template>

<style scoped>
/* Move the whole rail below the breadcrumb before wrapping its controls. */
.filter-rail { flex: 1 1 max-content; }
.filter-rail:not(:has(.page-filter-bar, .search-toolbar)) { display: none; }
.filter-rail :deep(.page-filter-bar) { margin-bottom: 0; padding-bottom: 0; border-bottom: 0; }
.filter-rail :deep(.page-filter-bar),
.filter-rail :deep(.search-toolbar) { width: fit-content; max-width: 100%; margin-left: auto; justify-content: flex-end; }
.filter-rail :deep(.page-filter-bar),
.filter-rail :deep(.search-toolbar),
.filter-rail :deep(.filter-chip-list) { flex-wrap: wrap; }
</style>
