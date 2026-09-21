---
title: Licenses
description: Define usage licenses, attach them to folders, and understand how access checks and download terms work.
sidebar:
  order: 5
lastUpdated: 2026-09-20
---

A license describes under which terms, where and for how long a set of files may be used. Licence dates and allowed regions apply to every non-admin user, including owners, group members and invitees. Admins are exempt. The client displays an acceptance checkbox; this is not a server-side record of acceptance.

## Fields of a license

The `/admin/licenses` screen (admin only) lists `Name`, `Usage from`, `Usage to` and `Scopes`. The `Create License` / `Edit License` dialog exposes:

| Field | Column | Rule |
| --- | --- | --- |
| `Name *` | `name` | Up to 50 characters |
| `Usage From` | `usage_from` | Optional date; the license is inactive before it |
| `Usage To` | `usage_to` | Optional date; the license is inactive after it |
| `Usage Scopes *` | `scopes` | Array of `print` and/or `digital` |
| `Allowed Regions *` | `allowed_region_ids` | Array of region ids |
| `Details` | `details` | Free text, rendered as HTML in the download dialog |

Licenses are listed newest first. Removing a license sets `license_id` to null on every `asset_folders` and `asset_files` row that used it, then deletes the row. Removing a region strips its id from every license; see [Groups and regions](./groups-and-regions.md).

## Attach a license to a folder

Licenses are assigned from the [Assets tree](./assets-tree.md), not from the license screen. Open a folder under `/admin/assets/:id`, pick a value in the `License` select (or `No license`) and press `Save`. The `asset.update` procedure writes `license_id` to the folder, to **every descendant folder**, and to **every file inside those folders**, in one transaction.

The sync process keeps that inheritance alive:

- A folder that is new or that moved to another parent copies its parent's `license_id` (`upsertFolder` in `server/src/services/asset.ts`).
- A file always takes its folder's `license_id` each time the asset updater upserts it, so the file level never diverges from the folder level.

There is no per-file license in the UI. One consequence is worth planning for: a file moved to another folder in the cloud storage takes the new folder's licence on the next sync pass, so a file can change licence without anyone editing a licence or touching a collection. Everyone who was being shown that file, including through a copy in another collection or a page block, is affected on the next read.

## How a license hides collections and files

The server checks two things before returning content: the user must have access to the collection, and every non-admin user must meet the licence’s conditions. Being an owner, joining an allowed group or receiving an invitation does not remove the licence requirement.

1. Content without a licence remains subject to the collection’s ordinary access rules.
2. Licensed content requires the user’s region in `allowed_region_ids`.
3. Optional start and end dates are inclusive, using the PostgreSQL session’s current date. A licence ending today remains valid throughout today.

Collection listings check the linked asset folder's licence and file listings check each file's licence. Search, favourites, copies and new downloads use the same rules. Archive jobs check access again before preparing files, so a revoked or expired selection is not exported.

Admins retain access to licensed content within the collections they can manage. Guests need an invitation, ownership or an explicitly assigned group, and must meet the same licence conditions as other non-admin users.

:::note
A manual (non-synchronized) collection has no asset folder, so the collection itself always passes the license check. Its files are still filtered one by one through `asset_file.license_id`, which means a collection can be visible while some of the files copied into it are hidden.
:::

## A licence follows the file, not the collection

A licence is a property of the asset. It is set on a folder of the [Assets tree](./assets-tree.md) and copied down to the files inside it. It is never a property of the collection that happens to show the file. Two consequences matter as soon as a collection mixes content from several folders:

- **Copying a file into another collection does not change its licence.** `collection.addItems` records a reference to the same `asset_files` row, so the file keeps the licence of the folder it actually lives in, wherever it is shown.
- **A collection does not apply its licence to what is placed inside it.** A synchronized collection whose folder is restricted to one region does not restrict a file copied in from an unrestricted folder. That file stays visible everywhere, inside that collection.

The reverse direction is safe. A file carrying a restrictive licence stays restricted in every collection, page block and search result that shows it, so no copy and no curated selection can widen its reach. The two ways of narrowing access are therefore not interchangeable:

| Restriction | Set on | Applies through |
| --- | --- | --- |
| Group restriction | The collection | The collection tree, inherited by child collections |
| Licence regions and dates | The cloud folder | The file itself, in every collection, page and search result that shows it |

To restrict who may see one file, set a licence on the folder it comes from. To restrict who may open a collection assembled by hand, use groups; see [Groups and regions](./groups-and-regions.md).

:::caution
An administrator cannot reproduce a licence problem by looking. Admins are exempt from the licence check, so a file hidden from a member by its region or its dates is still perfectly visible to an admin. When someone reports that a file disappeared, compare the licence on that file's origin folder with the region of the person who reported it, rather than opening the collection yourself.
:::

## Client acceptance is not server enforcement

The single-file and multi-file download dialogs show the applicable licence names, scopes and details and require the user to tick an acceptance checkbox before continuing. This is a client-side acknowledgement only: Damvia does not store an acceptance record and the download API does not receive one.

The server separately enforces visibility. A file hidden by its licence is not offered to the requester and cannot be added to a new download. A queued archive checks access again before it is built.

## Regions show how many licenses cover them

`/admin/regions` displays how many licences include each region. Check that count before removing a region so you know how many licence rules will change.
