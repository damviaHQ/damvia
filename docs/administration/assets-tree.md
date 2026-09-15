---
title: Assets tree
description: Browse the folder tree synced from cloud storage, tag folders with types and licenses, and understand file statuses and thumbnails.
sidebar:
  order: 6
lastUpdated: 2026-09-15
---

The assets tree is the mirror of the cloud folder Damvia synchronizes from Dropbox or OneDrive. Administrators do not upload files here; they browse what the sync brought in and decide, per folder, which asset type and license apply. Everything else on this page happens in background jobs.

## The screen

`/admin/assets/:id?` (admin only) has a resizable left panel headed `OneDrive Folders` that lists the root folders, and a main panel with a breadcrumb starting at `Assets`. Without an id it shows the root folders; with an id it shows:

- an `Asset Type` select (`No asset type` or one of the types) and a `License` select (`No license` or one of the licenses), followed by a `Save` button,
- the subfolders as folder icons,
- the files with their thumbnail, an extension badge and their name.

`Save` calls `asset.update`, which applies both selects to the folder, all its descendant folders and all files in them. The toast reads `Asset Types and License settings saved`. How each value is used is described in [Asset types](./asset-types.md) and [Licenses](./licenses.md).

:::note
The panel title says `OneDrive Folders` whatever `ASSET_UPDATER` is set to.
:::

## What the sync writes

`server/src/index.ts` starts the updater chosen by `ASSET_UPDATER`, calls `fetchUpdates()` and reschedules it 5 minutes after each run finishes. After every run it inserts any missing `collection_files` rows for files whose folder is linked to a collection. The updater upserts folders and files through `server/src/services/asset.ts`:

| Table | Key | Written fields |
| --- | --- | --- |
| `asset_folders` | `external_id` (unique) | `name`, `parent_id`, `status`, inherited `asset_type_id` and `license_id` on create or move |
| `asset_files` | `external_id` (unique) | `name`, `size`, `mime_type`, `external_checksum`, `folder_id`, `asset_type_id` and `license_id` copied from the folder |

Items that disappeared from the source are flagged `pending_deletion` in batches of 1,000 rather than deleted on the spot. A new file is created with status `creating` and a job is pushed to `asset/update-content`; a file that changed folder has its `collection_files` rows moved to the collections of the new folder.

## File and folder statuses

| Entity | Status | Meaning |
| --- | --- | --- |
| file | `creating` | Row exists, content not yet fetched |
| file | `up_to_date` | Content and thumbnail stored |
| file | `outdated` | Content must be fetched again; set by the daily `system/integrity-check` job when it finds files to re-sync |
| file | `pending_deletion` | Gone from the source, waiting for the deletion job |
| folder | `up_to_date` | Present in the source |
| folder | `pending_deletion` | Gone from the source, waiting for the deletion job |

## The `asset/update-content` job

Processed 10 jobs at a time, `updateFileContent`:

1. Downloads the file from the source through the updater.
2. Detects the MIME type with `file-type` (a `webp` result is stored as `image/webp`; unknown types fall back to `application/octet-stream`).
3. Uploads the original to the assets bucket under `asset-file/{id}` with that `Content-Type`.
4. Generates a thumbnail and uploads it under `asset-file/{id}-thumbnail` as `image/webp`, setting `has_thumbnail`. If no thumbnail can be produced, an existing one is removed.
5. Extracts `width` and `height`: `ffprobe` for videos, `sharp` metadata for images (with pixel limits disabled for TIFF and files over 50 MB), `magick identify` for PSD, and a fixed 1920 by 1280 for fonts.
6. Sets the status to `up_to_date` and deletes the temporary files.

Storage settings are covered in [Object storage](../integrations/object-storage.md).

## Thumbnails by file family

`server/src/services/image-processor.ts` picks a pipeline from the extension or MIME type:

| Family | Extensions | Tool |
| --- | --- | --- |
| Images | `jpg`, `jpeg`, `png`, `gif`, `bmp`, `webp`, `tiff`, `tif`, `svg`, `psd` | `sharp`, with ImageMagick `convert` for the cases sharp cannot read |
| Vector and PDF | `pdf`, `eps`, `ai` | Ghostscript renders the first page to PNG |
| Office and text | `doc`, `docx`, `xls`, `xlsx`, `ppt`, `pptx`, `odt`, `ods`, `odp`, `rtf`, `pps`, `ppsx`, `potx`, `pot`, `html`, `htm`, `xml`, `json`, `md`, `yaml`, `yml`, `txt`, `css`, `js`, `ts`, `csv` | `soffice --headless --convert-to pdf`, then Ghostscript |
| Video | `mp4`, `mov`, `avi`, `mkv`, `wmv`, `flv`, `webm`, `m4v` | ffmpeg extracts a frame |
| Fonts | `ttf`, `otf` | ImageMagick renders a sample text with the font |

Intermediate PNGs are resized to a height of 1,280 pixels and encoded as WebP with `sharp`. Every thumbnail stored in the bucket is WebP. Files outside these families get no thumbnail and the client shows a placeholder.

The `server/Dockerfile` installs the required system packages on `node:20`: `ffmpeg`, `ghostscript`, `libreoffice`, `coreutils` and `imagemagick`. A server running outside that image needs the same tools on its `PATH`.

## The `asset/process-deletion` job

Scheduled every minute (`* * * * *`), `processDeletion` first deletes every file in `pending_deletion`, then every folder in `pending_deletion`:

- `deleteFile` removes the `collection_files` rows, the `asset_files` row, and both objects `asset-file/{id}` and `asset-file/{id}-thumbnail`, in one transaction.
- `deleteFolder` recurses into child folders, deletes their files, deletes every collection whose `asset_folder_id` is the folder, then removes the folder row.

:::caution
Deleting a folder in the cloud source therefore deletes the synchronized collections built on it, and their menu items and page through database cascades. Collections that only copied files from that folder keep their other files.
:::

Job names and schedules are summarized in [Background jobs](../reference/background-jobs.md).
