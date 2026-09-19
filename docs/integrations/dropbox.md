---
title: Dropbox
description: Create a Dropbox app, obtain a refresh token, and choose between a member's folder and the Business team space.
sidebar:
  order: 3
lastUpdated: 2026-09-19
---

The Dropbox driver (`server/src/asset-updater/dropbox.ts`) lists the Dropbox, or one folder of it, recursively every 5 minutes and downloads file contents on demand, using an app key, an app secret and a long-lived refresh token. Nothing is written to Dropbox. It behaves like the [OneDrive driver](onedrive.md) and gives the same tree: one top-level folder when a folder is pointed at, the same skipped items, the same protections around deletion.

To sync several folders, or this provider next to another one, declare the same values as accounts and sources in `ASSET_SOURCES` instead of the variables below; see [Sources](./sources.md).

## Variables

| Variable | Value |
|---|---|
| `ASSET_UPDATER` | `dropbox` |
| `DROPBOX_APP_KEY` | The app key from the Dropbox App Console |
| `DROPBOX_APP_SECRET` | The app secret |
| `DROPBOX_REFRESH_TOKEN` | A refresh token obtained once through the OAuth flow, see below |
| `DROPBOX_USE_TEAM_ROOT` | `false` (default) to sync the connected member's home folder, `true` to sync the Business team space |
| `DROPBOX_ROOT_PATH` | Empty (default) for the whole Dropbox, or a folder such as `/Marketing/Assets` to sync only that subtree. Either way there is one top-level asset folder, like `ONEDRIVE_DRIVE`. |

## 1. Create the app

In the [Dropbox App Console](https://www.dropbox.com/developers/apps), create a Scoped Access app. Choose **Full Dropbox** access (an App Folder would limit the sync to a folder Damvia would have to own). The driver calls three API families, so enable these permissions on the Permissions tab:

| Scope | Used for |
|---|---|
| `account_info.read` | `usersGetCurrentAccount` at startup, to learn the root namespace |
| `files.metadata.read` | `filesListFolder` / `filesListFolderContinue`, the listing |
| `files.content.read` | `filesDownload`, fetching file contents |

Changing scopes after issuing the token requires a new token.

## 2. Obtain a refresh token

Damvia needs a **refresh** token, not the short-lived access token the console generates. Run the authorization code flow once with `token_access_type=offline`:

1. Open in a browser, with your app key:
   ```
   https://www.dropbox.com/oauth2/authorize?client_id=APP_KEY&response_type=code&token_access_type=offline
   ```
2. Approve the app with the account whose files should be synced, and copy the code shown.
3. Exchange the code:
   ```bash
   curl https://api.dropboxapi.com/oauth2/token \
     -d code=THE_CODE \
     -d grant_type=authorization_code \
     -u APP_KEY:APP_SECRET
   ```
4. Copy the `refresh_token` field of the response into `DROPBOX_REFRESH_TOKEN`.

The refresh token does not expire on its own. Revoking the app from the Dropbox account invalidates it, and the server then fails at startup with `Failed to refresh Dropbox token`.

## 3. Choose the root

At startup the driver refreshes its access token and reads the account's `root_info`. On a Dropbox Business account with a team space, the member's home folder and the team space are two namespaces:

- `DROPBOX_USE_TEAM_ROOT=false`: the listing starts at the member's home folder. Team folders appear there only if they are mounted in the member's view.
- `DROPBOX_USE_TEAM_ROOT=true`: the driver sets the `Dropbox-API-Path-Root` header to the team's root namespace and lists the whole team space.

The startup log line `Dropbox account` prints the email, root type and both namespace ids, and `Dropbox listing team root namespace` confirms the team root is in use.

## What gets synced

- Every folder and file, recursively, from `DROPBOX_ROOT_PATH` (or the whole Dropbox when it is empty). All pages are read first, then folders are upserted parents first, then files.
- There is always exactly one top-level asset folder. With `DROPBOX_ROOT_PATH` set, the pointed folder is read with `filesGetMetadata` and is that folder. Without it, the whole Dropbox is represented by a folder named `Dropbox` (external id `dropbox-root`), and files sitting directly at the Dropbox root live in it. Everything else hangs under the root by folder path.
- Skipped items: any entry with a dot-prefixed component anywhere in its path (the hidden folder and its content), names containing a NUL byte, files of size 0, folders with no non-empty file below them (empty folders are not displayed), and deleted entries.
- Files are matched by Dropbox id, so renames and moves update the existing asset. Dropbox's `content_hash` is the checksum: a file replaced with new content is marked `outdated` and downloaded again on the next run. See [Integrity check](../deployment/integrity-check.md) for the daily size comparison.
- MIME types at listing time come from the file extension; the real type is detected from the content when the file is downloaded, and the extension type is kept when the content cannot be identified.
- If the listing contains no folder and no file, the run logs `Dropbox listing is empty, skipping sync to avoid deleting all assets` and stops. The usual causes are an App Folder app, a token for the wrong account, a wrong `DROPBOX_ROOT_PATH`, or files that live in the team space while `DROPBOX_USE_TEAM_ROOT` is `false`.
- If any folder or file fails to upsert (after up to three attempts on a database deadlock), the error is logged with the item, the run ends as `failed to update assets` and the deletion pass is skipped.
- Otherwise anything not returned by the listing is marked `pending_deletion` and removed by the per-minute deletion job.

## Token expiry during a run

A `401` from Dropbox during listing, metadata or download makes the driver refresh the access token once and retry that call once. A second `401` surfaces as the run's error. Check credentials, token revocation and permissions.

## Guarantees the tests lock

The [OneDrive guarantees](onedrive.md#guarantees-the-tests-lock) apply to Dropbox in the same terms, with `content_hash` in place of `eTag`, "dot-prefixed component in the path" in place of "dot-prefixed name", "folder with no non-empty file below it" in place of "size 0", and the `Dropbox` folder standing in for the drive root when no path is pointed at. `server/test/dropbox.cjs` (listing to upsert plan) and `server/test/dropbox-sync.cjs` (a library run through one sync with a stubbed SDK) fail when any of them changes. Change them only for a confirmed critical bug or a security hazard, name it in the commit, and update this section.

:::note
Dropbox's `files/list_folder` with `recursive: true` on a very large account can take several minutes per run. The next run is scheduled 5 minutes after the previous one ends, not on a fixed clock.
:::

If fetching a page of the Dropbox listing fails, the sync stops before checking which assets to delete, and so does any failed folder or file, see above.

The Dropbox SDK returns each download in memory as `fileBinary` before the driver writes it to disk. Allow enough memory for several downloads at once.
