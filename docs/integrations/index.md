---
title: Integrations
description: "How Damvia talks to the outside world: one cloud storage driver, an SMTP server, and two S3 buckets."
sidebar:
  order: 1
lastUpdated: 2026-09-15
---

Damvia integrates with three kinds of external services. The cloud storage is where your files already live; Damvia only reads it. SMTP carries every account and notification email. S3-compatible storage holds Damvia's own copies, previews and archives.

| Integration | Direction | Pages |
|---|---|---|
| Dropbox or OneDrive for Business | Read only, polled every 5 minutes | [Dropbox](./dropbox.md), [OneDrive](./onedrive.md) |
| SMTP | Outbound | [SMTP](./smtp.md) |
| S3 / MinIO | Read and write; browsers use presigned URLs | [Object storage](./object-storage.md) |

## Exactly one storage driver per instance

`ASSET_UPDATER` selects the driver class in `server/src/env.ts`: `dropbox` or `onedrive`. Both extend the same base class (`server/src/asset-updater/base.ts`) with three operations: `initialize()`, `fetchUpdates()` and `fetchFileContent()`. Anything else stops the server at startup.

## The sync loop runs every 5 minutes, in every server process

`server/src/index.ts` initialises the driver, then calls `fetchUpdates()` immediately and again 5 minutes after each run finishes (`setTimeout`, not cron). The loop is part of the API process and does not depend on `ENABLE_WORKER`. A failed run is logged as `failed to update assets` and the next one is scheduled anyway; a failed `initialize()` exits the process.

One run does the following:

1. Lists the whole tree from the provider (a full recursive listing for Dropbox, the delta feed for OneDrive).
2. Upserts each folder and file by its provider id (`external_id`): new files get status `creating` and an `asset/update-content` job that downloads the content and builds the preview; existing files are updated in place (name, size, folder, inherited asset type and license). A changed file content is **not** detected here: the listing checksum is stored but not compared, so a file replaced in the cloud storage keeps its old copy until the daily [integrity check](../deployment/integrity-check.md) sees a size difference.
3. Marks every folder and file that was **not** in the listing as `pending_deletion`, in batches of 1,000. The `asset/process-deletion` job removes them a minute later, including their objects in the assets bucket.
4. Inserts a `collection_files` row for every asset file whose folder is linked to a collection, so linked collections pick up new files without waiting for the `collection/synchronization` job.

Step 3 is why an empty listing is treated as an error by the Dropbox driver: it would delete the whole library.

## Damvia never writes to the cloud storage

Assets are downloaded, never uploaded, renamed or deleted at the provider. Renaming or moving a file in the cloud storage keeps its provider id, so Damvia updates the row in place; deleting it in the cloud storage deletes it from Damvia within about six minutes.

## Rate limits and large libraries

The Dropbox driver requests the full listing in pages and pauses 100 ms between folder upserts; the OneDrive driver follows `@odata.nextLink` pages. Downloads of file contents happen in the worker, 10 at a time. For a first import of tens of thousands of files, expect the listing to take minutes and the previews hours; the interface is usable while it fills in.
