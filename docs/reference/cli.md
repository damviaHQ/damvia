---
title: CLI
description: The server ships four maintenance commands, run with npm from the server folder.
sidebar:
  order: 4
lastUpdated: 2026-09-21
---

The CLI lives in `server/src/cli.ts` and is built with Commander. It connects to the database and starts pg-boss before running a command, so it needs the same `.env` as the server and a reachable `DATABASE_URL`.

The CLI also validates `APP_SECRET` at startup, including for help and version commands. Set a randomly generated secret of at least 32 bytes as described in [Server configuration](../configuration/server-env.md#app_secret-signs-every-session).

## Running a command

From the `server/` folder, in development:

```bash
npm run cli -- check-integrity
```

The `--` separates npm's arguments from the command's. In a production container, where TypeScript is compiled to `dist/`, `npm run cli` still uses `ts-node` on the sources, so the source tree must be present (the `Dockerfile` copies it). Running it inside the container:

```bash
docker exec -it <container> npm run cli -- check-integrity
```

A hosting panel that offers a terminal on the application container, such as the Terminal tab of Coolify, runs the same command without SSH.

## Commands

| Command | What it does |
|---|---|
| `check-integrity` | Runs the same integrity check as the daily `system/integrity-check` job, including the deletion of orphan objects older than 24 hours, then exits. See [Integrity check](../deployment/integrity-check.md) for what it compares and repairs. |
| `list-sources` | Prints every source key found in the database with its folder and file counts, the names of its top-level folders, and whether `ASSET_SOURCES` still configures it, is deleting it, or needs `rename-source` or `remove-source`. Run it when the startup error names a key you do not recognise. |
| `rename-source <from> <to>` | Moves every asset folder and file stamped with the source key `from` to the key `to`, for a source whose `key` in `ASSET_SOURCES` changed; the server refuses to start until this is done. Refuses an invalid `to`, an unknown `from`, and a `to` that already owns rows. Use `""` as `from` for rows written before sources existed. See [Sources](../integrations/sources.md#renaming-a-source). |
| `remove-source <key>` | Marks every asset folder and file stamped with a source key that is no longer configured for deletion, which is what lets the server start again; the `asset/process-deletion` job then removes them with their storage objects and mirrored collections. Refuses a key still present in `ASSET_SOURCES`. See [Sources](../integrations/sources.md#removing-a-source). |

| `metadata:backfill` | Queues `asset/extract-metadata` for every processed image (`up_to_date`, `image/*`) that has no metadata value yet, in batches of 1,000, and prints the count. The job reads the copy already in the assets bucket, so the cloud source is not asked again. Run it once after the upgrade that added file metadata; images processed later are read as they are downloaded. |

`npm run cli -- --help` prints the command list, and `--version` prints `1.0.0`.

## What is not a CLI command

- **Migrations** run automatically when the server boots (`migrationsRun: true` in `server/src/env.ts`). There is no migrate command to run by hand. See [Upgrading](../deployment/upgrading.md).
- **Creating the first admin** is done in SQL. See [First admin](../getting-started/first-admin.md).
- **TypeORM's own CLI** is exposed as `npm run typeorm` for developers generating migrations; it is not needed to operate an instance.

`dataSource.initialize()` also applies pending migrations, even for CLI startup and help/version invocations. Use the application version matching the instance. Start the server with its worker once before running the CLI on a fresh database: `boss.start()` alone does not declare the application queues.
