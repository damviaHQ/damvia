---
title: Menu and pages
description: Arrange the reader navigation and build editorial pages without changing the assets or collections they display.
sidebar:
  order: 9
lastUpdated: 2026-09-21
---

The menu controls how readers reach content. Pages combine text and media with live collection or file listings. A page presents existing content; it does not move assets, add files to collections or change their permissions.

## Build the navigation menu

Open `/admin/menu-items` to add one of four entries:

| Type | Use it for |
|---|---|
| Collection | Open a public collection. It can optionally keep descendant collection entries in sync. |
| Page | Open a standalone editorial page. |
| Text/Link | Add a label or link to an internal/external address. |
| Divider | Separate menu groups with optional spacing and a line. |

Entries may be nested and reordered among their siblings. A hand-placed menu entry cannot be moved to a different parent directly; recreate it under the intended parent. Moving a collection moves its synchronised menu entries. Collection and page entries can be set as Home. Damvia keeps only one Home entry; if none exists, the client falls back to the first accessible collection or its welcome state.

A synchronised collection menu entry can generate and maintain entries for its descendant collections. A reader receives only the collection entries they are allowed to see. A parent menu label may remain visible as a container when one of its children is accessible.

When a synchronised collection moves with its source folder, its synced menu entries follow. When a deleted synchronised branch contains hand-placed menu items, Damvia moves those items to the nearest surviving menu entry; see [Collections and sharing](./collections-and-sharing.md#custom-collections-survive-inside-a-synchronised-tree).

## Choose a standalone or collection page

A **standalone page** is created under `/admin/pages` and becomes reachable after it is added to the menu. Use it for a home page, campaign overview or guidance that is not owned by one collection.

A **collection page** replaces the default sub-collection/file listing for that collection. Anyone who can edit the collection can edit its page. Until the first save, the editor shows the default arrangement without creating a permanent custom page.

Deleting or resetting a collection page returns the collection to its normal listing. Deleting a standalone page removes menu entries that point to it.

## Compose a page from blocks

Blocks are ordered and use one of three widths: full, half or third. Consecutive narrow blocks share a row when they fit.

| Block | Displays |
|---|---|
| Banner | A focused picture, title, subtitle and optional button. |
| Text | Rich text with headings, emphasis, lists, quotes and links. |
| Picture | One uploaded picture or one accessible library image. |
| Video | An upload, an accessible library video, or a YouTube/Vimeo embed. |
| Collections | The collection's children or a chosen selection. It can focus on custom page collections or plain sub-collections. |
| Files | Files from a collection. |
| Latest files | Recently added files, optionally scoped to a collection. |

Drag a block into the page or add it at the end. Each block can be resized, reordered, duplicated, configured or deleted. Text is edited in place. **Save** writes the full page; **Discard** returns to the last saved version. Leaving with unsaved changes asks for confirmation.

A picture block has its own height: drag the handle on the bottom edge of the picture, or focus it and use the arrow keys. That handle, and the button that changes the picture, sit on the picture itself and stay visible while the page is being edited. Height runs from 80 to 2400 pixels and stops where the picture no longer grows in the width it was given. Pages saved before this control keep their previous size (small, medium, large or full size) as the matching height.

A listing block can leave its display to the reader's own preference, or fix it. Collection listings offer grid and list; file listings — Files and Latest files — also offer masonry, with a Picture size slider whose value everyone then sees. A block that fixes its display overrules the reader's choice, and the reader's display menu says so.

Readers can narrow a page the way they narrow a collection: the funnel button lists the filters the page can offer — name, asset type, file type, format and each product attribute present — and the reader ticks the ones they want. Whatever they tick applies to every listing block at once, in grid, masonry and list alike, and a block whose every item is filtered out disappears with its title. No filter ever applies while the page is being edited, so an author always sees the blocks as they are. See [Collections and sharing](./collections-and-sharing.md#narrow-what-is-on-screen).

Page layouts do not have a history or draft state. Saving publishes the new layout immediately to everyone who can reach it.

## Uploaded media and library files are different

The picture and video blocks offer two ways to supply media, with different security consequences.

### Choose from the library

A library file remains the existing asset. It keeps the type and licence inherited from its source folder, and each reader must still be allowed to see it. If access or licence conditions later hide that file, the page does not receive an unrestricted copy.

The picker limits choices to formats the browser can display. Choosing a file does not add it to the collection behind the page and does not change any file count.

Library originals are often print-resolution files of many megabytes. A picture or banner block displays the preview rendition Damvia generated for that file (WebP, at most 1280 pixels tall) rather than the original, so a page stays light whatever the source weighs. A file with no rendition falls back to its original. Readers download the original only from the file itself, never from the page.

### Upload into the page

An uploaded picture or video is editorial media stored in Damvia's main bucket. It is not an asset, has no asset type or licence, and is visible to anyone who can see the page. Uploading a licensed photograph instead of choosing it from the library therefore removes the licence protection from that page copy.

Use direct uploads for banners, illustrations and logos whose publication rights are managed outside Damvia. Use a library file when its asset licence must remain enforceable.

:::caution
A page upload is protected only by access to the page. Damvia cannot infer or preserve the licence of an external file that an editor uploads directly.
:::

## Link blocks only to accessible content

Collection and file blocks resolve their content for the current reader. A collection or asset they cannot access is omitted rather than exposed through the page. A page cannot use its own collection as a collection card because that would link back to itself.

Banner buttons can point to a collection, page or web address. Standalone page targets are available to admins. Links in rich text are sanitised and limited to `http`, `https` and `mailto`; scripts, styles and unsupported markup are removed.

## Uploaded-file limits and cleanup

Direct picture uploads accept JPEG, PNG, WebP, GIF and AVIF up to 20 MB. They are converted to static WebP and reduced to at most 2400 pixels, so an animated GIF or AVIF loses its animation. Use a video block for animation.

Direct video uploads accept MP4, WebM and MOV up to 500 MB. Uploaded media is staged before validation. Saving a page removes objects that no saved block references, and deleting the page removes its media. Page media belongs to the main bucket and must be included in backups.

## Publishing checks

Before leaving the editor:

1. Save and reopen the page so that every block resolves from stored data.
2. Check it with a non-admin account from a representative region/group; admins are exempt from licence restrictions.
3. Confirm direct uploads are intentional and library files retain the expected licences.
4. Check narrow layouts: half and third blocks remain side by side, so their internal content must still be readable.
5. Verify the intended menu entry and Home setting.

For current layout and upload limitations, see [Known limitations](../reference/known-limitations.md). For main-bucket recovery, see [Backups](../deployment/backups.md).
