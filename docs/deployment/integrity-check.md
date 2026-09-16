---
title: Integrity check
description: What the daily integrity check compares between the database and the assets bucket, and when to run it by hand.
sidebar:
  order: 8
lastUpdated: 2026-09-16
---

The integrity check is the repair tool for the assets bucket. It runs every day at 05:00 UTC as the `system/integrity-check` job and on demand with `npm run cli -- check-integrity`. Both call `integrityCheck()` in `server/src/services/system.ts`.

## What it does

1. Loads every asset file from the database and lists every object under `asset-file/` in the assets bucket.
2. Keeps an asset file as healthy only if its object exists, the object's size equals the `size` recorded from the cloud storage listing, **and** the row's status is `up_to_date`.
3. Sets every other asset file to `outdated`, saves them, and pushes one `asset/update-content` job per file. The worker downloads the content from Dropbox or OneDrive again, uploads it, rebuilds the WebP thumbnail and sets `up_to_date`.
4. Recomputes `sample_file_ids` for every collection: the first four collection files with a thumbnail, prioritising files in the collection itself, then descendant files by creation date. These are the four images in a collection's thumbnail mosaic.

The console prints `N assets files found to sync` and `Syncing folder thumbnails`. The CLI exits when the queueing is done, not when the downloads are: watch the worker for the actual work.

## When to run it by hand

| Situation | Why it helps |
|---|---|
| The assets bucket was lost or restored from an old copy | Every missing object is re-fetched. |
| A file was replaced in the cloud storage and the change is not visible yet | The sync does not compare checksums, so this is the only automatic refresh, and it needs a size difference. Same-size replacements must be set to `outdated` in SQL. |
| System packages (ffmpeg, ghostscript, libreoffice) were installed after files had synced | Files that got no preview are re-processed. Note that a file whose object exists with the right size and status `up_to_date` is **not** re-queued even without a thumbnail; select the affected ids and mark those rows `outdated` before running the CLI, as below |
| Collection mosaics look empty or stale | Step 4 fixes them without touching files. |

## What it does not do

- It does not compare the database with the cloud storage; that is the 5-minute sync loop.
- It does not delete orphan objects in the bucket (objects with no row). They stay until removed by hand.
- It does not touch the main bucket.
- It does not verify checksums, only sizes.

## Cost

The check lists the whole `asset-file/` prefix once and queries all asset file rows, with memory and database cost proportional to library size. The expensive part is the re-download of whatever it flags, which runs through the worker at 10 files at a time and consumes cloud storage bandwidth.

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
