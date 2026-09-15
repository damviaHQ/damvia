---
title: Downloads
description: How download requests become files or archives, the formats and limits, and when links expire.
sidebar:
  order: 10
lastUpdated: 2026-09-15
---

A download is a request to package one or more visible files, optionally converted, into a single object in the assets bucket. Small requests are built during the request; larger ones are built by the worker and announced by email. Every link expires after 7 days.

## The download record

`downloads` stores who asked, which `collection_files` ids, the chosen options and the lifecycle:

| Field | Values |
| --- | --- |
| `status` | `preparing`, `ready`, `expired` |
| `type` | `direct`, `email` |
| `image_format` | `original`, `png`, `jpg`, `webp` |
| `image_resolution` | `high`, `medium`, `low` |
| `video_format` | `original`, `mp4`, `webm` |
| `video_resolution` | `high`, `medium`, `low` |
| `expires_at` | Creation time plus 7 days |

The object is stored under `downloads/{id}` in the assets bucket (see [Object storage](../integrations/object-storage.md)).

## Create a download

`download.create` (approved users) first re-reads the requested `collection_files` through the visibility query, so files the user cannot see are silently dropped. If the total size of the remaining files is 10 GB or more, it fails with `You cannot download more than 10GB.` It then saves the record with status `preparing` and:

- for `direct`, builds the archive inside the request and returns the record as `ready`;
- for `email`, pushes `download/create-archive`; that job builds the archive, then pushes `mailer/download-ready`, which emails a presigned link to the object.

The client applies stricter defaults before the server limit:

- For a single file, `collection.getFiles` returns `allowDirectDownload` only when the selection is at most 2 GB; otherwise the `Direct download` option is disabled and only `Create a link` remains.
- For several files, `CollectionModalDownloadMulti.vue` disables direct download above 5 GB or above 300 images, and disables PNG, JPG and WebP conversion above 300 images. The email option is described as `A zip is saved for 7 days in My Downloads. You will receive an email with the link when ready.`

License acceptance shown in these dialogs is covered in [Licenses](./licenses.md).

## What the archive contains

`createDownloadArchive` in `server/src/services/download.ts`:

- With one file, uploads the (possibly converted) file directly with a `Content-Disposition: attachment; filename="..."` header.
- With several files, streams a zip with compression level 0 (store only) and places each file at `export/<collection path>/<file name>`, where the path is the chain of collection names from the root. Up to 25 files are fetched and converted in parallel.

Conversions run only on files whose MIME type starts with `image/` or `video/` and only when the format is not `original`; other files are copied as is. The output extension replaces the original one.

| Option | Implementation |
| --- | --- |
| Image `high` / `medium` / `low` | `sharp` quality 100 / 70 / 40 for `jpg`, `webp` and `png` |
| Video `mp4` | ffmpeg with `libx264` |
| Video `webm` | ffmpeg with `libvpx` |
| Video `high` / `medium` / `low` | Scaled to a width of 7680 / 1920 / 720 pixels, height kept proportional |

Temporary files are written under the system temp directory and removed when the job ends. `ffmpeg` must be installed on the host; the `server/Dockerfile` provides it.

## Links expire after 7 days

The `download/process-expired` job runs every minute (`* * * * *`). It selects downloads whose `expires_at` is in the past and whose status is not `expired`, deletes the object `downloads/{id}` from the bucket, and sets the status to `expired`. Deleting a user removes their downloads and objects immediately.

`download.list` returns the caller's `ready` and `preparing` downloads, plus `expired` ones updated within the last month, so expired entries remain visible for about 30 days.

## The public download URL

A `ready` download exposes `url` as `API_URL/v1/downloads/{id}`. The route in `server/src/server.ts`:

1. Loads the download; if it does not exist or `expires_at` has passed, redirects to `APP_URL/link-expired`.
2. Otherwise generates a presigned GET URL for `downloads/{id}` and redirects to it.

The route carries no authentication, which is what makes the `Copy URL` action shareable. Anyone holding the link can fetch the object until expiry.

## The member dialog

`DialogMemberDownloads.vue` lists the downloads with `Creation date`, `Expiration date`, `Status` and `Number of files`, with `Download` and `Copy URL` buttons enabled only when a URL exists. A green `New` badge marks email downloads that became ready since the dialog was last seen.

`client/src/stores/downloadStore.ts` polls `download.list` every 500 ms while an `email` download is `preparing` and stops when none is left, which is how the badge appears without a reload. Queue names and schedules are listed in [Background jobs](../reference/background-jobs.md).
