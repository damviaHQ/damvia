---
title: OneDrive
description: Register an Azure application with Microsoft Graph permissions and point Damvia at one user's drive.
sidebar:
  order: 3
lastUpdated: 2026-09-19
---

The OneDrive driver (`server/src/asset-updater/one-drive.ts`) uses Microsoft Graph with application credentials (client id and secret, no user login) to read the delta feed of one user's OneDrive for Business and download file contents.

## Variables

| Variable | Value |
|---|---|
| `ASSET_UPDATER` | `onedrive` |
| `ONEDRIVE_TENANT_ID` | The Azure AD (Entra ID) tenant id |
| `ONEDRIVE_CLIENT_ID` | The app registration's application (client) id |
| `ONEDRIVE_CLIENT_SECRET` | A client secret created on the app registration |
| `ONEDRIVE_USER` | The user principal name whose drive is read, for example `dam@company.com` |
| `ONEDRIVE_DRIVE` | `root` for the whole drive, or a path-addressed folder such as `root:/Marketing/Assets:` to sync only that subtree. The subtree form is what production runs. |

## 1. Register the application

In the Azure portal, under App registrations:

1. Create a registration, single tenant.
2. Under Certificates and secrets, create a client secret and copy its value into `ONEDRIVE_CLIENT_SECRET` (it is shown once). Note its expiry: when it expires the sync stops with an authentication error and you need a new secret.
3. Under API permissions, add Microsoft Graph **application** permission `Files.Read.All` and grant admin consent for the tenant. The driver authenticates with `ClientSecretCredential` and the scope `https://graph.microsoft.com/.default`, which means it can only use permissions granted to the application itself.

`Files.Read.All` gives the app read access to every drive in the tenant; the driver only reads the one in `ONEDRIVE_USER`.

## 2. Pick the drive and folder

The driver calls `/users/{ONEDRIVE_USER}/drive/{ONEDRIVE_DRIVE}/delta`. Two forms work:

- `root`: the whole drive. The listing starts with the drive root item, which has no parent id.
- `root:/Marketing/Assets:`: one subtree, with the colon closing the path before `/delta`. The listing starts with that folder; its parent is the real drive root, which is never part of the listing.

In both cases the first item becomes the single top-level asset folder, with no parent, and everything else hangs under it by Graph parent id. The subtree form is what production runs. If the path does not exist, the startup check logs the Graph error (see below) and every run fails with `failed to update assets` until it is fixed.

## What gets synced

- The delta feed returns every item under the path. The driver reads all pages first, then upserts folders (parents before children) and then files.
- Skipped items: deleted items, items whose name starts with a dot or contains a NUL byte, items with `size` 0 (empty files and empty folders), and items that are neither a file nor a folder (for example OneNote notebooks).
- Items are keyed by their Graph id, which survives renames and moves. The top item of the listing (the drive root, or the folder named in `ONEDRIVE_DRIVE`) becomes the single top-level asset folder because its parent is not in the listing; every other folder and file keeps its Graph parent id. Empty folders are not displayed: the sync skips them, so they never become collections. Files store Graph's `eTag` as checksum. It changes on a content edit and also on a rename or move, so any of those marks the file `outdated` and queues a fresh download. See [Integrity check](../deployment/integrity-check.md) for the daily size comparison.
- MIME type comes from Graph's `file.mimeType` at listing time, falls back to the file extension, and is re-detected from the content on download when the content type can be identified.
- If the listing contains no folder and no file, the run logs a warning and stops without marking anything for deletion.
- If any folder or file fails to upsert, the error is logged with the item, the run ends as `failed to update assets` and the deletion pass is skipped, so a transient database error never removes assets.
- Otherwise anything not returned by the feed is marked `pending_deletion` and removed by the per-minute deletion job.

The driver always requests the full delta from the start (it does not persist a delta link), so each 5-minute run lists the whole subtree.

## Downloading contents

File contents are streamed from `/users/{user}/drive/items/{id}/content` into a temporary file, then uploaded to the assets bucket by the `asset/update-content` job. Graph answers with a redirect to a short-lived download URL; the client follows it and retries throttled (`429`) responses.

:::caution
The empty-listing guard only protects an empty path. If `ONEDRIVE_DRIVE` is changed to a different, non-empty folder, every asset outside it is marked for deletion on the next run. Change the path only when you intend to replace the library.
:::

## Guarantees the tests lock

Production libraries were built by a driver that wrote the Graph listing down item for item. The behaviours below are what an upgrade must preserve; `server/test/onedrive.cjs` (listing to upsert plan, no database) and `server/test/onedrive-sync.cjs` (a production-shaped library run through one sync) fail when any of them changes. Change them only for a confirmed critical bug or a security hazard, name it in the commit, and update this section.

| Guarantee | Why it matters |
|---|---|
| The listing is mirrored item for item: the top item (drive root or the `ONEDRIVE_DRIVE` folder) is stored as the single top-level folder because its parent is absent from the listing, every other folder and file keeps its Graph parent id | Any other mapping re-parents an existing library on the first run, marks the old rows for deletion and removes the collections that mirror them |
| `eTag` is the stored checksum | Switching to another marker changes every checksum at once and re-downloads the whole library, which breaks storage reservations under `STORAGE_QUOTA` |
| Items with `size` 0, dot-prefixed names, a `deleted` facet, or neither a `file` nor a `folder` facet are skipped, never written and never fail the run | Empty folders that suddenly appear become new sub-collections; a notebook that throws aborts every run |
| All delta pages are read first; folders are upserted parents first (order derived from parent ids, since delta responses carry no `parentReference.path`), then files | A child listed before its parent must not end up top-level or fail with "folder not found" |
| A listing with no folder and no file ends the run with a warning, before the deletion pass | A permission lapse or a wrong path must never empty the library |
| Any failed upsert ends the run with an error, before the deletion pass | A transient database error must never turn into deleted files and objects |
| The startup drive check logs on failure and never stops the server | A Microsoft outage at boot must not take the API down |
| A failed download rejects with the Graph error and leaves no temporary file | Otherwise the queue logs a misleading `ENOENT` and the temp directory fills up |
| A file that Graph lists without a MIME type gets one from its extension; when the content cannot be identified the listing type is kept unless a browser would execute it (HTML, SVG, XML, JavaScript), which falls back to `application/octet-stream` | CSV and text files keep a usable type in the portal and in download names, while a file that only claims to be HTML is never served as such from the assets bucket |

## Checking the setup

At startup the driver reads `/users/{ONEDRIVE_USER}/drive/{ONEDRIVE_DRIVE}` and logs `OneDrive drive` with the root id and child count, then prints `asset updater initialized`. A Graph error here is logged as `OneDrive drive check failed` and the server keeps serving; the sync retries every 5 minutes. Each run ends with `assets updated successfully` or `failed to update assets` with the Graph error. Typical errors:

| Graph error | Cause |
|---|---|
| `Authorization_RequestDenied` / `accessDenied` | `Files.Read.All` not granted as an application permission, or admin consent missing |
| `invalid_client` | Wrong or expired client secret |
| `itemNotFound` | `ONEDRIVE_USER` has no OneDrive provisioned, or `ONEDRIVE_DRIVE` path does not exist |

See Microsoft's [path-addressing rules](https://learn.microsoft.com/en-us/graph/onedrive-addressing-driveitems) and [delta endpoint reference](https://learn.microsoft.com/en-us/graph/api/driveitem-delta?view=graph-rest-1.0) for the distinction between an addressable folder and a supported delta operation.
