---
title: Operations
description: Monitor sync completion, queues, temporary storage, provider credentials and email delivery.
sidebar:
  order: 9
lastUpdated: 2026-09-16
---

An API response confirms that the server can answer a request. You also need to check that cloud sync, background tasks, storage and email are working. Use the server logs and the read-only database queries below.

## What to check

| Check | Expected result | If it fails |
|---|---|---|
| `GET /trpc/env` | JSON with app name and regions | Inspect listener, database and migrations. This says nothing about SMTP or S3. |
| `assets updated successfully` | Recent after each complete sync pass | Inspect provider and per-entry errors. The interval is run duration plus five minutes; alert against your measured baseline. |
| Asset processing | `creating`/`outdated` counts decline after imports | Inspect `asset/update-content` failures, source access, temp space and S3. Check actual object/preview availability. |
| Queue state | Active/retry jobs eventually finish | Look for jobs marked `failed` after using all their retries before starting the same task again. |
| Temporary disk and memory | Headroom during peak conversions/exports | Count originals, conversions and archives concurrently; Dropbox buffers downloaded contents too. |
| SMTP delivery | A controlled test reaches a test inbox | Check queue state and provider delivery log, not just absence of server errors. |
| Provider credentials | Current, unexpired secrets with expected scopes | Track OneDrive secret expiry; test rotation before expiry. Dropbox revocation stops refresh. |

## Read-only queue and asset checks

Run on the intended instance database with an operator account:

```sql
SELECT name, state, count(*)
FROM pgboss.job GROUP BY name, state ORDER BY name, state;

SELECT status, count(*) FROM asset_files GROUP BY status;

SELECT id, status, created_at, expires_at
FROM downloads WHERE status = 'preparing' ORDER BY created_at;
```

Inspect individual job errors through the logs. Avoid exporting full job payloads, which may contain email addresses or other personal data. A growing queue is not fixed by adding an API replica: current topology requires one process with `ENABLE_WORKER=true`.

## Downloads stuck in preparing

Find the matching `download/create-archive` job and its error. Check temporary disk, conversion tooling, source objects and S3 writes. The default active-job expiry is 15 minutes and retry limit is two after the first attempt; long-running conversions can exceed it. An archive may already have been uploaded or an email sent even if the database changes were rolled back.

After correcting the cause, check whether pg-boss still has a retry scheduled and whether that retry finishes. If the job has used all its retries and is marked `failed`, submit a new test download request. Restarting the server will not retry it again. Before deleting abandoned temporary files, confirm that no running task is using them.

## Routine maintenance

Rehearse [Backups](./backups.md), monitor the resulting recovery time, and run the [acceptance checklist](./acceptance-checklist.md) after deployment, credential rotation or storage changes. Keep a record of the code/image versions and the latest successful sync, email and restore tests. These are operator checks; end-user instructions belong in a separate guide.
