---
title: Upgrading
description: Pull, build, restart; migrations run on their own at startup.
sidebar:
  order: 6
lastUpdated: 2026-09-15
---

Upgrading an instance is rebuilding the two artefacts and restarting the server. There is no migrate command: TypeORM is configured with `migrationsRun: true` and applies every pending migration from `server/src/migrations/` before the HTTP server starts listening.

## Procedure

1. Back up the database (`pg_dump`). Migrations have `down` methods but the safe rollback is a restore.
2. Pull the new version:
   ```bash
   git pull
   ```
3. Rebuild and restart the server:
   ```bash
   docker build -t damvia-server:latest server/
   docker stop damvia-server && docker rm damvia-server
   docker run -d --name damvia-server --env-file /srv/damvia/server.env -e ENABLE_WORKER=true -p 3000:3000 damvia-server:latest
   ```
   Watch the logs: migrations run first; a migration error exits the process before it listens, and the previous image can be started again after a restore.
4. Rebuild and redeploy the client:
   ```bash
   cd client && npm install && npm run build
   ```
   then copy `client/dist/` to the static host. Deploy the client **after** the server, since the client is built against the server's tRPC types and may call procedures the old server does not have.
5. Check `docs/reference/environment-variables.md` of the new version (or the diff of `server/.env.template`) for new variables.

Downtime is the server restart plus migration time, a few seconds on a normal database.

## Migrations that exist

| Migration | What it did |
|---|---|
| `1726844037002-initial-migration` | Full schema, triggers for `number_of_files` and `sample_file_ids`, seeds the `Default` group and the `Global` region |
| `1727629957517-add-searchable-to-product-attributes` | `searchable` flag on product attributes |
| `1744549674740-add-details-to-licenses` | `details` text on licenses |
| `1750670845530-add-limited-to-group-ids-to-collections` | Group restriction on collections |
| `1750683595547-create-user-groups` | Many-to-many user groups, migrating the previous single `group_id` |
| `1750687616986-add-edit-to-limited-groups` | `can_edit_limited_to_group_ids` on collections |
| `1751012487660-add-trigger-to-sample-files` | Trigger refreshing collection sample thumbnails |
| `1751187976556-update-asset-file-trigger` | Same trigger, also fired on `asset_files` updates |

TypeORM records applied migrations in the `migrations` table; the same migration never runs twice.

## Database permissions

Migrations create tables, functions and triggers, and pg-boss creates the `pgboss` schema on first start. The `DATABASE_URL` user needs ownership of the database or `CREATE` on it. The `uuid-ossp` extension is used for `uuid_generate_v4()` defaults; on managed Postgres where extensions need a superuser, create it once by hand:

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

## Rolling back

Restore the `pg_dump` taken in step 1 and start the previous image. The assets bucket is compatible across versions (objects are keyed by asset id), so nothing needs to be done there.

## Version drift between client and server

The client is built against the server package in the same checkout (`"server": "file:../server"`). Always build both from the same commit. A client from a newer commit can call a procedure the running server does not define and gets a `NOT_FOUND` error from tRPC.
