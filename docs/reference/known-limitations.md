---
title: Known limitations
description: Operational limitations affecting synchronisation, recovery and deployment.
sidebar:
  order: 7
lastUpdated: 2026-09-20
---

This page tracks operational limitations that remain in the application. For installation checks, see [Validation status](./validation-status.md) and [Acceptance checklist](../deployment/acceptance-checklist.md).

## Synchronisation and storage

- The sync queues every `creating` file again on each 5-minute pass, including a file whose first download is still running, so a very large file can be downloaded and uploaded twice. The second job skips the file once the first has marked it `up_to_date`.
- Reappearing rows can retain `pending_deletion`. A file move removes its existing `collection_files` associations, including curated copies, before adding synchronised associations at the new location.
- Dropbox ignores a completely empty listing. If saving an individual file or folder fails, however, it can continue without adding that item to the list of assets to keep. The deletion step can then mark it for removal. Repeated authentication failures (HTTP 401) have no fixed retry limit.
- OneDrive has no empty-listing guard and relies on feed order for parent resolution. Use the full-drive `root` recipe; Business subfolder delta has not been validated.
- Preview errors are swallowed before a file is marked `up_to_date`; only original upload errors fail the job. Integrity checks validate original size/presence, not preview health.
- Until the first storage measurement after the `storage_usage` migration, stored usage is 0. The quota check then only counts files downloaded since startup, so up to one plan's worth of files can download on top of what is already stored. The first measurement runs within 30 minutes; clicking "Measure now" closes the window immediately.
- S3 credentials in URL username/password fields are not percent-decoded before being passed to MinIO. Use URL-safe credentials until this parser is fixed.

## Pages

- Pictures uploaded to a page are re-encoded to WebP, so an animated GIF or AVIF is flattened to its first frame. Add animation as a video instead.
- Uploads that are staged and never saved stay under `blocks/{pageId}/tmp/` until the next save of that page, which sweeps them up. A page that is abandoned before its first save keeps them until it is deleted.
- A page has no draft state and no history: `Save` publishes, and there is no undo once saved.
- A picture or banner taken from the library is displayed from that file's preview rendition, at most 1280 pixels tall. A library file with no rendition is displayed from its original, which can be a very heavy download.
- A line that mixes widths can leave a gap, for example a `half` block followed by a `third` block. The next block starts a new line rather than filling it.
- Only an admin can point a banner button at a standalone page, because listing pages is an admin-only procedure. Collections and web addresses are available to every author.
- Rolling back the `page-block-layout` migration is lossy: every block returns to a row of its own and banner blocks are deleted.

## Deployment and recovery

Run one server process with `ENABLE_WORKER=true` to handle the API, background tasks and cloud sync. With the flag off, requests may fail when they try to queue work. The first sync can also start before the database and worker are ready. Failed jobs have a limited number of retries; an interrupted job may already have uploaded a file or sent an email before it runs again. See [Worker and scaling](../deployment/worker-and-scaling.md).

Deleting an owner can fail while private collections still reference that user. Main-bucket uploads cannot be rebuilt from Dropbox or OneDrive. The client type check fails even though its bundle builds. See [Validation status](./validation-status.md) for the checks that passed and the tests still needed on a running instance.
