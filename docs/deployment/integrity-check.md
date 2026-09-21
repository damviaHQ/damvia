---
title: Integrity check
description: What the daily integrity check compares between the database and the assets bucket, and when to run it by hand.
sidebar:
  order: 8
lastUpdated: 2026-09-20
---

The integrity check is the repair tool for the assets bucket. It runs every day at 05:00 UTC as the `system/integrity-check` job and on demand with `npm run cli -- check-integrity`. Both call `integrityCheck()` in `server/src/services/system.ts`.

## What it does

1. Loads every asset file from the database and lists every object under `asset-file/` in the assets bucket.
2. Keeps an asset file as healthy only if its object exists, the object's size equals the `size` recorded from the cloud storage listing, **and** the row's status is `up_to_date`.
3. Sets every other asset file to `outdated`, saves them, and pushes one `asset/update-content` job per file. The worker downloads the content from the cloud storage again, uploads it, rebuilds the WebP thumbnail and sets `up_to_date`.
4. Recomputes `number_of_files` and `sample_file_ids` for every collection (`recomputeCollectionRollups`): the count of collection files in the collection and its descendants, and the first four collection files with a thumbnail, prioritising files in the collection itself, then descendant files by creation date. These are the four images in a collection's thumbnail mosaic. The triggers that maintain both columns do not follow tree moves, so this pass is the safety net for counters that drifted.
5. Lists `asset-file/` and `downloads/` again and deletes orphan objects: an original or thumbnail whose asset file row no longer exists, and an archive whose download row is gone, `expired` or `failed`. Only objects last modified more than 24 hours ago are deleted, so a file whose upload is in progress is never touched. The count and the bytes freed are logged as `storage.orphans-removed` and shown on the [dashboard](../administration/dashboard.md).

The console prints `N assets files found to sync` and `Syncing folder counts and thumbnails`. The CLI exits when the queueing is done, not when the downloads are: watch the worker for the actual work.

## When to run it by hand

| Situation | Why it helps |
|---|---|
| The assets bucket was lost or restored from an old copy | Every missing object is re-fetched. |
| A source file changed but its working copy is still stale | The normal sync compares the provider checksum when one is available and queues a refresh. Use the integrity check when that job failed, the provider did not expose the change, or the stored object is missing/has the wrong size. Same-size problems with no checksum change require the targeted procedure below. |
| System packages (ffmpeg, ghostscript, libreoffice) were installed after files had synced | Files that got no preview are re-processed. Note that a file whose object exists with the right size and status `up_to_date` is **not** re-queued even without a thumbnail; select the affected ids and mark those rows `outdated` before running the CLI, as below |
| Collection mosaics look empty or stale | Step 4 fixes them without touching files. |

## What it does not do

- It does not compare the database with the cloud storage; that is the 5-minute sync loop.
- It does not delete objects modified in the last 24 hours, whatever their row says, and it does not touch keys that are not `asset-file/{uuid}`, `asset-file/{uuid}-thumbnail` or `downloads/{uuid}`.
- It does not touch the main bucket.
- It does not verify checksums, only sizes.

## Cost

The check lists the whole `asset-file/` prefix twice (once for the comparison, once for orphans) and `downloads/` once, and queries all asset file rows, with memory and database cost proportional to library size. The expensive part is the re-download of whatever it flags, which runs through the worker at 10 files at a time and consumes cloud storage bandwidth.

## Targeted refresh of a stale original or missing preview

Check the source and affected asset id first. A status change alone does not enqueue work. On the intended maintenance database:

```sql
SELECT id, name, status, size, has_thumbnail
FROM asset_files WHERE id = 'REPLACE_WITH_ASSET_UUID';

UPDATE asset_files SET status = 'outdated'
WHERE id = 'REPLACE_WITH_ASSET_UUID';
```

Then, with the configured server/worker running, execute from `server/`:

```bash
npm run cli -- check-integrity
```

This queues all assets found unhealthy, including the selected one. Check its resulting object and preview, not just its status: the current processing code absorbs some S3/thumbnail errors. Do not update by filename, which need not be unique, or bulk-refresh unsupported formats just because they lack thumbnails. Collection-file deletion alone does not refresh mosaics; the integrity pass recalculates them.

The check also removes abandoned `settings/client-logo-temp/` objects from the main bucket after 24 hours. It never removes the current processed `settings/client-logo.webp` object.
