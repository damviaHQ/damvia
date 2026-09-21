---
title: Assets tree
description: Inspect mirrored cloud folders, assign asset types and licences, and diagnose files that have not finished processing.
sidebar:
  order: 7
lastUpdated: 2026-09-21
---

The Assets area is Damvia's mirror of the configured cloud sources. Administrators inspect it and classify folders; source files are added, moved, renamed and removed in Dropbox, OneDrive or Google Drive.

## Inspect a source

Open `/admin/assets`. Each configured source appears at the root with its latest state, item counts and last error when relevant. Opening a folder shows its subfolders and files together with two inherited settings:

- **Asset Type** controls record linkage, search defaults and file presentation.
- **Licence** controls where and when non-admin users may see the files.

Choose values and press **Save** to apply them to that folder, all descendant folders and all files below it. New folders inherit from their parent; every source run refreshes each file from its current folder.

Under the folder defaults, the screen says where the asset type came from: set by hand, set by a named [folder rule](./asset-types.md#assign-it-by-a-rule-on-the-folder-path), inherited from a parent, or not applied yet (a folder created by the last sync, typed by the enrichment pass that follows it). A folder typed by hand keeps that type when it is moved in the cloud storage; every other folder takes the type of its new place. Each folder also stores its path (`/Source/Season/Packshots`), refreshed after every sync, which is what the rules match.

The **Linked record** section of a folder links every file of the folder and its subfolders to one record or one range, by hand, whatever the matching steps find. A section inherited from a parent folder names that folder. See [Records](./records.md#fix-what-matching-could-not).

The type and licence then belong to the file. They follow it into every collection, page block and search result. A collection never replaces them. Moving the file to a different cloud folder gives it the new folder's values on the next run. See [Asset types](./asset-types.md) and [Licences](./licenses.md).

## Understand file status

| Status | Meaning | Action |
|---|---|---|
| `creating` | The source entry exists, but the working copy has not finished processing. | A short-lived state is normal. If it persists, inspect the worker and `asset/update-content` jobs. |
| `up_to_date` | The latest processing attempt completed. | This does not by itself prove the preview exists; open a representative file. |
| `outdated` | Damvia has queued or needs to queue a refreshed working copy. | Check processing progress and source/S3 access. |
| `pending_deletion` | The entry disappeared from its source and awaits cleanup. | Confirm the source change was intended before the deletion job runs. |

Folders use `up_to_date` or `pending_deletion`.

## What processing creates

For a new or changed file, the worker downloads the source into temporary storage, detects a safe MIME type, uploads the original to the assets bucket and tries to generate a WebP preview. It also records image/video dimensions when possible.

Images, videos, PDFs, vector files, office documents, text files and fonts use different external tools. A missing tool or unsupported format can leave the original downloadable without a preview. The required packages are in [Requirements](../getting-started/index.md); targeted repair is in [Integrity check](../deployment/integrity-check.md).

Damvia processes ten asset jobs concurrently. Large first imports can therefore require substantial CPU, memory and temporary disk, especially for video and office files.

## Moving a file currently destroys manual links

When a source file changes folder, Damvia removes all of its collection links before adding links for synchronised collections at the new folder. That removes memberships an administrator added manually and destroys favourites attached to those file-in-collection links. It then assigns the asset type and licence of the new folder.

Renaming or moving a **folder** does not have that effect. Its synchronised collection follows the folder and keeps its identity. The file-move behaviour is a current limitation and is documented in [Known limitations](../reference/known-limitations.md).

## Deleting a source folder affects synchronised collections

Entries absent from a successful source listing are marked `pending_deletion`; the deletion worker removes their asset records and working-copy objects.

A run that cannot account for more than `ASSET_SYNC_MAX_DELETION_PERCENT` of a source, 20 per cent by default and only above 20 missing items, fails instead of marking anything, so a listing truncated by the provider cannot empty the library. The synchronised collections and the custom collections built on those rows survive until an administrator has looked. Raise the value for one run when a large deletion really is intended, then restore it. See [Sources](../integrations/sources.md#how-the-runs-work).

Deleting a source folder also removes collections generated from that folder. Manual collections nested beneath them are rescued under the nearest surviving collection, or moved to the root as drafts when no parent survives. They are marked orphaned for an administrator to review. Hand-placed menu items are rescued in the same way. See [Collections and sharing](./collections-and-sharing.md#custom-collections-survive-inside-a-synchronised-tree).

Collections that merely reference files from the deleted folder keep their other files. Links to the deleted assets disappear, along with favourites attached to those links.

## Diagnose a source that looks incomplete

1. Check the source state and last error at the asset-tree root or on the Dashboard.
2. Confirm the provider credentials, selected root and permissions.
3. Check whether files are stuck in `creating` or `outdated` and whether `asset/update-content` jobs are failing.
4. Verify that both S3 buckets are reachable from the server and that previews are reachable from a browser.
5. Run the integrity check only after fixing the source, worker or storage cause.

An empty listing and any failed item write skip the deletion pass, preventing a transient provider/database failure from being mistaken for mass deletion. See the provider guide and [Troubleshooting](../reference/troubleshooting.md) for the corresponding logs.
