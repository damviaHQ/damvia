---
title: Worker and scaling
description: One flag turns the job worker on; the cloud sync loop is not gated by it, which shapes how many processes you can run.
sidebar:
  order: 5
lastUpdated: 2026-09-15
---

The server process has three roles: the HTTP API, the pg-boss worker, and the cloud sync loop. Only the worker is optional, and the way the three are coupled decides your scaling options.

## ENABLE_WORKER starts pg-boss in the API process

With `ENABLE_WORKER=true`, after the HTTP server is listening, `startWorker()` connects pg-boss to `DATABASE_URL`, creates every queue, registers the cron schedules and starts polling. Everything asynchronous runs here: emails, `asset/update-content` (downloads and thumbnails), archives, deletions, product assignment, the integrity check. The full list is in [Background jobs](../reference/background-jobs.md).

`npm run dev` sets the flag. `npm start` and the Docker `CMD` do not: set it yourself on the container that should do the work.

## The sync loop runs everywhere

`server/src/index.ts` starts the cloud storage sync before anything else, unconditionally. Every server process lists Dropbox or OneDrive every 5 minutes and upserts the whole tree. Two API replicas mean two concurrent full listings writing the same rows; the code retries on Postgres deadlocks (three attempts) but it doubles the provider traffic and the database load for no benefit.

**Run one server process.** It handles the API, the worker and the sync. This is the configuration the code is written for.

## If you need more capacity

Options, from simplest to most involved:

| Need | Approach |
|---|---|
| Faster previews on first import | Give the single process more CPU; `asset/update-content` handles 10 jobs concurrently and LibreOffice or ffmpeg conversions are CPU-bound. |
| API latency during heavy processing | Run two containers from the same image: one with `ENABLE_WORKER=true` that also receives no public traffic, one with `ENABLE_WORKER` unset that serves `API_URL`. Both still run the sync loop. |
| No duplicate sync | Not configurable today. A second process always syncs. |

pg-boss guarantees that a job is handled by one worker at a time, so several worker processes would be safe for the queues; the constraint is the sync loop, not the queues.

## Job concurrency inside the worker

| Queue | Concurrency |
|---|---|
| `asset/update-content` | `batchSize: 10`, ten downloads and conversions at once |
| `collection/synchronization`, `download/create-archive` | `batchSize: 1` |
| Everything else | pg-boss default (one job per poll) |

Inside `download/create-archive`, files are transformed 25 at a time.

## Memory and disk

- A full listing of the cloud storage is held in memory during sync; tens of thousands of entries is fine, millions is not.
- Downloads and conversions use the OS temp directory; see [Server with Docker](./server-docker.md).
- pg-boss stores jobs in the `pgboss` schema and archives completed ones; the tables grow with activity and pg-boss prunes them on its own schedule.

## Restarting

A restart is safe at any point. Jobs in progress are retried after pg-boss's expiry interval, the sync loop starts over, and a half-built archive is left in the temp directory (cleaned when the container's `/tmp` is). Downloads that were `preparing` finish on the retry.
