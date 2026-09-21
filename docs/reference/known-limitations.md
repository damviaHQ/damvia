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
- Reappearing rows can retain `pending_deletion`.
- A file that moves to another cloud folder loses **every** `collection_files` association first, including the ones an administrator added by hand, before the synchronised associations are recreated at its new folder. A curated selection can therefore lose a file silently because somebody reorganised the cloud storage. A folder rename and a folder move do not have this effect; only the file changing folder does.
- A favourite is stored against the `(file, collection)` pair rather than against the file, so the deletion above destroys every user's favourite on that file, in every collection, with no trace. Deleting a collection does the same to the favourites of its files.
- An empty listing from any provider is ignored so that a permission or path failure cannot empty the library. If any listed folder or file fails to save, the run also skips its deletion pass. This prevents transient item failures from being interpreted as removals, but it leaves stale entries visible until a complete run succeeds.
- Dropbox retries a `401` once after refreshing its token. A second `401` fails the run. OneDrive plans folders in parent-first order before writing them. Provider authentication, rate limits and production-shaped subfolder behaviour still need monitoring on the actual tenant.
- Preview errors are swallowed before a file is marked `up_to_date`; only original upload errors fail the job. Integrity checks validate original size/presence, not preview health.
- Until the first storage measurement after the `storage_usage` migration, stored usage is 0. The quota check then only counts files downloaded since startup, so up to one plan's worth of files can download on top of what is already stored. The first measurement runs within 30 minutes; clicking "Measure now" closes the window immediately.
- S3 credentials in URL username/password fields are not percent-decoded before being passed to MinIO. Use URL-safe credentials until this parser is fixed.

## Collections

- A hand-placed menu item cannot be re-parented on its own; it can only be reordered among siblings. Moving a collection moves its synchronized menu entries, but text, divider and other hand-placed entries must be recreated under a different parent when the collection-rescue rules do not move them automatically.
- `number_of_files` counts `collection_files` rows below a collection rather than distinct files, so a file both mirrored in a sub-collection and copied into an ancestor by hand is counted twice.
- No trigger refreshes `sample_file_ids` when a file leaves a collection, so a thumbnail mosaic can show a file the collection no longer holds until the nightly `system/integrity-check` recomputes it.
- A licence restricts a file, never the collection that shows it, so a file copied into a restricted branch stays as visible as it was. See [Licenses](../administration/licenses.md).

## Pages

- Pictures uploaded to a page are re-encoded to WebP, so an animated GIF or AVIF is flattened to its first frame. Add animation as a video instead.
- Uploads that are staged and never saved stay under `blocks/{pageId}/tmp/` until the next save of that page, which sweeps them up. A page that is abandoned before its first save keeps them until it is deleted.
- A page has no draft state and no history: `Save` publishes, and there is no undo once saved.
- A picture or banner taken from the library is displayed from that file's preview rendition, at most 1280 pixels tall. A library file with no rendition is displayed from its original, which can be a very heavy download.
- A line that mixes widths can leave a gap, for example a `half` block followed by a `third` block. The next block starts a new line rather than filling it.
- Only an admin can point a banner button at a standalone page, because listing pages is an admin-only procedure. Collections and web addresses are available to every author.
- Rolling back the `page-block-layout` migration is lossy: every block returns to a row of its own and banner blocks are deleted.

## Deployment and recovery

Run one server process with `ENABLE_WORKER=true` to handle the API, background tasks and cloud sync. With the flag off, the process can publish jobs but does not process them or register schedules. Source initialisation can overlap queue startup. Failed jobs have a limited number of retries; an interrupted job may already have uploaded a file or sent an email before it runs again. See [Worker and scaling](../deployment/worker-and-scaling.md).

Deleting an owner can fail while private collections still reference that user. Main-bucket uploads cannot be rebuilt from cloud sources. See [Validation status](./validation-status.md) for the checks that passed and the tests still needed on a running instance.
