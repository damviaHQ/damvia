---
title: Background jobs
description: Every queue and cron the worker runs, what triggers it, and what it does.
sidebar:
  order: 3
lastUpdated: 2026-09-20
---

Damvia runs its background work with [pg-boss](https://github.com/timgit/pg-boss), a job queue stored in the same Postgres database as the application. There is no Redis. Every API process connects pg-boss and can queue jobs; jobs are processed inside the API process when `ENABLE_WORKER=true`; see [Worker and scaling](../deployment/worker-and-scaling.md) for how to run it.

All queues are declared in `server/src/worker.ts`. The push helpers set `retryBackoff: true`. In installed pg-boss 12, defaults allow two retries after the initial attempt, expire active jobs after 15 minutes and delete completed jobs after seven days (there is no archive table). `uniqueKey` is passed as `singletonKey`, but standard queues without a singleton window do not deduplicate it; no current business caller provides a key.

## Scheduled jobs

| Queue | Cron | What it does |
|---|---|---|
| `asset/process-deletion` | `* * * * *` (every minute) | Deletes asset files and folders whose status is `pending_deletion`: removes the original and thumbnail from the assets bucket and the database rows. |
| `download/process-expired` | `* * * * *` (every minute) | Marks downloads past their `expiresAt` as `expired` and deletes the archive from the assets bucket. |
| `asset/assign-products-to-asset-files` | `*/5 * * * *` (every 5 minutes) | Matches every asset file name against `PRODUCT_MATCHING_REGEX` and links it to the product with the captured key. See [Products and PIM](../administration/products-and-pim.md). |
| `system/integrity-check` | `0 5 * * *` (daily at 05:00 UTC) | Compares the database with the assets bucket, re-queues files whose object is missing or has a different size, recomputes each collection's file count and four sample thumbnails, then deletes orphan objects older than 24 hours: originals and thumbnails without an asset file row, and archives of downloads that are gone, `expired` or `failed`. Same code as the [`check-integrity` CLI command](./cli.md). |
| `storage/measure-usage` | `*/30 * * * *` (every 30 minutes) | Lists every object of both buckets and stores the total in `storage_usage`. Reservations held by running `asset/update-content` jobs are kept; when no such job is active in `pgboss.job`, leftover reservations from a crashed process are cleared. With `STORAGE_QUOTA` set, it sends the `storage-alert` email when usage crosses 80, 90, 95 or 100 %, and once usage is back under the plan after the sync was paused, whether space was freed or the plan raised or removed, it clears the pause and queues `asset/update-content` for every `creating` or `outdated` file. It also reads the free space of `STORAGE_DISK_PATH` and sends `disk-alert` to `SERVER_ALERT_EMAILS` when the disk crosses the same thresholds. Also pushed by "Measure now" on the [dashboard](../administration/dashboard.md). |
| `activity/prune-events` | `30 4 * * *` (daily at 04:30 UTC) | Deletes the `activity_events` rows older than `ANALYTICS_RETENTION_DAYS` (365 by default) and logs `activity.pruned` with the number removed. Does nothing when the variable is `0`. See [Insights](../administration/analytics.md). |

## On-demand jobs

| Queue | Pushed by | What it does |
|---|---|---|
| `asset/update-content` | Cloud sync (`upsertFile`), integrity check, `storage/measure-usage`, "Retry pending files" on the dashboard | Does nothing unless the file is `creating` or `outdated`, so duplicate jobs are harmless. With `STORAGE_QUOTA` set, reserves the file's size against the plan first; a file that does not fit ends the job without a retry and is logged as `storage.quota-exceeded`. Otherwise downloads the file from the cloud storage driver, detects its MIME type, uploads the original to `asset-file/{id}`, generates a WebP thumbnail, reads width and height, sets status `up_to_date` and adds the size to `storage_usage`. An S3 upload failure fails the job, so it is retried and the file keeps its status. Processes 10 jobs at a time (`batchSize: 10`). |
| `collection/synchronization` | Linking a collection to an asset folder, and the cloud sync whenever a folder is created, renamed or moved | Refreshes the collection's name, files and child collections from its folder; never deletes a child. Takes a transaction-scoped advisory lock (`pg_advisory_xact_lock`) on the topmost synchronized ancestor, so two workers refreshing the same tree run one after the other. One job at a time per worker. |
| `download/create-archive` | `download.create` with type `email` | Checks current access, builds the file or zip archive, uploads it to `downloads/{id}`, then pushes `mailer/download-ready`. If access is no longer allowed, marks the download `failed` without retrying or sending a ready email. One job at a time. |
| `mailer/email-verification` | Sign-up, "resend verification" | Sends the `email-verification` template with the `?verificationCode=` link. |
| `mailer/log-in` | Login in passwordless mode or with the magic-link option | Sends the `login` template with a 180-day auth token. |
| `mailer/password-reset` | "Forgot password" | Sends the `reset-password` template with the job’s token only if that reset request is still current and unexpired. |
| `email/request-approval` | A user verifies their email while still unapproved | Sends the `request-approval` template to every admin and manager of the requester's region. |
| `email/user-approved` | A manager or admin approves a user | Sends the `user-approved` template with a login link. |
| `mailer/download-ready` | `download/create-archive` | Sends the `download-ready` template with a presigned link to the archive. |
| `mailer/invitation` | Inviting a guest to a collection | Sends the `invitation` template with a `?dam_token=` link that logs the guest in. |

Template contents are configured in [Email templates](../configuration/email-templates.md).

## The cloud sync is not a queue

The 5-minute loop that lists the cloud storage and upserts folders and files runs in `server/src/index.ts` with a plain `setTimeout`, in **every** API process, whether or not `ENABLE_WORKER` is set. It is the sync that pushes `asset/update-content` jobs; only the download and processing of file contents goes through pg-boss. See [Integrations](../integrations/index.md).

## Reading job failures in the logs

A failed job is logged by the worker as `job` with `status: failed`, the `queue` name, the `jobId` and the error message, then rethrown so pg-boss schedules the retry. pg-boss itself logs connection problems as `worker error`.

A file blocked by the storage plan is logged as `storage.quota-exceeded` with the asset file id and size, and the job finishes without a retry. The sync queues `creating` files again every 5 minutes, so the log line repeats until space is freed or the plan is raised; `outdated` files are queued again by `storage/measure-usage` once usage has dropped, or by the dashboard.

An export denied by the access check is handled separately: the archive transaction rolls back, then the worker saves the download as `failed` and logs `download.access-denied`. The queue job finishes without a retry; the download dialog shows the failed result. Other archive errors still follow the normal retry policy. Jobs for downloads already ready, failed or expired do nothing.

:::tip
pg-boss keeps its tables in the `pgboss` schema of `DATABASE_URL`. `SELECT name, state, count(*) FROM pgboss.job GROUP BY 1, 2;` is the quickest way to see what is queued, active or failed. Only the process started with `ENABLE_WORKER=true` supervises the queues and fires the cron schedules; API-only processes and the CLI just send jobs. An instance upgraded from pg-boss 10 keeps its old tables in `pgboss_legacy_v10` until you drop them; see [Upgrading](../deployment/upgrading.md#pg-boss-12-in-this-upgrade).
:::
