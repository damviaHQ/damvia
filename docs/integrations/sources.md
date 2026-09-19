---
title: Sources
description: Sync several folders, from several Dropbox, OneDrive or Google Drive accounts, into one library with ASSET_SOURCES.
sidebar:
  order: 2
lastUpdated: 2026-09-19
---

A **source** is one cloud folder that Damvia mirrors: one account on one provider, plus the folder inside it that becomes a top-level folder of the library. An instance may have one source, as every instance had before this feature, or several, on any mix of providers and accounts: two folders of one Dropbox account next to one OneDrive folder, for example. Each source is a separate top-level folder in the [assets tree](../administration/assets-tree.md); nothing else in Damvia distinguishes them.

## Keys and labels: the two names of a source

Every source has a **key** that you choose yourself when you declare it: a short word such as `marketing`, `press` or `video`. Damvia stamps every folder and file it creates with the key of the source it came from. That stamp is how it knows which rows belong to which source, so that one source's cleanup never touches another's, and so that each file is fetched from the right account. Because the rows carry it, **a key is permanent**: changing it later means telling Damvia what became of the rows that carry the old one, see [Renaming a source](#renaming-a-source).

A source may also have a **label**, the name of its folder at the top of the library. Without a label, users see the cloud folder's own name. A label can change at any time; the next run renames the folder and nothing else moves. Choose the label for people, the key for Damvia.

An instance set up with `ASSET_UPDATER` and the provider variables has one source whose key is the provider name (`onedrive`, `dropbox` or `googledrive`); nothing has to be typed.

## Declaring the sources

Set `ASSET_SOURCES` to a JSON object, raw or base64-encoded, with two parts: the `accounts` (credentials, keyed by a name of your choice) and the `sources` (one per folder). When it is set, `ASSET_UPDATER` and the provider variables are ignored.

```json
{
  "accounts": {
    "contoso": {
      "provider": "onedrive",
      "tenantId": "…", "clientId": "…", "clientSecret": "…",
      "user": "assets@contoso.com"
    },
    "agency": {
      "provider": "dropbox",
      "appKey": "…", "appSecret": "…", "refreshToken": "…",
      "useTeamRoot": false
    },
    "workspace": {
      "provider": "googledrive",
      "serviceAccount": "<the JSON key, raw or base64>",
      "impersonate": ""
    }
  },
  "sources": [
    { "key": "marketing", "label": "Marketing", "account": "contoso", "root": "root:/Marketing/Assets:" },
    { "key": "press", "account": "agency", "root": "/Press" },
    { "key": "events", "account": "agency", "root": "/Events" },
    { "key": "video", "account": "workspace", "root": "1AbCdEfGhIjKlMnOpQrStUvWxYz" }
  ]
}
```

| Field | Meaning |
|---|---|
| `key` | Your own permanent name for the source: 1 to 40 lowercase letters, digits or dashes, unique among the sources. See [Keys and labels](#keys-and-labels-the-two-names-of-a-source). |
| `label` | Optional name of the source's top-level folder, shown to users instead of the cloud folder's own name. Free to change. Must be unique among the sources. |
| `account` | The name of an entry in `accounts`. Several sources may share one account. |
| `root` | The folder to sync, in the provider's own form: `root:/Marketing/Assets:` or `root` for [OneDrive](./onedrive.md), `/Press` or empty for the whole account on [Dropbox](./dropbox.md), the folder id for [Google Drive](./google-drive.md). Required except on Dropbox. |

The account fields are the same values as the single-provider variables: `DROPBOX_APP_KEY`, `DROPBOX_APP_SECRET`, `DROPBOX_REFRESH_TOKEN` and `DROPBOX_USE_TEAM_ROOT`; `ONEDRIVE_TENANT_ID`, `ONEDRIVE_CLIENT_ID`, `ONEDRIVE_CLIENT_SECRET` and `ONEDRIVE_USER`; `GOOGLE_DRIVE_SERVICE_ACCOUNT` and `GOOGLE_DRIVE_IMPERSONATE`. Each provider page explains how to obtain them.

A configuration that does not parse, names an unknown account or provider, repeats a key or a label, or misses a required field stops the server at startup with an `ASSET_SOURCES: …` error saying which entry is wrong.

## Two sources must never overlap

:::danger[One root must not contain another]
Every source sweeps the library after its run: whatever it stored before and did not list this time is marked for deletion, along with its copies in the assets bucket and its mirrored collections. Two sources on the **same account** whose roots overlap would list the same items and destroy each other's rows every 5 minutes. The server refuses to start in these cases:

- A root inside another root of the same account, such as `/Press` and `/Press/2026` on one Dropbox, or `root` and `root:/Marketing:` on one OneDrive.
- A whole-account Dropbox root (`""`) next to any other root on the same Dropbox account.
- The same root twice.

The same credentials declared under two account names still count as one account. Google Drive roots are folder ids, so the server can only refuse the same id twice: **never point two sources at a Google Drive folder and one of its subfolders**, the check cannot see it.
:::

Two sources on different accounts never overlap, whatever their roots. Damvia never writes to the cloud storage, so overlapping is only a problem inside Damvia's own tables.

## Same names at the top level

Each source adds one top-level folder named after its cloud folder. Two sources that would both show, say, `Assets` are refused at run time: the second one logs `Top-level folder "Assets" of source … has the same name as the top-level folder of source …, set a label on one of them` and writes nothing until a `label` tells them apart. Cloud folder ids are never shown to users; the log lines carry the `source` key.

## How the runs work

The sources run one after another, every 5 minutes, in the order of the list. Each run is the one described in [Integrations](./index.md): list everything, write folders then files, then sweep. The sweep is limited to the rows of that source, so an empty listing, a failed item or a broken token on one source never touches another. A source that fails is logged with its key and retried at the next cycle while the others continue. Provider ids are unique per source, not per instance: the same file reachable through two sources on two accounts gives two independent rows and two copies.

Memory grows with the largest source, not with their number, because one listing is held at a time. See [Worker and scaling](../deployment/worker-and-scaling.md#memory-and-disk) for the figures.

## Watching the sources

The [dashboard](../administration/dashboard.md) lists every source with its state and its last successful sync, and the root of the [assets tree](../administration/assets-tree.md) shows the same with counts and the last error message. The server keeps this in the `asset_sources` table, one row per configured source, refreshed at startup and after every run. While the storage plan is full, downloads stop for every source at once and every source reads `Paused`; listing continues, so deletions in the cloud still free space.

## Upgrading an instance that has one source

Nothing to do. Without `ASSET_SOURCES`, the single-provider variables describe one source whose key is the provider name (`onedrive`, `dropbox` or `googledrive`). At the first start after the upgrade, the rows written before sources existed carry an empty key; when exactly one source is configured they are adopted by it (logged as `asset source adopted existing assets`), keeping their ids, their collections and their downloaded copies. The first run then changes nothing.

To move to `ASSET_SOURCES` later, keep the provider name as the key of the existing source (`"key": "onedrive"`) and add the new ones next to it. `server/test/asset-sources.cjs` locks this adoption and the isolation between sources.

## Stale rows stop the server

Rows stamped with a key that is no longer in `ASSET_SOURCES` would be frozen for users, and duplicated as soon as the same folder syncs again under a new key. The server therefore refuses to start while any exist, before it serves a single request:

```
Assets belong to source keys that are not configured (old-key). Run "npm run cli -- rename-source <old> <new>" if the source was renamed, or "npm run cli -- remove-source <key>" if it was removed, then start the server again.
```

Rows already marked for deletion do not count, which is what lets the server start after `remove-source` and delete them. When the key in the message means nothing to you, `npm run cli -- list-sources` shows each key with its counts and the names of its top-level folders, which is usually enough to recognise the old source. Changing the sources is therefore a deliberate two-step operation: edit the configuration, then tell Damvia what became of the old rows. There is no stale state to warn administrators about, because it never runs.

## Renaming a source

The `label` renames the folder users see and can change at any time. The `key` cannot change on its own: move its rows first, then start with the new configuration:

```bash
npm run cli -- rename-source old-key new-key
```

Nothing is re-downloaded and nothing is duplicated. The command refuses to merge into a key that already has rows. Use `""` as the old key for rows from before sources existed when more than one source is configured, since the automatic adoption only applies to a lone source.

## Removing a source

Delete its entry from `ASSET_SOURCES`, then hand its rows to the deletion job:

```bash
npm run cli -- remove-source old-key
```

It marks every folder and file of that key for deletion; the server can then start, and its `asset/process-deletion` job removes them within minutes, with their originals and previews in the assets bucket and the collections mirrored on those folders, exactly as when a folder disappears from the cloud. Collections that only copied files from there keep their other files. The command refuses a key that is still configured, since the next run would recreate everything. To keep the content instead, keep the source configured: nothing forces a source to be removed.
