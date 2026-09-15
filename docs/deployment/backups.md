---
title: Backups
description: The database and the main bucket are the state to protect; the assets bucket can be rebuilt from the cloud storage.
sidebar:
  order: 7
lastUpdated: 2026-09-15
---

Damvia stores three kinds of data with very different recovery stories. The README's advice, "you don't need to backup data outside the DB as cloud storage retains all assets", is right for the assets bucket and incomplete for the main bucket.

| Store | Contains | Recovery without a backup |
|---|---|---|
| Postgres (`DATABASE_URL`) | Users, groups, regions, collections, pages, menu, products, licenses, asset types, the asset tree, downloads, job queue | None. This is the instance. |
| Main bucket (`MAIN_S3_URL`) | Collection thumbnails, page images, login background | None. Admins re-upload by hand. |
| Assets bucket (`ASSETS_S3_URL`) | Originals, previews, download archives | Rebuilt automatically: the integrity check re-queues every missing object from Dropbox or OneDrive. |
| Dropbox / OneDrive | The source files | Not Damvia's responsibility, and Damvia never writes to it. |

## Database

Any Postgres backup method works. The minimum:

```bash
pg_dump --format=custom "$DATABASE_URL" > damvia-$(date +%F).dump
```

Include the `pgboss` schema (the default `pg_dump` does): restoring it restores pending jobs. Excluding it is also acceptable, pg-boss recreates it and pending emails are lost.

Restore with `pg_restore --clean --if-exists -d "$DATABASE_URL" damvia-....dump` into an empty database, then start the server; migrations detect the restored `migrations` table and run nothing.

## Main bucket

Small (thumbnails and a few images) and irreplaceable. Options:

- MinIO: `mc mirror` the bucket to another location nightly, or back up the `minio` volume.
- AWS S3: enable versioning, or replicate to a second bucket.

## Assets bucket

Skip it if the cloud storage is trusted and re-downloading is acceptable. After a loss:

1. Create the bucket again.
2. Run `npm run cli -- check-integrity` (or wait for 05:00). Every asset file is marked `outdated` and queued; the worker re-downloads and re-thumbnails them, 10 at a time.
3. Download archives are not recreated; users request downloads again.

For a large library this takes hours to days and consumes provider bandwidth, which is the argument for backing it up anyway when the cloud storage is far or metered.

## Configuration

`server/.env` (or the environment of the container), `client/.env`, and `mailconfig.json` or `MAILCONFIG` are the rest of the instance. Keep them in your secret store; the Dropbox refresh token in particular cannot be recovered from Dropbox and must be re-issued if lost.

## Recovery drill

1. Restore the database dump into a fresh Postgres.
2. Restore or recreate both buckets.
3. Start the server with the saved environment.
4. Log in, open `/admin/assets` and a collection: thumbnails from the main bucket should show immediately; asset previews return as the integrity check and worker refill the assets bucket.
