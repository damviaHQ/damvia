---
title: Menu and pages
description: Build the navigation menu and compose pages out of blocks, for the home screen and for collections.
sidebar:
  order: 9
lastUpdated: 2026-09-20
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

Each item's menu offers `Add Item to Collection` (create a child) and, for collection and page items, `Set as Home`. Items with children expand and collapse from their row. Dragging items, or choosing `Move up` / `Move down` in an item's menu, calls `menuItem.updatePositions` with the new positions of its siblings; a keyboard move announces the new position to screen readers.

### Home, synchronization and visibility

- `menuItem.setHome` clears `home` on every other item and sets it on the chosen one, in one transaction, so that operation selects one home item. A new instance or deletion of that item can leave none; the client then chooses the first accessible collection or its welcome message.
- Creating a collection item with `sync` also creates one child item per descendant collection, each with `data.sync`. From then on, `syncCollectionMenuItems` in `server/src/services/collection.ts` keeps synced items aligned: a new public sub-collection gets an item under each synced parent item, a root public collection gets a root item if it has none, and a collection that becomes non-public loses its items.
- `menuItem.list`, used by every approved user, hides collection items whose collection the user cannot see. An item is still returned when one of its children is visible, but flagged `hasAccess: false`.

## Pages and blocks

A row of `pages` has a `name` and an optional `collection_id`. A unique partial index guarantees at most one page per collection. Blocks are rows of `page_blocks`: a `type`, a `position` in the page and a `size`, plus a `data` payload in `jsonb`.

Blocks are an ordered list, not a grid. Each one is `full`, `half` or `third` of the page width, and the browser packs consecutive narrow blocks onto the same line: two `half` blocks sit side by side, three `third` blocks make a row of three, and a `full` block always starts a new line. Authors choose nothing else about layout; there is no padding, margin, colour or font setting anywhere in the editor.

| Block type | Editor name | What it shows |
| --- | --- | --- |
| `hero` | Banner | A picture with a title, a subtitle and an optional button |
| `text` | Text | Titles and paragraphs |
| `image` | Picture | One picture, held to a chosen height, with a description for screen readers, an optional caption and an optional link |
| `video` | Video | An uploaded video, a library file, or a YouTube or Vimeo address |
| `collections` | Collections | Sub-collections, or a chosen selection |
| `files` | Files | Every file of a collection |
| `last_files` | Latest files | Recently added files |

Each block type has its own payload, defined once in `server/src/page-blocks/schema.ts` and imported by the client, so the editor and the server agree on what is valid. A picture carries its `height`, and a banner carries the `focus` point that decides which part of it stays in frame; both have defaults, so blocks saved before these existed keep working. Pictures and videos hold a reference rather than an address: either `{ source: 'upload', s3key }` for a file uploaded to the page, or `{ source: 'file', fileId }` for a file already in the library. Videos also accept `{ source: 'embed', provider, videoId }`.

### The editor

Editing a page is its own screen, at `/collections/:id/edit` for a collection page and `/admin/pages/:id` for a standalone one. The navigation tree and the top bar are replaced, so nothing competes with the page being edited:

- The **left sidebar is the block library**. Drag a block onto the page to insert it where you drop it, or click it to add it at the end.
- The **top bar** names the page, says whether there are unsaved changes, and holds `Discard`, `Save` and `Exit`.
- **Each block carries a toolbar** on hover or keyboard focus: a drag handle, the three width buttons, `Move block up` and `Move block down`, a settings popover for the types that have options, `Duplicate block` and `Delete block`. A keyboard move announces the block's new position to screen readers.
- **Text is written on the page itself.** Selecting text raises a small toolbar with bold, italic, two heading levels, lists, quote and link.
- **Pictures and videos open a chooser** with two tabs: upload a file, or pick one from the library, where each picture is shown in its own proportions. The library tab searches the same index as the rest of the application, without recording the search as library activity. Video has a third tab for a YouTube or Vimeo address. A chosen picture appears in the block straight away, before the page is saved.
- **A picture keeps its proportions** and is held to Small, Medium, Large or Full size, chosen in the block settings, so a large original does not take over the page. A banner picture fills its frame instead, and two compact controls on the picture itself let the author change it or drag, or arrow-key, the part that stays in view.
- **Nothing inside a block responds to a reader's gestures while editing.** Collections and files are shown as they will appear, but they cannot be opened, selected or followed, so a click always acts on the block.
- **An empty listing says what will fill it.** A collections or files block with nothing to show explains what it is for and why it is empty, rather than reporting that nothing was found.
- **A block dropped beside a narrower one takes the room that is left**, so dragging something next to a half-width block does not push it onto a line of its own.

Nothing is written until `Save`, which sends the whole page in one call. `Discard` returns the page to its last saved state, and leaving with unsaved changes asks for confirmation.

### Standalone pages

`/admin/pages` (admin only) lists pages whose `collection_id` is null, with a `Page Name` column and a creation form. `page.findById` only returns standalone pages, which is what a `page` menu item opens.

### Collection pages

`page.createForCollection` is available to whoever can edit the collection. It creates the page with a `collections` block and a `files` block, both full width. The page is returned inside the collection payload, so the collection view renders it in place of the default listing.

### Permissions and stored files

`page.save` and the upload procedures resolve the page through `findPage` in `server/src/services/page.ts` and then check `Page.canEdit`: an admin can edit any page; another user can edit only a collection page whose collection they can see and own. A page someone cannot reach is reported as missing rather than forbidden, so the editor never confirms that a page exists to someone who cannot see it.

What a block points at is resolved for whoever is reading it. A page is returned with an `assets` map holding the addresses of its pictures, files, collections and pages, built for that reader: a file they are not allowed to open simply does not appear, and the block renders nothing rather than a broken or leaked link.

Pictures and videos live in the **main** bucket under `blocks/{pageId}/`:

- `page.createUpload` returns a ten-minute presigned POST to `blocks/{pageId}/tmp/{uploadId}`, restricted to JPEG, PNG, WebP, GIF and AVIF up to 20 MB, or MP4, WebM and MOV up to 500 MB.
- `page.finalizeUpload` checks the staged file, re-encodes pictures to WebP no larger than 2400 px, verifies that a video really is one, and moves it to `blocks/{pageId}/{uuid}`. The staged copy is always removed, including when the file is rejected.
- Saving a page deletes every object under its prefix that no block refers to any more, which also clears uploads that were added and then discarded.
- Deleting a page, or the collection that owns it, deletes its objects.

Text is sanitised on the way in and on the way out: only paragraphs, headings, basic emphasis, lists, quotes, rules and links survive, links are limited to `http`, `https` and `mailto`, and any style, class or script is dropped.

A `files` block whose collection files share one asset type uses the type's name as its default title; see [Asset types](./asset-types.md). Bucket configuration is described in [Object storage](../integrations/object-storage.md).

:::tip
To make a custom landing page, create a standalone page, add it to the menu as a `Page` item, then use `Set as Home` on that item.
:::

## Admin interface

Menu items use square rows and themed action menus, with an empty state and ordering instructions. The Pages list searches names and paginates at 20 rows. Editing a page from the Pages list opens the same editor screen as a collection page, so the admin sidebar gives way to the block library; `Exit` returns to the list.

The menu-item editor uses the shared shadcn dialog, including a close button, Cancel, loading protection and visible save errors. The page editor has its own full-height layout, with the block library on the left and the page on a white sheet at a readable width.
