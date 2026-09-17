---
title: Licenses
description: Define usage licenses, attach them to folders, and understand how access checks and download terms work.
sidebar:
  order: 5
lastUpdated: 2026-09-17
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

There is no per-file license in the UI.

## How a license hides collections and files

The server checks two things before returning content: the user must have access to the collection, and every non-admin user must meet the licence’s conditions. Being an owner, joining an allowed group or receiving an invitation does not remove the licence requirement.

1. Content without a licence remains subject to the collection’s ordinary access rules.
2. Licensed content requires the user’s region in `allowed_region_ids`.
3. Optional start and end dates are inclusive, using the PostgreSQL session’s current date. A licence ending today remains valid throughout today.

`userCollectionsQuery` checks the linked asset folder’s licence. `userCollectionFilesQuery` checks each file’s licence. Search, favourites, copies and new downloads use these rules. Archive jobs check access again before preparing the files; a revoked or expired selection is not exported.

Admins retain access to licensed content within the collections they can manage. Guests need an invitation, ownership or an explicitly assigned group, and must meet the same licence conditions as other non-admin users.

:::note
A manual (non-synchronized) collection has no asset folder, so the collection itself always passes the license check. Its files are still filtered one by one through `asset_file.license_id`, which means a collection can be visible while some of the files copied into it are hidden.
:::

## Client acceptance is not server enforcement

Every file returned to the client carries its license as `{ id, name, scopes, details, allowedRegionIds, expired }`. The two download dialogs use it:

- `CollectionModalDownloadUnique.vue` (one file) shows the license name, its scopes in upper case, and a `Checkbox` labelled `By downloading this asset, I hereby agree to respect the Asset Usage Licensing Agreement.` If `details` is set, clicking the name opens a dialog that renders them.
- `CollectionModalDownloadMulti.vue` (several files) calls `collection.getFiles`, which returns the distinct licenses across the selection, lists each one, and shows the same checkbox with the plural wording `By downloading these assets, ...`.

In both dialogs the download button stays styled as inactive until the box is checked, and pressing it anyway shows the error `Please accept the terms and conditions to proceed with the download.` The acceptance is enforced in the client only; `download.create` on the server does not receive or check it. What the server does check is visibility: a file the user cannot see because of its license is not returned by `userCollectionFilesQuery`, so it cannot be added to a download.

## Regions show how many licenses cover them

`/admin/regions` displays a `Licenses` column computed with `ArrayContains` on `allowed_region_ids`. Use it before removing a region to see how many licenses will lose that region.

## Admin interface

The Licenses screen has name search, a result count and pagination at 20 rows. The editor retains usage dates, scopes and allowed regions; repeated submissions are disabled while saving.

The license form uses a responsive two-column layout with its action footer in normal document flow, so the editor remains usable on narrow screens. Clear-date buttons have accessible names.

The license editor uses the wide modal layout with a separated action footer; mobile layouts stack the form fields and usage details.
