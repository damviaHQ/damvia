---
title: Writing a background job
description: Declare a pg-boss queue with createQueue, push jobs from the API, understand retries and deduplication, and run a job by hand.
sidebar:
  order: 5
lastUpdated: 2026-09-16
---

This page explains the job mechanism in `server/src/worker.ts` so you can add a queue or debug one. The list of existing queues, their crons and what they do is in [Background jobs](../reference/background-jobs.md); how to run the worker in production is in [Worker and scaling](../deployment/worker-and-scaling.md).

## One helper declares a queue, its processor and its cron

`worker.ts` creates a single `PgBoss` instance, `boss`, on `DATABASE_URL`, logs its `error` events as `worker error`, and exports `createQueue`:

```ts
export const downloadCreateArchiveQueue = createQueue<{ downloadId: string }>({
	name: 'download/create-archive',
	processor: (data) => dataSource.transaction(async (em) => {
		const download = await em.getRepository(Download).findOneBy({ id: data.downloadId })
		if (!download) {
			return
		}
		await createDownloadArchive({ em, download })
		await mailerDownloadReadyQueue.push({ downloadId: download.id })
	}),
	workerOptions: { batchSize: 1 },
})
```

| Option | Meaning |
|---|---|
| `name` | The pg-boss queue name, by convention `<area>/<verb-object>` (`asset/update-content`, `mailer/invitation`) |
| `processor` | `(data: T) => any`, called once per job with the job's payload |
| `cron` | Optional. When set, `boss.schedule(name, cron)` makes pg-boss enqueue an empty job on that schedule; the payload type is then `void` |
| `workerOptions` | Optional `PgBoss.WorkOptions`; the code uses `batchSize` (10 for `asset/update-content`, 1 for `collection/synchronization` and `download/create-archive`) |

`createQueue` returns an object with two methods and nothing else:

- `push(data, { uniqueKey? })` calls `boss.send` with `retryBackoff: true` and `singletonKey: uniqueKey`.
- `bulkPush([{ data, uniqueKey? }])` calls `boss.insert` with the same two options on every entry, in one round trip. `upsertFolder` uses it to queue one `collection/synchronization` per affected collection, and the integrity check to re-queue every outdated file.

`retryBackoff: true` makes pg-boss retry a failed job with exponential backoff, using pg-boss's default retry limit since none is set here. The installed defaults are two retries after the first attempt and a 15-minute active-job expiry. A `singletonKey` alone does not deduplicate the default `standard` queue: that requires an appropriate queue policy or `singletonSeconds` window and tests of its semantics. No current business call supplies `uniqueKey`.

## Registration happens at module load, activation in startWorker

`createQueue` does not talk to the database when called. It pushes an initializer into the module-level `workerInitializers` array and returns the `push` / `bulkPush` pair immediately. `startWorker()` then runs `boss.start()` and every initializer in declaration order; each one calls `boss.createQueue(name)`, `boss.schedule(name, cron)` when a cron is set, and `boss.work(name, workerOptions, handler)`.

Two consequences for a new queue:

1. Declare it as an `export const` in `worker.ts` and import that constant where you push (`services/asset.ts` imports `assetUpdateContentQueue` and `collectionSynchronizationQueue`; `trpc/router/user.ts` imports the mailer queues). A declaration in another module is also registered if that module imports the same helper and is loaded before `startWorker()` runs.
2. Pushing works in any process, worker or not: `push` only needs `boss` to be started. The API process starts `boss` inside `startWorker` when `ENABLE_WORKER=true`; the CLI starts it explicitly with `boss.start()`. A process that has neither cannot push.

`worker.ts` imports the services, and `services/asset.ts` imports `worker.ts` back. This circular import works because the queue constants are only dereferenced inside functions, after both modules have loaded; keep new code in the same shape and do not call `push` at module top level.

## The handler wraps every job in the same error logging

The `boss.work` handler receives a batch of jobs and runs `processor(job.data)` for each with `Promise.all`. A rejected processor is logged as:

```
error: job {"status":"failed","queue":"<name>","jobId":"<uuid>","error":"<message>","stacktrace":...}
```

then rethrown so pg-boss marks the job failed and schedules the retry. The wrapper reads `error.stacktrace`, a property `Error` does not define, so no stack trace reaches the log; log with `logger` from `env.ts` inside the processor when you need more than the message. Anything the processor resolves with is ignored.

## Use a transaction when a job writes several rows

Processors that touch more than one table run inside `dataSource.transaction(async (em) => ...)` and pass `em` down to the service (`synchronizeCollection(em, id)`, `createDownloadArchive({ em, download })`). The services accept an `EntityManager` for that reason; follow the same signature in a new service so the job can pass its transaction. Processors that do a single repository write (`mailer/*`, `asset/update-content`) use `dataSource.getRepository` directly.

Because the transaction spans the whole processor, an exception rolls back every row the job wrote before pg-boss retries it. S3 operations, email sends and queue sends through the separate boss connection do not participate in this transaction. Even a send at the end of the callback occurs before commit. Design retries to tolerate duplicates and partial side effects; the current wrapper does not provide exactly-once execution.

## Cron jobs receive no payload

A scheduled queue is `createQueue<void>` with `processor: () => someService()`. pg-boss stores the schedule and enqueues a job at each tick; the same processor also runs for jobs pushed by hand with `queue.push(undefined)`. The four crons in the code are listed in [Background jobs](../reference/background-jobs.md).

## Running a job by hand

The CLI in `server/src/cli.ts` is the pattern: it initialises `dataSource`, calls `boss.start()`, and defines commands with `commander`. `check-integrity` calls the service directly (`systemService.integrityCheck()`) rather than pushing a job, so it runs in the CLI process and exits with `process.exit(0)`.

To run a processor or push a job during development, add a command following `check-integrity`:

```ts
const pushCmd = new Command('push-update-content')
pushCmd.argument('<assetFileId>')
pushCmd.action(async (assetFileId: string) => {
	await assetUpdateContentQueue.push({ assetFileId })
	process.exit(0)
})
program.addCommand(pushCmd)
```

then `npm run cli -- push-update-content <id>` from `server/`. The job runs in whichever process has the worker enabled, typically the `npm run dev` server. To run the processor itself in the CLI process instead, call the service function directly as `check-integrity` does; `dataSource.initialize()` has already run by then.

`SELECT name, state, count(*) FROM pgboss.job GROUP BY 1, 2;` shows what is queued, active, completed or failed.

:::caution
The 5-minute cloud sync is not a job. It is a `setTimeout` loop in `server/src/index.ts` that runs in every API process regardless of `ENABLE_WORKER`, and it is what pushes `asset/update-content`. Do not look for it in `pgboss.job`, and do not add work to it that belongs in a queue.
:::

## Checklist for a new queue

1. `export const myQueue = createQueue<Payload>({ name: 'area/verb-object', processor, cron?, workerOptions? })` in `server/src/worker.ts`.
2. Import `myQueue` where it is pushed and call `push` or `bulkPush`, with an explicit tested deduplication policy if duplicates must be prevented (`uniqueKey` alone is insufficient).
3. Add a row to the table in [Background jobs](../reference/background-jobs.md); `scripts/check-docs.sh` fails when a queue name in `worker.ts` is missing there.

Schedules use UTC because `boss.schedule` receives no `tz` option. A retry may overlap external work that exceeded the active-job expiry. Restarting a process is not a guarantee that a `preparing` download eventually completes: check terminal job failures and cleanup of temporary files.
