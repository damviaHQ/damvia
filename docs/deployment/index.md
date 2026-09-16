---
title: Deployment
description: The production topology and the order to set it up in.
sidebar:
  order: 1
lastUpdated: 2026-09-16
---

A production Damvia is one Node.js process (API plus worker plus cloud sync), one static site, and three services. The repository ships a Dockerfile for the server and nothing else: how you host the static client, Postgres, S3 and SMTP is your choice.

```
 users ──HTTPS──▶ APP_URL  (static client build)
   │
   └────HTTPS──▶ API_URL  (server container, port 3000)
                    │  ├── Postgres 15  (DATABASE_URL, also pg-boss)
                    │  ├── S3 / MinIO   (MAIN_S3_URL, ASSETS_S3_URL) ◀── users, presigned URLs
                    │  ├── SMTP         (SMTP_*)
                    │  └── Dropbox / Microsoft Graph (outbound, every 5 minutes)
```

## Pages in this group, in setup order

| Step | Page |
|---|---|
| 1. Build and run the server image, with the worker enabled | [Server with Docker](./server-docker.md), [Worker and scaling](./worker-and-scaling.md) |
| 2. Build the client and serve it as a static site | [Client build](./client-build.md) |
| 3. Put both behind HTTPS and make S3 reachable | [Reverse proxy](./reverse-proxy.md) |
| 4. Plan updates | [Upgrading](./upgrading.md) |
| 5. Plan backups and the recovery drill | [Backups](./backups.md), [Integrity check](./integrity-check.md) |

## Minimum viable production

- One VM with Docker: the server container, a Postgres container, a MinIO container, and Caddy or nginx in front. The client build is a folder served by the same proxy.
- Postmark (or another SMTP relay) for mail.
- A nightly `pg_dump` and a copy of the MinIO main bucket sent off the machine.

Keep configuration/secrets and application version with the database and main-bucket backups. The examples require deployment-specific credentials, DNS and certificate provisioning; they are not a tested turnkey production distribution.

## What you do not need

- No Redis or message broker: pg-boss uses Postgres.
- No migration step on deploy: migrations run when the server starts.
- No scheduled task outside the process: crons are pg-boss schedules inside the worker.
- No backup of the assets bucket if the cloud storage is trusted: it can be rebuilt. The main bucket is different; see [Backups](./backups.md).

## Validate and operate

Use the [acceptance checklist](./acceptance-checklist.md) after setup and the [operations runbook](./operations.md) for monitoring. Review [known limitations](../reference/known-limitations.md) before exposing the API; the current code has access-control defects that documentation alone cannot resolve.
