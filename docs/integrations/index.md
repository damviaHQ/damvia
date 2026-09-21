---
title: Integrations
description: "How Damvia talks to the outside world: one or more cloud storage sources, an SMTP server, and two S3 buckets."
sidebar:
  order: 1
lastUpdated: 2026-09-21
---

Damvia integrates with three kinds of external services. The cloud storage is where your files already live; Damvia only reads it. SMTP carries every account and notification email. S3-compatible storage holds Damvia's own copies, previews and archives.

| Integration | Direction | Pages |
|---|---|---|
| Dropbox, OneDrive for Business or Google Drive, one or several folders | Read only, polled every 5 minutes | [Sources](./sources.md), [Dropbox](./dropbox.md), [OneDrive](./onedrive.md), [Google Drive](./google-drive.md) |
| SMTP | Outbound | [SMTP](./smtp.md) |
| S3 / MinIO | Read and write; browsers use presigned URLs | [Object storage](./object-storage.md) |

## One or several sources per instance

A source is one cloud folder on one account; each becomes a top-level folder of the library. `ASSET_SOURCES` declares any number of them across Dropbox, OneDrive and Google Drive accounts, see [Sources](./sources.md). Without it, `ASSET_UPDATER` (`dropbox`, `onedrive` or `googledrive`) and the provider variables declare a single source, as before. Every source is an instance of a driver class extending `server/src/asset-updater/base.ts`, with three operations: `initialize()`, `fetchUpdates()` and `fetchFileContent()`. An invalid configuration stops the server at startup.

## The sync loop runs every 5 minutes, in every server process

`server/src/index.ts` adopts the rows of a single-source instance upgraded from before sources existed, refuses to start while rows of an unconfigured source key exist (see [Sources](./sources.md#stale-rows-stop-the-server)), initialises every source, then runs the sources one after another, in the order of the list, immediately and again 5 minutes after the last one finishes (`setTimeout`, not cron). The loop is part of the API process and does not depend on `ENABLE_WORKER`. A failed run is logged as `failed to update assets` with the source key, the next source runs anyway, and the cycle is scheduled again. A failed `initialize()` exits the process for Dropbox (token refresh); the OneDrive and Google Drive startup checks only log.

One run of one source does the following:

1. Lists the whole tree from the provider (a full recursive listing for Dropbox, the delta feed for OneDrive, a folder-by-folder listing for Google Drive), all pages first, and turns it into folder upserts (parents first) and file upserts. Every driver stores the pointed folder as the single top-level asset folder and skips hidden, empty and undownloadable items in the same way; see each driver's page for the exact rules and the tests that lock them.
2. Upserts each folder and file by its provider id (`external_id`, unique within the source): new files get status `creating` and an `asset/update-content` job that downloads the content and builds the preview; existing files are updated in place (name, size, folder, inherited asset type and license). A changed listing checksum (`eTag`, `content_hash`, `md5Checksum`) marks the file `outdated` and queues a fresh download; the daily [integrity check](../deployment/integrity-check.md) catches size differences on top.
3. Marks every folder and file **of this source** that was **not** in the listing as `pending_deletion`, in batches of 1,000, unless they exceed `ASSET_SYNC_MAX_DELETION_PERCENT` of the source (see [Sources](./sources.md#how-the-runs-work)). Rows of other sources, and rows of a source key that is no longer configured, are never touched. The `asset/process-deletion` job checks them every minute, including their objects in the assets bucket.
4. Inserts a `collection_files` row for every asset file whose folder is linked to a collection, so linked collections pick up new files without waiting for the `collection/synchronization` job.

After the last source of the cycle, the enrichment pass runs once (`services/enrichment.ts`, logged as `enrichment.asset-types` with the counts): it refreshes the stored path of every folder, applies the [folder rules](../administration/asset-types.md#assign-it-by-a-rule-on-the-folder-path) and writes the resulting asset type to the changed folders and their files. One pass runs at a time, through a Postgres advisory lock; a save or re-apply from the admin waits for a running pass. The pass reads the database only and never calls a provider.

Step 3 is why every driver stops before it on an empty listing, and when any item failed to upsert: either would delete part or all of the library.

## Damvia never writes to the cloud storage

Assets are downloaded, never uploaded, renamed or deleted at the provider. Renaming or moving a file in the cloud storage keeps its provider id, so Damvia updates the row in place; after a source file is deleted, a successful cloud listing marks its Damvia copy for deletion. The deletion job removes that copy on a later pass. This can take longer than six minutes: listings take time, the next sync waits five minutes, and the worker must be running.

## Rate limits and large libraries

The Dropbox driver requests the full listing in pages; the OneDrive driver follows `@odata.nextLink` pages; the Google Drive driver issues one query per folder, 1,000 items per page. Downloads of file contents happen in the worker, 10 at a time. For a first import of tens of thousands of files, expect the listing to take minutes and the previews hours; the interface is usable while it fills in.
