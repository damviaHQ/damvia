---
title: Dropbox
description: Create a Dropbox app, obtain a refresh token, and choose between a member's folder and the Business team space.
sidebar:
  order: 2
lastUpdated: 2026-09-15
---

The Dropbox driver (`server/src/asset-updater/dropbox.ts`) lists the whole Dropbox recursively every 5 minutes and downloads file contents on demand, using an app key, an app secret and a long-lived refresh token. Nothing is written to Dropbox.

## Variables

| Variable | Value |
|---|---|
| `ASSET_UPDATER` | `dropbox` |
| `DROPBOX_APP_KEY` | The app key from the Dropbox App Console |
| `DROPBOX_APP_SECRET` | The app secret |
| `DROPBOX_REFRESH_TOKEN` | A refresh token obtained once through the OAuth flow, see below |
| `DROPBOX_USE_TEAM_ROOT` | `false` (default) to sync the connected member's home folder, `true` to sync the Business team space |

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

- Every folder and file, recursively, from the root. Entries whose name starts with a dot are skipped.
- Files are matched by Dropbox id, so renames and moves update the existing asset. Dropbox's `content_hash` is stored as the checksum, but the current sync does not compare it, so a file replaced with new content is only re-downloaded when the daily integrity check finds a different size. See [Integrity check](../deployment/integrity-check.md).
- MIME types at listing time come from the file extension; the real type is detected from the content when the file is downloaded.
- Folders that appear only as parents of listed items (which can happen with team folders) are created as placeholders with an external id of the form `generated_/path`, so the tree is always connected.

## Empty listing protection

If a listing returns no folders and no files, the driver logs `Dropbox listing is empty, skipping sync to avoid deleting all assets` and does nothing. The usual causes are an App Folder app, a token for the wrong account, or files that live in the team space while `DROPBOX_USE_TEAM_ROOT` is `false`.

## Token expiry during a run

A `401` from Dropbox during listing or download makes the driver refresh the access token and retry once. Persistent `401`s mean the refresh token was revoked.

:::note
Dropbox's `files/list_folder` with `recursive: true` on a very large account can take several minutes per run. The next run is scheduled 5 minutes after the previous one ends, not on a fixed clock.
:::
