---
title: Downloads
description: How download requests become files or archives, the formats and limits, and when links expire.
sidebar:
  order: 10
lastUpdated: 2026-09-16
---

A download is a request to package one or more visible files, optionally converted, into a single object in the assets bucket. Small requests are built during the request; larger ones are built by the worker and announced by email. Every link expires after 7 days.

## The download record

`downloads` stores who asked, which `collection_files` ids, the chosen conversion options and the progress of the request:

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

| Path | Effective limit |
|---|---|
| Single-file client (`CollectionModalDownloadUnique.vue`) | Direct download through 5,000,000,000 bytes. |
| Multiple-file client (`CollectionModalDownloadMulti.vue`) | Direct download through 2,000,000,000 bytes via `getFiles.allowDirectDownload`, and at most 300 images. The extra 5 GiB check does not raise this limit. Image conversion is disabled above 300 images. |
| Server `download.create` | Rejects total source sizes of 10,000,000,000 bytes or more, for either mode. |

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

The archive worker checks the requester’s current approval, collection access and file licences before preparing the export. If any selected file is no longer accessible, the job fails without producing an archive.

Temporary files are written under the system temp directory and removed when the job ends. `ffmpeg` must be installed on the host; the `server/Dockerfile` provides it.

## Links expire after 7 days

The `download/process-expired` job runs every minute (`* * * * *`). It selects downloads whose `expires_at` is in the past and whose status is not `expired`, deletes the object `downloads/{id}` from the bucket, and sets the status to `expired`. Deleting a user removes their downloads and objects immediately.

`download.list` returns the caller's `ready` and `preparing` downloads, plus `expired` ones updated within the last month, so expired entries remain visible for about 30 days.

## The public download URL

A `ready` download exposes `url` as `API_URL/v1/downloads/{id}`. The route in `server/src/server.ts`:

1. Loads the download; if it does not exist or `expires_at` has passed, redirects to `APP_URL/link-expired`.
2. Otherwise generates a presigned GET URL for `downloads/{id}` and redirects to it.

The route carries no authentication, which is what makes the `Copy URL` action shareable. Anyone holding the link can fetch the object until expiry.

## How download progress appears in the client

`DialogMemberDownloads.vue` shows each download's creation date, expiry date, status and number of files. The `Download` and `Copy URL` buttons are enabled when a download link is available. A green `New` badge highlights email downloads that finished since the dialog was last viewed.

While an email download is still being prepared (`status = preparing`), `client/src/stores/downloadStore.ts` asks `download.list` for updates every 500 ms. This updates the status and badge without reloading the page. The checks stop once no email download is still being prepared. Queue names and schedules are listed in [Background jobs](../reference/background-jobs.md).
