---
title: Upgrading
description: Pull, build, restart; migrations run on their own at startup.
sidebar:
  order: 6
lastUpdated: 2026-09-17
---

To upgrade an instance, rebuild the server image and client files, then deploy them together. There is no migrate command: TypeORM is configured with `migrationsRun: true` and applies every pending migration from `server/src/migrations/` before the HTTP server starts listening.

## Procedure

1. Take a consistent database/main-bucket/configuration backup as described in [Backups](./backups.md). Record the running image id and preserve it under a rollback tag before rebuilding `latest`: `docker image tag "$(docker inspect --format='{{.Image}}' damvia-server)" damvia-server:rollback-before-upgrade`. Also retain the old client bundle. Migrations have `down` methods, but the recovery plan is a matching-version restore.
2. Pull the new version:
   ```bash
   git pull
   ```
3. Rebuild and restart the server:
   ```bash
   docker build -t damvia-server:latest server/
   docker stop damvia-server && docker rm damvia-server
   docker run -d --name damvia-server --env-file /srv/damvia/server.env -e ENABLE_WORKER=true --restart unless-stopped -p 127.0.0.1:3000:3000 damvia-server:latest
   ```
   Watch the logs: migrations run first; a migration error exits the process before it listens, and the previous image can be started again after a restore.
4. Rebuild and redeploy the client:
   ```bash
   cd client && npm install && npm run build
   ```
   then copy `client/dist/` to the static host. Deploy the client **after** the server, since the client is built against the server's tRPC types and may call procedures the old server does not have.
5. Check `docs/reference/environment-variables.md` of the new version (or the diff of `server/.env.template`) for new variables.

## Storage plan in this upgrade

- The migration creates the `storage_usage` table with its single row. The first measurement runs at the next half hour; open the [dashboard](../administration/dashboard.md) and click "Measure now" to fill it right away.
- Set `STORAGE_QUOTA` to the customer's plan, below the disk size, to enable the alerts and the pause of the cloud sync. See [Server configuration](../configuration/server-env.md).
- Click "Measure now" on the dashboard as soon as the upgraded server is running with `STORAGE_QUOTA`. Until the first measurement the stored usage is 0, so up to one plan's worth of files can still download on top of what the buckets already hold.
- Files stored before the upgrade stay. If they already exceed the plan, the dashboard shows more than 100 % and new downloads wait until space is freed or the plan is raised.
- Add the `storage-alert` and `disk-alert` templates to `mailconfig.json` or to the `MAILCONFIG` variable; the samples are in `server/mailconfig.json`. Until they are added, the alerts are skipped, the worker logs `storage.alert-template-missing` or `storage.disk-alert-template-missing` every 30 minutes, and the alert is sent at the first measurement after the template is added and the server restarted.
- Designate at least one admin for the `storage-alert` emails: tick "Receives storage and maintenance emails" on their profile in Users. Nobody receives them until then.
- Set `SERVER_ALERT_EMAILS` to the hosting contact to receive disk alerts and see the server disk on the dashboard. Customer admins never see it.
- The daily integrity check now deletes orphan objects older than 24 hours. Objects left behind by earlier crashes disappear at the next 05:00 UTC run or with `npm run cli -- check-integrity`.

Downtime includes maintenance, migrations and verification. Measure it on a restored copy; no duration is guaranteed.

## Account and access changes in this upgrade

Before restarting, set a randomly generated `APP_SECRET` of at least 32 bytes. The server and CLI validate it at startup; `openssl rand -hex 32` generates a suitable value.

- Users must sign in again. Existing session and email login links are replaced by newly issued links; pending password resets must be requested again.
- Passwords continue to work. Their stored hashes are upgraded on successful login; new and reset passwords use scrypt.
- Collection descendants inherit their parent’s group restrictions. The migration updates existing descendants as well as enforcing inheritance for future children.
- Guests start with no groups. The migration removes existing guests from their region’s default group. Review guests who intentionally need that group and explicitly reassign it after the upgrade; other memberships are preserved.
- Licence dates and allowed regions apply to every non-admin user, including owners and invitees. Start and end dates are inclusive. Drafts are visible only to admins and their owner.

Back up first and apply the migration with application writers stopped. Validate a restricted collection, an invited guest and an administrator before reopening access.

## Migrations that exist

| Migration | What it did |
|---|---|
| `1726844037002-initial-migration` | Full schema, triggers for `number_of_files` and `sample_file_ids`, seeds the `Default` group and the `Global` region |
| `1727629957517-add-searchable-to-product-attributes` | `searchable` flag on product attributes |
| `1744549674740-add-details-to-licenses` | `details` text and nullable start/end dates on licenses |
| `1750670845530-add-limited-to-group-ids-to-collections` | Group restriction on collections |
| `1750683595547-create-user-groups` | Many-to-many user groups, migrating the previous single `group_id` |
| `1750687616986-add-edit-to-limited-groups` | `can_edit_limited_to_group_ids` on collections |
| `1751012487660-add-trigger-to-sample-files` | Trigger refreshing collection sample thumbnails |
| `1751187976556-update-asset-file-trigger` | Same trigger, also fired on `asset_files` updates |
| `1789516800000-secure-access` | Reset deadlines, account session versions, collection group inheritance and guest membership updates |
| `1789603200000-storage-usage` | `storage_usage` table: measured and reserved bytes, plan and disk alert levels, sync pause and orphan cleanup timestamps; `maintenance_contact` flag on `users` |
| `1789689600000-admin-branding` | `admin_branding` single-row table choosing the logo of the admin area |
| `1789776000000-host-controlled-branding` | Drops `admin_branding`: the host decides with `ADMIN_CLIENT_LOGO` instead |

TypeORM records applied migrations in the `migrations` table; the same migration never runs twice.

## Database permissions

Migrations create tables, functions and triggers, and pg-boss creates the `pgboss` schema on first start. The `DATABASE_URL` user needs ownership of the database or `CREATE` on it. The `uuid-ossp` extension supplies UUID defaults and `hstore` stores product metadata; on managed Postgres where extensions need a superuser, create it once by hand:

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS hstore;
```

## Rolling back

Stop all application writers, restore the coordinated recovery point and restart the saved image with its matching client and configuration. Inspect storage-related migration changes; stable object ids alone do not guarantee cross-version compatibility. Follow [Backups](./backups.md) and verify jobs and media before reopening access.

## Version drift between client and server

The client is built against the server package in the same checkout (`"server": "file:../server"`). Always build both from the same commit. A client from a newer commit can call a procedure the running server does not define and gets a `NOT_FOUND` error from tRPC.
