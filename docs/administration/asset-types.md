---
title: Asset types
description: Categorize files with asset types and control their default display, search inclusion and product linkage.
sidebar:
  order: 6
lastUpdated: 2026-09-20
---

An asset type labels a family of files (product packshots, marketing visuals, documents) and carries defaults that the client applies whenever a set of files shares that type: grid or list view, which columns the list shows, whether the type is searched by default, and whether its files can be linked to products.

## Fields of an asset type

The `/admin/asset-types` screen (admin only) lists `Name`, `Description`, `Related products` and `Include in search by default`. The `Create Asset Type` / `Edit Asset Type` dialog exposes:

| Label | Column | Rule |
| --- | --- | --- |
| `Name *` | `name` | 1 to 30 characters |
| `Description` | `description` | Up to 255 characters |
| `Related to products` | `is_related_to_products` | Boolean, default false |
| `Search by default` | `include_in_search_by_default` | Boolean, default false |
| `Default Display` | `default_display` | `grid` or `list`, default `grid` |
| `PIM attributes displayed in List view` | `list_display_items` | Ordered array of column ids |

The list-view items you can add are `size`, `license`, `format`, `dimensions`, `updated_at`, plus every product attribute flagged as viewable (see [Products and PIM](./products-and-pim.md)). Drag to reorder them, or use the up and down arrow buttons on each column; the order is the column order.

`assetType.list` is available to every approved user because the client needs the types to render collections and the search bar; create, update and remove are admin only. Removing a type sets `asset_type_id` to null on every folder and file that used it.

## Assign a type to a folder

Types are assigned from the [Assets tree](./assets-tree.md). Open a folder at `/admin/assets/:id`, choose a value in the `Asset Type` select (or `No asset type`) and press `Save`. `asset.update` writes `asset_type_id` to the folder, every descendant folder and every file in them, in one transaction.

The asset updater preserves this on each sync (`server/src/services/asset.ts`):

- `upsertFolder` copies the parent's `asset_type_id` to a folder that is new or that changed parent. An existing folder that stays in place keeps its own value.
- `upsertFile` sets `asset_type_id` to the folder's value on every upsert, so a file always mirrors its folder.

A type is therefore effectively a property of a subtree, and the way to type a single file is to put it in its own folder.

## Effect on search

Two places read the flags:

- **Default search state.** The top-bar search input opens a panel of options on focus (`MainSearchBar.vue`): the search mode, the asset types and the scope, worded as a sentence, plus the last 8 searches. The initial `assetTypes` filter is built from the types where `includeInSearchByDefault` is true. Users can change the selection; the client remembers their options in local storage under `damvia_search_options` and the recent searches under `damvia.recentSearches`. On the results page the left column replaces the menu with the search panel (`client/src/components/search/SearchPanel.vue`), which holds what describes the library: the terms, an **Exact phrase** switch that is off by default, a **Where to search** choice between all collections, the current collection with its sub-collections, or the current collection alone, with the collection's name shown above the choices rather than inside each label, an **Asset type** checkbox group where each type shows how many files it would leave in the results, and one group per facetable attribute. What describes the files themselves sits in the toolbar above the results: a **Show** dropdown for all files, images, videos or documents, a **Format** dropdown listing the extensions actually present, such as `JPG` or `PDF`, and a **Size** range. Extensions are read from the file names, so no configuration is needed. Beside it a **Size** dropdown takes a range in megabytes, with either end left empty for no limit, and a reversed range is read smallest first. Both live in the toolbar rather than the panel, because they describe files rather than the library. Each states its own choice on the control itself, so they add no chip; the chips are for what the panel holds.
- **Server filter.** `collection.search` in `server/src/trpc/router/collection.ts` adds `asset_file.asset_type_id IN (...)` when the request carries asset type ids. When the request also filters by product views, it adds `asset_type.is_related_to_products IS TRUE`, so only files of product-related types match a product view filter.

Product views themselves come from the file name matching `PRODUCT_MATCHING_REGEX`; see [Products and PIM](./products-and-pim.md).

## Effect on display

`CollectionRenderFiles.vue` decides how to render a list of files:

1. If a forced view is passed, use it.
2. If the files have no type, or do not all share the same type, use the user's preference stored under the key `asset_file`, defaulting to `grid`.
3. Otherwise use the user's preference for that type id, defaulting to the type's `defaultDisplay`.

Users set their preferences per type in the member dialog (`DialogMemberDisplay.vue`), where each type appears with its name and description, plus an entry named `Other Files without a type`. The defaults shown there are each type's `defaultDisplay`.

In list view, `CollectionDisplayListFiles.vue` resolves a "global" type only when every file has the same `assetTypeId`, then builds the columns as `name`, the type's `listDisplayItems` in order, and `actions`. Mixed lists show only the name and actions columns.

Page blocks of type `files` use the shared type's name as their default title when the block has no title of its own; see [Menu and pages](./menu-and-pages.md).

:::tip
Give product-related types `Related to products` and add the product attributes you want as list columns. Keep purely decorative types out of the default search by leaving `Search by default` unchecked so that searches return product files first.
:::

## Admin interface

The Asset types screen searches names and descriptions and shows 20 results per page. Editing retains product linking, default search inclusion, display mode and column ordering in the themed dialog.

The asset-type modal separates configuration from list columns on desktop and stacks them on mobile. Add/remove column buttons have explicit accessible names, and Cancel is available beside the submit action.
