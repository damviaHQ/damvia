---
title: Google Drive
description: Create a service account, share one folder with it and point Damvia at that folder, on My Drive or a shared drive.
sidebar:
  order: 4
lastUpdated: 2026-09-19
---

The Google Drive driver (`server/src/asset-updater/google-drive.ts`) lists one Drive folder, folder by folder, every 5 minutes with a service account and downloads file contents on demand. Nothing is written to Drive. It behaves like the [OneDrive](onedrive.md) and [Dropbox](dropbox.md) drivers and gives the same tree: the pointed folder is the single top-level asset folder, the same kinds of items are skipped, the same protections surround deletion.

## Variables

| Variable | Value |
|---|---|
| `ASSET_UPDATER` | `googledrive` |
| `GOOGLE_DRIVE_SERVICE_ACCOUNT` | The service account's JSON key, base64-encoded (`base64 -w0 key.json`) or pasted raw |
| `GOOGLE_DRIVE_FOLDER_ID` | The id of the folder to sync, the last part of its URL in Drive |
| `GOOGLE_DRIVE_IMPERSONATE` | Optional. A Workspace user the service account acts as, when domain-wide delegation is configured |

## 1. Create the service account

In the Google Cloud console:

1. Create or pick a project and enable the **Google Drive API** on it.
2. Under IAM & Admin, Service accounts, create a service account. No project role is needed.
3. Open it, Keys, Add key, JSON. Encode the downloaded file into `GOOGLE_DRIVE_SERVICE_ACCOUNT`.

The driver requests the `https://www.googleapis.com/auth/drive.readonly` scope only.

## 2. Share the folder

Share the folder to sync with the service account's email (`...@...iam.gserviceaccount.com`) as Viewer. On a shared drive, add the service account as a member of the drive instead; the driver passes `supportsAllDrives` on every call.

Alternatively, with domain-wide delegation granted to the service account's client id for the `drive.readonly` scope in the Workspace admin console, set `GOOGLE_DRIVE_IMPERSONATE` to a user who can see the folder; the driver then acts as that user and no sharing is needed.

## What gets synced

- Every folder and file under `GOOGLE_DRIVE_FOLDER_ID`, listed breadth first with `files.list` (`'{id}' in parents and trashed = false`, 1,000 items per page). All folders are read before anything is written, then folders are upserted parents first, then files.
- The pointed folder is read with `files.get` and becomes the single top-level asset folder; everything else hangs under it by its Drive parent id. Files are matched by Drive id, so renames and moves update the existing asset.
- Skipped items: names starting with a dot (and everything below such a folder) or containing a NUL byte, trashed items, Google-native documents (Docs, Sheets, Slides, Forms, shortcuts: anything with a `application/vnd.google-apps.` MIME type other than a folder, since they have no downloadable bytes), files with no size, and folders with no non-empty file below them (empty folders are not displayed).
- `md5Checksum` is the checksum. Drive computes it on the content only, so a rename or move does not re-download, while an edit marks the file `outdated` and queues a fresh download. See [Integrity check](../deployment/integrity-check.md) for the daily size comparison.
- MIME type comes from Drive's `mimeType`, falls back to the extension, and is re-detected from the content on download. When the content cannot be identified, the listing type is kept unless a browser would execute it (HTML, SVG, XML, JavaScript), in which case the file is stored as `application/octet-stream`. Drive allows slashes, quotes and control characters in names; they are replaced by `_` in download file names and archive paths.
- If the listing contains no folder and no file, the run logs `Google Drive listing is empty, skipping sync to avoid deleting all assets` and stops. The usual causes are a folder not shared with the service account, or a wrong id.
- If any folder or file fails to upsert, the error is logged with the item, the run ends as `failed to update assets` and the deletion pass is skipped.
- Otherwise anything not returned by the listing is marked `pending_deletion` and removed by the per-minute deletion job.

## Downloading contents

File contents are streamed from `files.get` with `alt=media` into a temporary file, then uploaded to the assets bucket by the `asset/update-content` job. A failed download rejects with the Drive error and leaves no temporary file.

## Guarantees the tests lock

The [OneDrive guarantees](onedrive.md#guarantees-the-tests-lock) apply to Google Drive in the same terms, with `md5Checksum` in place of `eTag`, "Google-native document or shortcut" added to the skipped kinds, and "folder with no non-empty file below it" in place of "size 0". `server/test/google-drive.cjs` (listing to upsert plan) and `server/test/google-drive-sync.cjs` (a library run through one sync with a stubbed client) fail when any of them changes. Change them only for a confirmed critical bug or a security hazard, name it in the commit, and update this section.

## Checking the setup

At startup the driver reads the folder and logs `Google Drive folder` with its id and name, then prints `asset updater initialized`. An error there is logged as `Google Drive folder check failed` and the server keeps serving; the sync retries every 5 minutes. Each run ends with `assets updated successfully` or `failed to update assets`. Typical errors:

| Drive error | Cause |
|---|---|
| `File not found` (404) | Wrong `GOOGLE_DRIVE_FOLDER_ID`, or the folder is not shared with the service account |
| `insufficientPermissions` (403) | The Drive API is not enabled on the project, or the scope is missing from the delegation |
| `invalid_grant` | Malformed key, revoked service account, or `GOOGLE_DRIVE_IMPERSONATE` set without domain-wide delegation |
| `is not a folder` | `GOOGLE_DRIVE_FOLDER_ID` points at a file |
