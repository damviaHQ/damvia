---
title: Menu and pages
description: Build the navigation menu and compose pages out of blocks, for the home screen and for collections.
sidebar:
  order: 9
lastUpdated: 2026-09-16
---

The menu is the tree users see in the main layout; pages are block layouts that can be a standalone destination (for example the home page) or the landing view of a collection. Both are administered from the Content Management section.

## Menu items

Rows of `menu_items` form a materialized-path tree with a `position` inside each parent and a `home` flag.

| Type | Points to | `data` keys |
| --- | --- | --- |
| `collection` | `collection_id` | `sync` (boolean) |
| `page` | `page_id` | none |
| `text` | nothing | `text`, `url`, `external` |
| `divider` | nothing | `border`, `spacingTop`, `spacingBottom` |

Items referencing a collection or a page are deleted with it (`ON DELETE CASCADE`), and children go with their parent.

### The screen

`/admin/menu-items` (admin only) shows the tree and an `Add a new item` action. The dialog (`Add item to menu` / `Edit item`) has a `Type` select with `Collection`, `Text/Link`, `Divider` and `Page`; the type and the target cannot change once the item exists. Per type:

- **Collection**: choose an existing collection; `Display and synchronize all sub-collections in the menu` sets `data.sync`.
- **Page**: choose a page from the standalone pages.
- **Text/Link**: a `Text`, an optional `URL` and, when a URL is set, `Open in new tab`.
- **Divider**: `Show a divider line`, `Spacing top` and `Spacing bottom` sliders (0 to 100 px in steps of 5).

Each item's menu offers `Add Item to Collection` (create a child) and, for collection and page items, `Set as Home`. Dragging items calls `menuItem.updatePositions` with the new positions.

### Home, synchronization and visibility

- `menuItem.setHome` clears `home` on every other item and sets it on the chosen one, in one transaction, so that operation selects one home item. A new instance or deletion of that item can leave none; the client then chooses the first accessible collection or its welcome message.
- Creating a collection item with `sync` also creates one child item per descendant collection, each with `data.sync`. From then on, `syncCollectionMenuItems` in `server/src/services/collection.ts` keeps synced items aligned: a new public sub-collection gets an item under each synced parent item, a root public collection gets a root item if it has none, and a collection that becomes non-public loses its items.
- `menuItem.list`, used by every approved user, hides collection items whose collection the user cannot see. An item is still returned when one of its children is visible, but flagged `hasAccess: false`.

## Pages and blocks

A row of `pages` has a `name` and an optional `collection_id`. A unique partial index guarantees at most one page per collection. Blocks are rows of `page_blocks` with a `type`, a `column`, a `row`, a `width` (all integers) and a `data` JSON payload.

| Block type | Editor name | Purpose (editor description) |
| --- | --- | --- |
| `collections` | Collections | List sub-collections or custom selection |
| `files` | Files | Display all files in a collection |
| `last_files` | Last Files | Show recently created files |
| `text` | Text | Add titles or paragraphs |
| `image` | Image | Add banners or decorative images |
| `video` | Video | Embed videos in your collection |

### Standalone pages

`/admin/pages` (admin only) lists pages whose `collection_id` is null with a `Page Name` column and a creation form with a `Name`. Editing happens at `/admin/pages/:id` (`Editing page "..."`) with the block editor from `client/src/components/page-editor/`. `page.findById` only returns standalone pages, which is what a `page` menu item opens.

### Collection pages

`page.createForCollection` is available to whoever can edit the collection. It creates the page and two blocks: a `collections` block at row 0 and a `files` block at row 1, both in column 0 with width 1. The page is returned inside the collection payload, so the collection view renders it in place of the default listing.

### Editing blocks

The block procedures (`addBlock`, `removeBlock`, `updateLayout`, `updateBlockData`) all resolve the page through `findPage` in `server/src/services/page.ts` and then check `Page.canEdit`: an admin can edit any page; another user can edit only a collection page whose collection they can see and own. `updateLayout` rewrites `column`, `row` and `width` for the listed blocks.

Image and video blocks store their file in the **main** bucket:

- On first save, `updateBlockData` assigns `data.s3key = blocks/{pageId}/{uuid}`. Image blocks also keep `data.url` and `data.external` for a linked image.
- `page.presignedUploadUrl` returns a 24-hour PUT URL for that key; the client uploads directly to storage. Other block types get `Unsupported block type.`
- When the block is read back, `formatPageBlock` adds `data.presignedUrl` so the client can display the object.
- `removeBlock` deletes the object with the row.

A `files` block whose collection files share one asset type uses the type's name as its default title; see [Asset types](./asset-types.md). Bucket configuration is described in [Object storage](../integrations/object-storage.md).

:::tip
To make a custom landing page, create a standalone page, add it to the menu as a `Page` item, then use `Set as Home` on that item.
:::
