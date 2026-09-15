---
title: Storage drivers
description: "Add a cloud storage provider: the AssetUpdater base class, the upsertFolder and upsertFile contract, the deletion sweep, and the checklist for a new driver."
sidebar:
  order: 6
lastUpdated: 2026-09-15
---

This page describes what a storage driver must do so that a third provider can be added next to Dropbox and OneDrive. How the two existing drivers are configured is in [Dropbox](../integrations/dropbox.md) and [OneDrive](../integrations/onedrive.md); what happens to a file once it is known is in [Assets tree](../administration/assets-tree.md).

## A driver is a subclass of AssetUpdater

`server/src/asset-updater/base.ts` exports the class `AssetUpdater`. Its three public methods throw `Unimplemented` and are what a driver overrides:

| Method | Called by | Contract |
|---|---|---|
| `initialize()` | `startAssetUpdater()` in `index.ts`, once at startup | Authenticate and prepare the client. A rejection exits the process with code 1. OneDrive's is empty; Dropbox refreshes the access token and picks the team root. |
| `fetchUpdates()` | The 5-minute loop in `index.ts` | List the **whole** storage, call `upsertFolder` for every folder and `upsertFile` for every file, then mark everything else `pending_deletion`. Errors are logged as `failed to update assets` and the loop continues. |
| `fetchFileContent(file: AssetFile)` | `updateFileContent` in `services/asset.ts`, from the `asset/update-content` job | Download one file and resolve with the path of a temporary file holding its bytes. |

The base class also provides five protected helpers for the deletion sweep: `getAllAssetFolderIds()` and `getAllAssetFileIds()` return every id in the two tables; `arrayDifference(allIds, keepIds)` returns the ids not in `keepIds`; `deleteAssetFoldersInBatches(ids)` and `deleteAssetFilesInBatches(ids)` set `status = pending_deletion` on those rows, 1000 per `UPDATE`.

`server/src/asset-updater/one-drive.ts` is the minimal example: a constructor building a Graph client, an empty `initialize`, a `fetchUpdates` that walks the `/users/{user}/drive/{drive}/delta` pages, skips names starting with `.` and items of size 0, upserts each item and collects the returned ids, then runs the sweep. `fetchFileContent` streams `/users/{user}/drive/items/{externalId}/content` into `tmpFile()`.

## upsertFolder creates or moves a folder

