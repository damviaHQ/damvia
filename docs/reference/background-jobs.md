---
title: Background jobs
description: Every queue and cron the worker runs, what triggers it, and what it does.
sidebar:
  order: 3
lastUpdated: 2026-09-16
---

Damvia runs its background work with [pg-boss](https://github.com/timgit/pg-boss), a job queue stored in the same Postgres database as the application. There is no Redis. The worker starts inside the API process when `ENABLE_WORKER=true`; see [Worker and scaling](../deployment/worker-and-scaling.md) for how to run it.

All queues are declared in `server/src/worker.ts`. The push helpers set `retryBackoff: true`. In installed pg-boss 10.2.0, defaults allow two retries after the initial attempt and expire active jobs after 15 minutes. `uniqueKey` is passed as `singletonKey`, but standard queues without a singleton window do not deduplicate it; no current business caller provides a key.

## Scheduled jobs

| Queue | Cron | What it does |
|---|---|---|
| `asset/process-deletion` | `* * * * *` (every minute) | Deletes asset files and folders whose status is `pending_deletion`: removes the original and thumbnail from the assets bucket and the database rows. |
| `download/process-expired` | `* * * * *` (every minute) | Marks downloads past their `expiresAt` as `expired` and deletes the archive from the assets bucket. |
| `asset/assign-products-to-asset-files` | `*/5 * * * *` (every 5 minutes) | Matches every asset file name against `PRODUCT_MATCHING_REGEX` and links it to the product with the captured key. See [Products and PIM](../administration/products-and-pim.md). |
| `system/integrity-check` | `0 5 * * *` (daily at 05:00 UTC) | Compares the database with the assets bucket, re-queues files whose object is missing or has a different size, and recomputes each collection's four sample thumbnails. Same code as the [`check-integrity` CLI command](./cli.md). |

## On-demand jobs

| Queue | Pushed by | What it does |
|---|---|---|
| `asset/update-content` | Cloud sync (`upsertFile`), integrity check | Downloads the file from Dropbox or OneDrive, detects its MIME type, uploads the original to `asset-file/{id}`, generates a WebP thumbnail, reads width and height, sets status `up_to_date`. Processes 10 jobs at a time (`batchSize: 10`). |
| `collection/synchronization` | Linking a collection to an asset folder | Mirrors the folder's sub-tree into the collection tree. One job at a time. |
| `download/create-archive` | `download.create` with type `email` | Builds the file or zip archive, uploads it to `downloads/{id}`, then pushes `mailer/download-ready`. One job at a time. |
| `mailer/email-verification` | Sign-up, "resend verification" | Sends the `email-verification` template with the `?verificationCode=` link. |
| `mailer/log-in` | Login in passwordless mode or with the magic-link option | Sends the `login` template with a 180-day auth token. |
| `mailer/password-reset` | "Forgot password" | Sends the `reset-password` template. |
| `email/request-approval` | A user verifies their email while still unapproved | Sends the `request-approval` template to every admin and manager of the requester's region. |
| `email/user-approved` | A manager or admin approves a user | Sends the `user-approved` template with a login link. |
| `mailer/download-ready` | `download/create-archive` | Sends the `download-ready` template with a presigned link to the archive. |
| `mailer/invitation` | Inviting a guest to a collection | Sends the `invitation` template with a `?dam_token=` link that logs the guest in. |

Template contents are configured in [Email templates](../configuration/email-templates.md).

## The cloud sync is not a queue

The 5-minute loop that lists Dropbox or OneDrive and upserts folders and files runs in `server/src/index.ts` with a plain `setTimeout`, in **every** API process, whether or not `ENABLE_WORKER` is set. It is the sync that pushes `asset/update-content` jobs; only the download and processing of file contents goes through pg-boss. See [Integrations](../integrations/index.md).

## Reading job failures in the logs

A failed job is logged by the worker as `job` with `status: failed`, the `queue` name, the `jobId` and the error message, then rethrown so pg-boss schedules the retry. pg-boss itself logs connection problems as `worker error`.

:::tip
pg-boss keeps its tables in the `pgboss` schema of `DATABASE_URL`. `SELECT name, state, count(*) FROM pgboss.job GROUP BY 1, 2;` is the quickest way to see what is queued, active or failed.
:::
