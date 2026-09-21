---
title: Core concepts
description: Understand sources, assets, collections, pages, records and access rules before configuring an instance.
sidebar:
  order: 2
lastUpdated: 2026-09-21
---

Damvia separates the files it discovers from the ways those files are organised and presented. That distinction explains most administrative decisions and prevents accidental assumptions about licences, copies and deletion.

## Sources bring cloud folders into Damvia

A source is one configured folder in Dropbox, OneDrive or Google Drive. Damvia reads it every five minutes and shows it as a top-level folder in the asset tree. Several sources may coexist in one instance.

The source key is Damvia's permanent identity for that source; its label is the name people see. Changing or removing a key requires a maintenance command because every mirrored folder and file carries it. See [Sources](../integrations/sources.md).

## Assets mirror files and folders

An asset folder and asset file represent entries in a configured source. Admins classify folders with an asset type and a licence; files inherit both from their current source folder.

The type and licence belong to the file once assigned. They follow that file wherever Damvia displays it—in synchronised collections, manual collections, search results and page blocks. A collection does not replace them. Moving the source file to another cloud folder changes both values to those of the new folder and currently removes its manual collection links and favourites; see [Known limitations](../reference/known-limitations.md).

Damvia stores a working copy and, when supported, a preview. Unsupported formats remain downloadable without a preview.

## Collections organise assets for readers

A collection is a browsable group of files and child collections.

- A **synchronised collection** follows one asset folder. Its files and generated sub-collections follow the source tree; they cannot be edited by hand.
- A **manual collection** contains references to selected assets. Adding a file does not duplicate the source file or change its type or licence.
- A **public collection** belongs to the shared catalogue. A **private collection** belongs to one user.

Custom collections may be nested inside synchronised trees. Current movement, deletion, orphan recovery and sharing rules are documented in [Collections and sharing](../administration/collections-and-sharing.md).

## Groups restrict collections; licences restrict files

These two controls operate at different levels:

| Control | Attached to | Follows |
|---|---|---|
| Group restriction | Collection | The collection tree and its descendants |
| Licence | Asset file, inherited from its source folder | The file everywhere it appears |

Copying a licensed file into another collection does not remove its licence. Copying an unrestricted file into a group-restricted collection limits access through that collection, but the file can remain visible elsewhere. Admins are exempt from licence restrictions, so test licence behaviour with a non-admin account. See [Licenses](../administration/licenses.md) and [Roles and access](./roles-and-access.md).

## Pages present content without changing it

A page arranges banners, text, pictures, videos, collections, files and latest-file listings. It may stand alone in the menu or replace the default layout of a collection.

A block that points to a library file displays that asset with its existing access and licence rules. A picture or video uploaded directly into the page is editorial media in Damvia's main bucket; it is not a library asset and has no asset licence. A block never adds a file to the collection behind the page. See [Menu and pages](../administration/menu-and-pages.md).

## Records enrich assets

Records describe what files are about: products, events, venues. They are imported from CSV and named by an administrator. Damvia applies `PRODUCT_MATCHING_REGEX` to filenames, links a matching file to its record key and can record an optional view such as front, side or detail.

Selected record columns become searchable text, filters or displayed metadata. This enriches the asset; it does not move or rename the source file. See [Records](../administration/records.md).

## People receive access through several rules

Accounts have one role and one region, and may belong to several groups. A person can see a collection because it is public, they own it, a group allows it, or they hold an active invitation. File licences add a second check for every non-admin user.

Invitations can extend through descendant collections. Moving a collection within a synchronised tree can therefore change which ancestor invitation covers it. [Roles and access](./roles-and-access.md) contains the exact access matrix.

## Downloads create temporary deliverables

A download packages the files the requester can still access, optionally converting supported images or videos. Links expire after seven days. Revoking access prevents a queued archive from being prepared, but does not revoke an already issued signed storage URL immediately. See [Downloads](../administration/downloads.md) and [Accounts and links](../administration/accounts-and-links.md).
