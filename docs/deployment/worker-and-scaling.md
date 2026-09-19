---
title: Worker and scaling
description: Understand which tasks run in the server process, why the worker must be enabled, and the current limits on running multiple processes.
sidebar:
  order: 5
lastUpdated: 2026-09-19
---

The server process has three roles: the HTTP API, the pg-boss worker, and the cloud sync loop. Only the worker is optional, and the way the three are coupled decides your scaling options.

## ENABLE_WORKER starts pg-boss in the API process

Before the HTTP server listens, `startQueues()` connects pg-boss to `DATABASE_URL` and creates every queue, whatever the flag, so any process can queue jobs. With `ENABLE_WORKER=true` it also registers the cron schedules and starts polling. Everything asynchronous runs here: emails, `asset/update-content` (downloads and thumbnails), archives, deletions, product assignment, the integrity check, the storage measurement. The full list is in [Background jobs](../reference/background-jobs.md).

`npm run dev` sets the flag. `npm start` and the Docker `CMD` do not: set it yourself on the container that should do the work.

## The sync loop runs everywhere

`server/src/index.ts` starts the cloud storage sync before anything else, unconditionally. Every server process lists every configured source every 5 minutes, one after another, and upserts the whole tree. Two API replicas mean two concurrent full listings writing the same rows; the code retries on Postgres deadlocks (three attempts) but it doubles the provider traffic and the database load for no benefit.

**Run one server process.** It handles the API, the worker and the sync. This is the configuration the code is written for.

## If you need more capacity

Options, from simplest to most involved:

| Need | Approach |
|---|---|
| Faster previews on first import | Give the single process more CPU; `asset/update-content` handles 10 jobs concurrently and LibreOffice or ffmpeg conversions are CPU-bound. |
| API latency during heavy processing | An API process with `ENABLE_WORKER` off queues jobs for another process to run, but every process still runs the cloud sync (see below), so this setup is not supported yet. |
| No duplicate sync | Not configurable today. A second process always syncs. |

pg-boss decides which worker picks up a job. If that job times out or is interrupted, a retry can repeat actions such as an upload or email send. Running the API and worker separately also requires code changes so only one process runs cloud sync.

## Job concurrency inside the worker

| Queue | Concurrency |
|---|---|
| `asset/update-content` | `batchSize: 10`, ten downloads and conversions at once |
| `collection/synchronization`, `download/create-archive` | `batchSize: 1` |
| Everything else | pg-boss default (one job per poll) |

Inside `download/create-archive`, files are transformed 25 at a time.

## Memory and disk

- One source's full listing is held in memory during its run, then released before the next source starts, so the peak follows the largest source, not their number. Measured on a synthetic OneDrive listing of 100,000 items: 80 MB for the raw listing, 25 MB for the plan derived from it. Size the container at 512 MB for the server plus 2 MB per 1,000 items in the largest source; a 200,000-item source fits in 1 GB. Dropbox file downloads also buffer content in memory.
- Downloads and conversions use the OS temp directory; see [Server with Docker](./server-docker.md).
- pg-boss stores jobs in the `pgboss` schema and deletes completed ones after seven days; the tables grow with activity and the worker process prunes them on its own schedule. Only the worker process (`ENABLE_WORKER=true`) supervises queues and fires cron schedules.

## Restarting

With the installed pg-boss defaults, an active job expires after 15 minutes and a failed job can be retried twice. Restarting during a job can leave temporary files, an uploaded object or an email already sent. Jobs that have exhausted their retries are not restarted automatically, so a download can stay `preparing`. Check the failed job and its download record before submitting a new request. See [Operations](./operations.md).
