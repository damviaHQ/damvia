---
title: Collections and sharing
description: Choose manual or synchronised collections, control access, and understand what source changes do to their contents.
sidebar:
  order: 8
lastUpdated: 2026-09-21
---

A collection is the unit people browse and share. Public collections make up the common catalogue; private collections belong to one user. A collection can follow a source folder or be assembled from selected files.

## Choose the right collection type

| Type | Use it when | Behaviour |
|---|---|---|
| Synchronised | A cloud folder should become part of the catalogue | Its name, files and generated sub-collections follow the source folder. Files cannot be added or removed by hand. |
| Manual | You need a curated selection from one or more folders | It stores references to existing assets. An owner or admin can add and remove them. |
| Public | The collection belongs to the shared catalogue | Admins manage it. It may be a draft or restricted to groups. |
| Private | One person needs their own selection | The owner manages it under My collections. |

An admin can create a manual collection at the root or under another collection, including a synchronised one. A synchronised collection may be created at the root or under a manual collection. Under a synchronised parent, source subfolders create their own synchronised children automatically.

Sibling names must be different when a manual collection is created or renamed. Deleting a collection never deletes the corresponding source files.

## Synchronised collections follow folders

On each source run, Damvia aligns a synchronised collection with its source folder:

- the collection takes the folder's current name;
- the folder's current files become the collection's files;
- current subfolders receive matching child collections;
- manual collections nested inside the tree are left alone;
- a source folder that disappears is handled by the deletion and rescue rules below.

Updates for the same synchronised tree are serialised so that two workers do not restructure it at the same time.

### A folder is renamed or moved

Renaming a source folder renames its synchronised collection without changing the collection's identity. Its page, thumbnail, restrictions, invitations and nested content remain attached.

When a folder moves within a part of the source that is already mirrored, its synchronised collection and descendants move beneath the collection for the new parent folder. The moved branch takes the new parent's public/private ownership rules. A restricted destination applies its group restriction to the whole moved subtree; a destination with no restriction leaves the subtree's existing group settings alone. Synced menu entries follow it, and file counts and preview mosaics are recomputed on the old and new branches.

Moving a branch also changes inherited invitation access: invitations on the old ancestors stop covering it, and invitations on its new ancestors begin to cover it.

If Damvia cannot identify one safe destination—for example the new parent is not mirrored, or several candidates exist—the synchronised collection stays in place and is marked **orphaned** for an administrator to resolve. Moving the folder back can heal it; otherwise remove the duplicate/obsolete collection after checking its content.

## Custom collections survive inside a synchronised tree

A manual collection can live under a synchronised one. Synchronisation ignores it, so it survives refreshes and can have its own page. It inherits the visibility of its parent branch and appears beside the generated sub-collections.

If a synchronised source folder is deleted, Damvia removes the collections generated from that folder but rescues custom descendants:

1. Each custom collection moves, with its descendants, beneath the nearest surviving collection.
2. If no ancestor survives, it moves to the root as a draft so it cannot appear publicly by accident.
3. Hand-placed menu items move to the nearest surviving menu entry. Synced entries belonging to the removed branch disappear.
4. The rescued collection is marked **orphaned** and the admin sidebar shows that attention is required.

The Collections screen explains where an orphan came from. After reviewing its location, use **Keep** to clear the warning. Removing the source branch also removes its generated pages, invitations, thumbnails and page uploads after the database change commits; rescued custom collections keep their own content.

## What a file keeps when it is copied into a collection

Adding a file to a manual collection creates a reference; it copies no bytes. The same asset can therefore appear in several collections.

- **Its asset type and licence stay those of its source folder.** A destination collection never replaces them.
- **Collection edits do not change the file.** Renaming or restricting a collection leaves the file's type and licence intact.
- **Moving the file in cloud storage changes them.** On the next source run, the file takes the type and licence of its new folder.

The displayed file count counts collection links, not distinct assets. If a file is mirrored in a child collection and also added manually to an ancestor, it is counted twice.

:::caution
A file moved to another cloud folder currently loses **every** collection link first, including links added by hand, before Damvia recreates links for synchronised collections at the new location. A curated collection can therefore lose that file, and every favourite attached to those links is destroyed. Renaming or moving a **folder** does not have this effect; only moving a **file** does. This is a current limitation, not a completed fix. See [Known limitations](../reference/known-limitations.md).
:::

## Group restrictions follow the collection tree

A public collection with no group restriction is available to approved members and managers, subject to drafts and file licences. A group-restricted collection is available to members of the allowed groups; descendants inherit that restriction.