`upsertFolder({ externalId, parentExternalId, name })` in `server/src/services/asset.ts` finds the folder by `externalId` (with its `parent` and both folders' `collections`) and:

- Creates it with `status = up_to_date` when unknown.
- Sets `name`, and looks the parent up by `parentExternalId` when it differs from the current parent. A `parentExternalId` that matches no row yields a root folder (`parent` is `null`).
- On creation or when the parent changed, copies `licenseId` and `assetTypeId` from the new parent.
- Saves, then, when the folder is new, renamed or moved, `bulkPush`es one `collection/synchronization` job for each collection bound to the folder, to its new parent and to its previous parent.

It returns the saved `AssetFolder`; collect `folder.id` for the sweep. Upsert parents before children, since the parent lookup is by `externalId` at call time: OneDrive relies on delta order, Dropbox sorts folders by path depth and creates `generated_`-prefixed placeholders for parents the listing did not return.

## upsertFile creates a file and queues its content

`upsertFile({ externalId, externalChecksum, folderExternalId, name, size, mimeType })` finds the file by `externalId` and:

- Creates it with `status = creating` when unknown.
- Sets `name`, `size`, `mimeType`, `externalChecksum`, looks the folder up by `folderExternalId`, and copies `licenseId` and `assetTypeId` from that folder on every call.
- Pushes `asset/update-content` for the file when its status is `creating`.
- When the file is new or moved to another folder, deletes its `collection_files` rows on a move and inserts one row per collection bound to the new folder (`ON CONFLICT DO NOTHING`).

The intended contract for `externalChecksum` is: a driver passes whatever the provider changes when the content changes (OneDrive passes `eTag`, Dropbox `content_hash`), and a differing checksum on an existing file sets `status = outdated` and re-pushes `asset/update-content`.

:::caution
In the current code `file.externalChecksum = opts.externalChecksum` is assigned before the comparison, so `file.externalChecksum !== opts.externalChecksum` is always false: the `outdated` branch never runs and a modified file is not re-fetched by the sync. Today only the daily `system/integrity-check` flags files as `outdated`, and only when the object is missing from the bucket or has a different size.
:::

`status` is never reset by `upsertFile`; a file already marked `pending_deletion` that reappears in a listing keeps that status until the deletion job removes it.

## The sweep deletes everything you did not list

After the upserts, both drivers compute `arrayDifference(allIds, syncedIds)` for folders and files and mark the difference `pending_deletion`; the `asset/process-deletion` job then deletes those rows, their objects in the assets bucket and any collection bound to a deleted folder, every minute. The rule is therefore: **return every folder and file, or return nothing**. A partial listing (a paging error, a scope that silently narrowed, a token that lost access) deletes the assets you did not return.

The Dropbox driver guards the empty case: when the listing yields no folder and no file it logs `Dropbox listing is empty, skipping sync to avoid deleting all assets` and returns before the sweep. A new driver needs the same guard, and should let a listing error propagate (the loop logs it and retries 5 minutes later) rather than swallow it and sweep.

Whatever a driver skips (both skip names starting with `.`) is deleted from Damvia if it existed before.

## fetchFileContent returns a temporary file the caller deletes

`fetchFileContent(file)` must resolve with an absolute path. Use `tmpFile()` from `services/asset.ts`, which returns a fresh uuid-named path inside a `dam-asset` directory created once with `mkdtemp` in the OS temp directory. Write the download there and return the path; `updateFileContent` detects the MIME type, uploads the original, builds the thumbnail, and removes the file in a `finally`. If the download fails, remove the temp file yourself before rethrowing, as the OneDrive driver does; the caller wraps the error as `Failed to fetch file content (asset file id: ...)` and the job is retried.

The lookup key is `file.externalId`: it must be enough to fetch the content (an item id for OneDrive; Dropbox passes it as `path` to `filesDownload`, which accepts ids).

## The driver is chosen by ASSET_UPDATER

`assetUpdater()` in `server/src/env.ts` lazily instantiates the driver from `process.env.ASSET_UPDATER`: `dropbox` builds `DropboxAssetUpdater(DROPBOX_APP_KEY, DROPBOX_APP_SECRET, DROPBOX_REFRESH_TOKEN, DROPBOX_USE_TEAM_ROOT === 'true')`, `onedrive` builds `OneDriveAssetUpdater(ONEDRIVE_TENANT_ID, ONEDRIVE_CLIENT_ID, ONEDRIVE_CLIENT_SECRET, ONEDRIVE_USER, ONEDRIVE_DRIVE)`, anything else throws `Provide a valid asset updater`.

## Skeleton of a new driver

```ts
import { AssetFile } from "../entity/asset-file"
import { tmpFile, upsertFile, upsertFolder } from "../services/asset"
import AssetUpdater from "./base"

export default class MyProviderAssetUpdater extends AssetUpdater {
	constructor(private readonly token: string) {
		super()
	}

	async initialize() { }

	async fetchUpdates() {
		const syncFolderIds: string[] = []
		const syncFileIds: string[] = []
		// walk the provider, parents before children:
		//   const folder = await upsertFolder({ externalId, parentExternalId, name }); syncFolderIds.push(folder.id)
		//   const file = await upsertFile({ externalId, externalChecksum, folderExternalId, name, size, mimeType }); syncFileIds.push(file.id)
		if (syncFolderIds.length === 0 && syncFileIds.length === 0) {
			return // never sweep on an empty listing
		}
		const [allFolderIds, allFileIds] = await Promise.all([this.getAllAssetFolderIds(), this.getAllAssetFileIds()])
		await Promise.all([
			this.deleteAssetFoldersInBatches(this.arrayDifference(allFolderIds, syncFolderIds)),
			this.deleteAssetFilesInBatches(this.arrayDifference(allFileIds, syncFileIds)),
		])
	}

	async fetchFileContent(file: AssetFile): Promise<string> {
		const path = await tmpFile()
		// download file.externalId into path, remove path and rethrow on failure
		return path
	}
}
```

## Checklist for a new driver

1. Create `server/src/asset-updater/<provider>.ts` with the class above and the AGPL header.
2. Add a branch to the `assetUpdater()` switch in `server/src/env.ts`, reading the new variables from `process.env`.
3. Add the variables to `server/.env.template` next to the `DROPBOX_*` and `ONEDRIVE_*` lines, and to [Environment variables](../reference/environment-variables.md) (`scripts/check-docs.sh` fails otherwise). Extend the accepted values of `ASSET_UPDATER` there.
4. Write `docs/integrations/<provider>.md` following [Dropbox](../integrations/dropbox.md) (app registration, permissions, the variables), and add it to the table in [Integrations](../integrations/index.md).
5. Add the code area to `docs/_internal/page-map.md`, then test nested folders, a rename, a move and a deletion, watching `SELECT status, count(*) FROM asset_files GROUP BY 1;` after the first sync.
