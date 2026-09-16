---
title: Licenses
description: Define usage licenses, attach them to folders, and understand how access checks and download terms work.
sidebar:
  order: 4
lastUpdated: 2026-09-16
---

A license describes under which terms, where and for how long a set of files may be used. Attaching a license affects the public access branch. Owner, admin, group and invitation access can bypass it. The client displays an acceptance checkbox; this is not a server-side record of acceptance.

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

The rules live in `userCollectionsQuery` and `userCollectionFilesQuery` in `server/src/services/collection.ts`. For collections the license is read through the linked asset folder (`collection.asset_folder_id`, then `asset_folder.license_id`); for files it is the file's own `asset_file.license_id`. The check is part of the "public" clause only, which applies to users whose role is neither `admin` nor `guest`:

```
(collection.public IS TRUE AND collection.draft IS FALSE)
AND coalesce(array_length(collection.limited_to_group_ids, 1), 0) = 0
AND (
  <license_id> IS NULL
  OR (
    :regionId = ANY(license.allowed_region_ids)
    AND (license.usage_from IS NULL OR license.usage_from <= now())
    AND (license.usage_to IS NULL OR license.usage_to >= now())
  )
)
```

Read line by line for a member or manager:

1. A collection or file with no license is visible (subject to public, draft and group rules).
2. With a license, the user's `region_id` must be one of `allowed_region_ids`.
3. If `usage_from` is set, it is effective from midnight; `usage_to` must still compare greater than or equal to `now()`. Both are `date` columns: a final date of today does not include the day after midnight in the PostgreSQL session timezone.

A user can also gain access through the other permission rules. In those cases the licence does not block access, even if it has expired or excludes the user's region. This happens when:

- the user is an **admin** (every public collection is visible),
- the user **owns** the collection,
- the user belongs to a **group** listed in `limited_to_group_ids`,
- the user holds a **live invitation** on the collection or one of its ancestors.

Guests cannot use ordinary public access. They see collections they own, collections available to their groups and collections shared with them by invitation. These permissions do not check the licence.

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
