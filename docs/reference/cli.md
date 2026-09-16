---
title: CLI
description: The server ships one maintenance command, run with npm from the server folder.
sidebar:
  order: 4
lastUpdated: 2026-09-16
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

## Commands

| Command | What it does |
|---|---|
| `check-integrity` | Runs the same integrity check as the daily `system/integrity-check` job, including the deletion of orphan objects older than 24 hours, then exits. See [Integrity check](../deployment/integrity-check.md) for what it compares and repairs. |

`npm run cli -- --help` prints the command list, and `--version` prints `1.0.0`.

## What is not a CLI command

- **Migrations** run automatically when the server boots (`migrationsRun: true` in `server/src/env.ts`). There is no migrate command to run by hand. See [Upgrading](../deployment/upgrading.md).
- **Creating the first admin** is done in SQL. See [First admin](../getting-started/first-admin.md).
- **TypeORM's own CLI** is exposed as `npm run typeorm` for developers generating migrations; it is not needed to operate an instance.

`dataSource.initialize()` also applies pending migrations, even for CLI startup and help/version invocations. Use the application version matching the instance. Start the server with its worker once before running the CLI on a fresh database: `boss.start()` alone does not declare the application queues.