Groups restrict the collection path. Licences restrict the individual file everywhere it appears. Copying an unrestricted file into a restricted collection restricts access through that collection, but the same file may remain visible elsewhere. Copying a licensed file never removes its licence. See [Licences](./licenses.md).

Draft collections are visible only to admins and their owner. Admins are exempt from file-licence restrictions.

## Share a collection with a guest

An owner or admin can invite an email address to a collection and choose an expiry date. **Send Invite** emails an access link. **Copy Link** creates the invitation without sending it and produces a link that begins the email-login flow.

If the address has no account, Damvia creates an approved guest in the inviter's region with no groups. The invitation gives access to the selected collection and its descendants until the start of the selected expiry date. It gives read/download access, not edit rights.

Removing the invitation ends that access path. It does not remove access gained through ownership, public/group rules or another invitation, and it does not revoke a storage URL that has already been signed. Moving a synchronised collection can change which ancestor invitations cover it.

## Edit and delete safely

An admin can edit any public collection; a private collection's owner can edit their own. Editing can change the name, description, draft state, thumbnail and allowed groups. Public collections cannot be converted to private collections or the reverse.

On `/admin/collections`, those settings are the row's **Settings** action. The row also carries **Open**, which shows the collection as a reader sees it in a new tab, and **Page**, which opens its page editor directly — see [Menu and pages](./menu-and-pages.md#choose-a-standalone-or-collection-page). Leaving that editor returns to the collection, not to the dashboard.

The **Place** setting can move an editable collection under another collection or to the top level. Its whole subtree follows. The move is refused when it would put a collection inside itself, cross the public/private boundary, create a duplicate sibling name, or move a generated synchronised child away from its synchronised parent. Non-admins can move only their own collections beneath another collection they own.

The destination re-derives the moved root's draft and ownership rules. A restricted destination applies its group restriction to the whole subtree; an unrestricted destination keeps the subtree's existing group settings. Synced menu entries follow, and invitation coverage changes with the old and new ancestor paths.

Files cannot be removed from a synchronised collection. A generated synchronised child normally cannot be deleted on its own because the next refresh would recreate it; remove or move the source folder instead. An orphaned synchronised collection can be removed after the ambiguity is resolved.

Deleting a collection removes its descendants, links, invitations, menu entries, page and Damvia-hosted thumbnail/page media. It does not delete any connected cloud file. Before deletion, check for custom descendants and active invitations.

## Narrow what is on screen

The funnel button in a collection's action bar, beside the display preferences, lists the filters that collection can be narrowed by. Nothing is on at first: tick a filter and it appears in a bar above the content. Only what is ticked is drawn, so the page carries the two or three controls that matter there rather than every facet at once.

The bar narrows what the page already draws. It never fetches anything and never looks into sub-collections.

| Filter | Narrows by |
|---|---|
| **Name** | Part of a name, ignoring case, on the files **and** the sub-collections shown on the page. |
| **Asset type**, **File type**, **Format** | The values present on the page, with a count beside each. |
| Each **record attribute** | Its values on the page, for attributes marked viewable. |

Several values inside one filter widen the result; values in different filters narrow it together. A count says how many items picking that value would show, so the other values never read zero. A filter whose page holds a single value is not offered, and only **Name** touches sub-collections: a chip on **Format** hides none of them.

Chips above the content list what is active. Each is removed on its own, **Clear all** empties the bar, and **Remove all filters** in the funnel also takes every filter back off it. Unticking a filter takes its values with it, so nothing keeps narrowing the page unseen.

A section or a page block whose every item is filtered out disappears with its title, so the page does not keep a heading over nothing.

The chosen filters stay across navigation and reloads until they are unticked; they are saved in that browser only, like the display preferences. The values themselves are not: they describe the collection being read, so they start empty on the next one.

In list view, the column headers sort the rows. Clicking a header sorts ascending, clicking it again descending. **Size** sorts by the real byte count and **Updated at** by the real date, not by the text in the cell. Sorting lasts as long as the view; it is not saved.

This filter is not the search. It only sees the current page, and it is not shareable through the URL. To look through a collection and everything under it, use the magnifier in the same action bar, which opens the search scoped to that collection. The search has its own facets, counted across the whole library — see [Products and PIM](./records.md#configure-record-attributes).

## Known operational limits

- Removing a collection link removes favourites attached to that file-in-collection pair.
- A preview mosaic can remain stale after a file leaves until a move/rescue recalculation or the nightly integrity check refreshes it.
- Invitation expiry begins at the start of the selected date in the database session timezone.
- Already issued signed storage URLs have their own lifetime and are not revoked with the invitation.

The complete current list, including file-move data loss, is in [Known limitations](../reference/known-limitations.md).
