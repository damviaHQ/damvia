---
title: Local setup
description: Run the full stack on one machine with docker-compose for the services and npm for the server and client.
sidebar:
  order: 2
lastUpdated: 2026-09-19
---

This procedure targets a local development instance. Compilation and documentation checks have been run on macOS; a complete cloud-connected installation has not been exercised. Use the [acceptance checklist](../deployment/acceptance-checklist.md) to validate your instance.

## 1. Clone and install

```bash
git clone https://github.com/damviaHQ/damvia.git
cd damvia
cd server && npm install
cd ../client && npm install
```

Install the server first: the client's `package.json` links it as `"server": "file:../server"` to share the tRPC router types.

## 2. Start the services

```bash
cd ../server
docker-compose up -d
```

This starts three containers under the project name `damvia-preview`:

| Container | Port | Credentials |
|---|---|---|
| `postgres` (15) | `5432` | `dam` / `dam`, database `dam` |
| `minio` | `9000` API, `8090` console | `dam` / `damdamdamdam` |
| `mailhog` | `1025` SMTP, `8025` web UI | none |

Open the MinIO console at `http://localhost:8090`, sign in, and create two buckets: `dam` and `dam-assets`. The server does not create buckets.

## 3. Configure the server

```bash
cp .env.template .env
```

The template's defaults already match the compose stack (database, MinIO, MailHog). Fill in:

- `ASSET_UPDATER` and the matching `DROPBOX_*`, `ONEDRIVE_*` or `GOOGLE_DRIVE_*` variables. See [Dropbox](../integrations/dropbox.md), [OneDrive](../integrations/onedrive.md) or [Google Drive](../integrations/google-drive.md); the refresh token, app registration or service account is the only step that takes real time.
- `APP_SECRET`: any long random string, for example `openssl rand -hex 32`.
- `PRODUCT_MATCHING_REGEX` if your file names encode product keys; otherwise leave the example, it is harmless.

Leave `MAILCONFIG` empty: the server then reads `server/mailconfig.json`, whose templates are fine for a first run. The full list is in [Environment variables](../reference/environment-variables.md).

## 4. Start the server

```bash
npm run dev
```

`npm run dev` runs `nodemon` with `ts-node` and sets `ENABLE_WORKER=true`. Driver initialisation and the first sync start concurrently with database initialisation. The API listens on `http://localhost:3000` before worker startup finishes. Log ordering is not guaranteed: check for migration errors, `server listening`, and a subsequent `assets updated successfully`. The next sync starts 5 minutes after the previous attempt ends.

Files appear in the database with status `creating` and are downloaded and thumbnailed by the worker in batches of 10; a large library takes a while to fill in.

## 5. Configure and start the client

In a second terminal, start from the root of the cloned `damvia` repository:

```bash
cd client
cp .env.template .env
npm run dev
```

`VITE_API_ENDPOINT` defaults to `http://localhost:3000/trpc`, which is the dev server. The client is at `http://localhost:5173`, which is also the server's default `APP_URL`, so email links work out of the box.

## 6. Create the first account

Sign up at `http://localhost:5173/sign-up`. The region dropdown offers `Global`, seeded by the initial migration. The verification email lands in MailHog at `http://localhost:8025`; click its link. The account is now verified but not approved, and has the `member` role. Promote it in SQL as described in [First admin](./first-admin.md), reload, and the admin menu appears.

## Day-to-day

| Task | Command |
|---|---|
| Stop the services, keep the data | `docker-compose stop` in `server/` |
| Wipe everything and start over | `docker-compose down -v` in `server/` (deletes the `postgres` and `minio` volumes) |
| Force a full consistency pass between database and MinIO | `npm run cli -- check-integrity` in `server/` |
| See queued and failed jobs | `psql postgresql://dam:dam@localhost/dam -c "select name, state, count(*) from pgboss.job group by 1,2"` |
| Type-check the client | `npm run build` in `server/`, then `npm run typecheck` in `client/` |
| Run the server suites | `SECURITY_TEST_DATABASE_URL=postgresql://dam:dam@localhost/dam_test npm test` in `server/`, after creating the `dam_test` database once |
| Run the client suites | `npm test` in `client/` |

:::note
The cloud sync marks anything absent from the listing as `pending_deletion` and the deletion job checks it every minute. Pointing a development instance at a production Dropbox is safe for Dropbox (Damvia never writes to it), but the local MinIO copy will be rebuilt from scratch.
:::
