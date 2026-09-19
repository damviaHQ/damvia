---
title: Backups
description: Protect PostgreSQL, the main bucket and configuration together, and rehearse recovery with the matching application version.
sidebar:
  order: 7
lastUpdated: 2026-09-19
---

A recoverable instance needs a consistent database backup, main-bucket backup, configuration/secrets and the application version that produced them. Re-importing cloud assets does not reconstruct users, permissions or editorial uploads.

| Store | Contents | Recovery |
|---|---|---|
| PostgreSQL | Users, permissions, collections, pages, products, asset metadata, downloads and pg-boss jobs | Restore the database backup. |
| Main bucket | Collection thumbnails, page images/videos, login background | Restore objects from the same backup window. |
| Assets bucket | Originals, generated previews, prepared archives | Re-fetch originals/previews only if cloud sources remain accessible. Archives are not recreated. |
| Configuration and code | Server secrets, client build settings, mail templates, custom branding, commit/image identifiers | Restore from your configuration and release archive. |

## Back up the database and files together

1. Put the instance in maintenance and stop every Damvia server process, including worker and sync. Pause external writers to the buckets.
2. Dump the database and copy the main bucket while application writes remain stopped. Use versioned backup destinations and record the exact application commit, container image id and client bundle.
3. Include the assets bucket if preserving archives or reducing recovery time matters. Independently retain source files with the cloud provider.
4. Save configuration in the secret store, then restart the instance and run the API/worker checks in [Operations](./operations.md).

With `DATABASE_URL` supplied securely in the operator environment, the database command is:

```bash
pg_dump --format=custom "$DATABASE_URL" > damvia-$(date +%F).dump
```

The default dump includes `pgboss`. Excluding or dropping that schema loses pending email, content-processing, synchronisation and archive jobs, not just mail. Recreating queues does not reconstruct every lost task. After an upgrade from pg-boss 10 the retired `pgboss_legacy_v10` schema can be excluded once it has been dropped. Versioning of a bucket alone is not a separate backup if the same credentials can delete versions.

## Restore into an isolated instance first

Keep the original instance unchanged during the drill. Use separate PostgreSQL and buckets, a private client/API and a test SMTP sink. Restored jobs may send real email or delete objects: replace their destinations before starting the application, and review queued payloads containing recipient addresses. Do not attach the restored application to production buckets.

1. Stop all processes using the target database. Create an empty database with the required extensions and permissions from [Upgrading](./upgrading.md).
2. Restore the dump into that empty target (`RESTORE_DATABASE_URL` must identify the new database):

   ```bash
   pg_restore --exit-on-error --no-owner --dbname="$RESTORE_DATABASE_URL" damvia-YYYY-MM-DD.dump
   ```

3. Restore the main bucket from the same recovery point. Restore the assets bucket or create it empty. Point the saved configuration at these isolated destinations and set the test SMTP settings.
4. Start the **same application version** as the backup with `ENABLE_WORKER=true`. Startup, including CLI startup, runs migrations; a newer version can change the restored schema immediately.
5. Confirm API/database access, a successful sync and worker progress. Run `npm run cli -- check-integrity` from `server/` once queues exist. It repairs missing/mismatched asset originals; it does not recreate download archives or main-bucket media.
6. Verify account access, a restricted collection, a custom thumbnail, a page image/video and a generated preview. Inspect failed jobs and download records. Record elapsed recovery time and any lost archives.

For a real recovery, apply this sequence to the intended destinations during maintenance, then run the [acceptance checklist](./acceptance-checklist.md) before reopening access. Do not restore the database while the worker is writing to it.

## Recovery cost

Cloud re-import may take hours or days and consume provider bandwidth. The integrity schedule is 05:00 UTC; the CLI queues work immediately but does not wait for its completion. Same-size stale originals and missing previews require the targeted procedure in [Integrity check](./integrity-check.md).
