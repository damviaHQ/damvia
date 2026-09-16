---
title: Ports and services
description: What listens where, in development with docker-compose and in production.
sidebar:
  order: 5
lastUpdated: 2026-09-16
---

Damvia is two processes you run (API and client) plus three services it depends on (Postgres, S3-compatible storage, SMTP). The development `server/docker-compose.yml` provides the three services with fixed ports and credentials.

## Development stack

| Service | Port(s) | Credentials | Notes |
|---|---|---|---|
| API server (`npm run dev` in `server/`) | `3000` | — | tRPC under `/trpc`, one REST route `/v1/downloads/:id`. Set by `PORT`. |
| Client (`npm run dev` in `client/`) | `5173` | — | Vite dev server. `APP_URL` must point here. |
| Postgres 15 (`postgres` in compose) | `5432` | user `dam`, password `dam`, database `dam` | Matches the code default `postgresql://dam:dam@localhost/dam`. Data in the named volume `postgres`. |
| MinIO (`minio` in compose) | `9000` API, `8090` console | root user `dam`, password `damdamdamdam` | Create the buckets `dam` and `dam-assets` in the console at `http://localhost:8090`. Data in the named volume `minio`. |
| MailHog (`mailhog` in compose) | `1025` SMTP, `8025` web UI | none | Matches the code defaults `SMTP_HOST=localhost`, `SMTP_PORT=1025`. Read outgoing mail at `http://localhost:8025`. |

The compose project is named `damvia-preview`, so Compose normally names containers with `damvia-preview-` and volumes with `damvia-preview_` (for example `damvia-preview_postgres`).

## Production

| Component | Exposure |
|---|---|
| API server | Behind a reverse proxy at `API_URL`, HTTPS. Listens on `0.0.0.0:${PORT}` inside its container. |
| Client build | Static files served at `APP_URL`, HTTPS, with history fallback. See [Client build](../deployment/client-build.md). |
| Postgres | Private network only. |
| S3 / MinIO | Reachable by the server, and by browsers: uploads use presigned PUT URLs and downloads redirect to presigned GET URLs, so the S3 endpoint in `MAIN_S3_URL` and `ASSETS_S3_URL` must be resolvable from the user's browser. |
| SMTP | Outbound from the server only. |
| Dropbox / Microsoft Graph | Outbound HTTPS from the server only. |

Details for the proxy are in [Reverse proxy](../deployment/reverse-proxy.md).
