---
title: OneDrive
description: Register an Azure application with Microsoft Graph permissions and point Damvia at one user's drive.
sidebar:
  order: 3
lastUpdated: 2026-09-16
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
| `ONEDRIVE_DRIVE` | Use `root` for the whole drive. Subfolder delta support requires separate validation. |

## 1. Register the application

In the Azure portal, under App registrations:

1. Create a registration, single tenant.
2. Under Certificates and secrets, create a client secret and copy its value into `ONEDRIVE_CLIENT_SECRET` (it is shown once). Note its expiry: when it expires the sync stops with an authentication error and you need a new secret.
3. Under API permissions, add Microsoft Graph **application** permission `Files.Read.All` and grant admin consent for the tenant. The driver authenticates with `ClientSecretCredential` and the scope `https://graph.microsoft.com/.default`, which means it can only use permissions granted to the application itself.

`Files.Read.All` gives the app read access to every drive in the tenant; the driver only reads the one in `ONEDRIVE_USER`.

## 2. Pick the drive and folder

The driver calls `/users/{ONEDRIVE_USER}/drive/{ONEDRIVE_DRIVE}/delta`. The documented full-drive form is `root`. Path-based addressing closes a path before an operation (for example `root:/Marketing/Assets:`); adding that colon does not establish that subfolder delta is supported for a Business drive. No real-tenant subfolder test has been performed. Use `root` for this recipe. If the path does not exist, Graph returns an error on the first call, logged as `failed to update assets`, and nothing is synced.

## What gets synced

- The delta feed returns every item under the path. Items whose name starts with a dot and items with `size` 0 are skipped, so empty files never appear.
- Items are keyed by their Graph id. Folders become asset folders with their parent's id; files become asset files with the `eTag` stored as checksum. The current sync does not compare it, so an edited file is only re-downloaded when the daily integrity check finds a different size. See [Integrity check](../deployment/integrity-check.md).
- MIME type comes from Graph's `file.mimeType` at listing time and is re-detected from the content on download.
- Anything not returned by the feed is marked `pending_deletion` and checked for removal by the per-minute deletion job.

The driver always requests the full delta from the start (it does not persist a delta link), so each 5-minute run lists the whole subtree.

## Downloading contents

File contents are streamed from `/users/{user}/drive/items/{id}/content` into a temporary file, then uploaded to the assets bucket by the `asset/update-content` job.

:::caution
The OneDrive driver has no empty-listing guard like the Dropbox one. If `ONEDRIVE_DRIVE` points to an empty folder, every existing asset is marked for deletion on the next run. Change the path only when you intend to replace the library.
:::

## Checking the setup

Startup prints `asset updater initialized` immediately (the OneDrive driver has no initialisation step); the first real check is the first run, which ends with `assets updated successfully` or `failed to update assets` with the Graph error. Typical errors:

| Graph error | Cause |
|---|---|
| `Authorization_RequestDenied` / `accessDenied` | `Files.Read.All` not granted as an application permission, or admin consent missing |
| `invalid_client` | Wrong or expired client secret |
| `itemNotFound` | `ONEDRIVE_USER` has no OneDrive provisioned, or `ONEDRIVE_DRIVE` path does not exist |

See Microsoft's [path-addressing rules](https://learn.microsoft.com/en-us/graph/onedrive-addressing-driveitems) and [delta endpoint reference](https://learn.microsoft.com/en-us/graph/api/driveitem-delta?view=graph-rest-1.0) for the distinction between an addressable folder and a supported delta operation.
