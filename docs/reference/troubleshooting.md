---
title: Troubleshooting
description: The failures a new instance meets first, what they mean, and the fix.
sidebar:
  order: 6
lastUpdated: 2026-09-16
---

Symptoms are grouped by where you notice them. Server messages are quoted as they appear in the logs (Winston, plain text on stdout).

## The server does not start

| Message | Cause | Fix |
|---|---|---|
| `Provide a valid asset updater` | `ASSET_UPDATER` is not `dropbox` or `onedrive`. | Set it. There is no "no sync" mode; a driver is mandatory. |
| `Failed to read mailconfig.json` then exit | `MAILCONFIG` is unset and `server/mailconfig.json` is missing or unreadable from the process working directory's parent of `dist/` (the server reads `../mailconfig.json` relative to the compiled `env.js`). | Set `MAILCONFIG` to the base64 of your JSON, or keep `mailconfig.json` next to `package.json`. |
| `failed to start asset updater` then exit | The driver's `initialize()` failed: for Dropbox, the refresh token could not be exchanged (`Failed to refresh Dropbox token`). | Check `DROPBOX_APP_KEY`, `DROPBOX_APP_SECRET`, `DROPBOX_REFRESH_TOKEN`. See [Dropbox](../integrations/dropbox.md). |
| Connection refused on Postgres | `DATABASE_URL` unset and nothing listens on `localhost:5432`, or wrong credentials. | Start `docker-compose up -d` in `server/`, or set `DATABASE_URL`. |
| `TypeError: Invalid URL` at first S3 use | `MAIN_S3_URL` or `ASSETS_S3_URL` missing or not a URL. | Use the `http://key:secret@host:port/bucket` form. |
| Migration error at boot | Migrations run automatically and one failed, usually because the database was created by hand without required `uuid-ossp` / `hstore` extensions or with a different schema. | For a new installation, use an empty owned database with the extensions. For an existing instance, inspect the failed migration and take a backup before any schema repair. See [Upgrading](../deployment/upgrading.md). |

## Sync does nothing

| Symptom | Cause | Fix |
|---|---|---|
| Log says `Dropbox listing is empty, skipping sync to avoid deleting all assets` | The app sees an empty root: wrong permission type (app folder vs full Dropbox), wrong account, or the files live in the team space while `DROPBOX_USE_TEAM_ROOT` is `false`. | Re-check the app's access type and set `DROPBOX_USE_TEAM_ROOT=true` for Dropbox Business team folders. |
| Folders appear but files stay in status `creating` with no thumbnail | The worker is off, queue publication failed, startup raced database/queue initialisation, or processing jobs failed. | Run one process with `ENABLE_WORKER=true`. See [Worker and scaling](../deployment/worker-and-scaling.md). |
| Files appear but have no preview | A system package is missing: `ffmpeg` (video), `ghostscript` (PDF, EPS, AI), `libreoffice` (office documents), `imagemagick`. | Install them; the `server/Dockerfile` does. Then mark the affected asset ids `outdated` and run the CLI with the worker active; see the [targeted refresh procedure](../deployment/integrity-check.md#targeted-refresh-of-a-stale-original-or-missing-preview). |
| A changed source file still serves the old version | The provider checksum changed but its `asset/update-content` job failed or is still queued, or the provider did not expose a usable checksum change. | Check the file status and the `asset/update-content` jobs first. The daily [integrity check](../deployment/integrity-check.md) catches missing or size-mismatched originals, not every same-size content change. Use its targeted refresh procedure only after diagnosing the queue/source. |
| OneDrive: Graph reports an access/path error | `ONEDRIVE_DRIVE` does not point to an existing path, or the app registration lacks `Files.Read.All` application permission with admin consent. | See [OneDrive](../integrations/onedrive.md). |

## Users cannot get in

| Symptom | Cause | Fix |
|---|---|---|
| After sign-up the screen says the account must be approved | `approved` is `false`: the email domain is not in the authorized domains list. | An admin or a manager of the user's region approves them under `/admin/users`, or add the domain under `/admin/authorized-domains` for future sign-ups. The very first admin is promoted in SQL: see [First admin](../getting-started/first-admin.md). |
| The verification or login email never arrives | SMTP settings are wrong, or the worker is off (all emails are queued jobs). | Check `SMTP_*`, check the worker is enabled, look at the `mailer/*` queues in `pgboss.job`. In development, open MailHog at `http://localhost:8025`. |
| The approval request reaches nobody | `email/request-approval` only mails admins and managers **of the requester's region**. If that region has none, the job sends nothing. | Give each region at least one manager or admin. |
| Everyone was logged out at once | `APP_SECRET` changed. | Expected: tokens are signed with it. |
| A guest's invitation link says the link expired or shows the login page | The invitation's `expiresAt` has passed, or the token in `?dam_token=` was issued before an `APP_SECRET` change. | Re-invite the guest. |

## Downloads

| Symptom | Cause | Fix |
|---|---|---|
| "Email" downloads stay in `preparing` | Worker off, or `download/create-archive` failing (check the job log). | Enable the worker; check disk space in the server's temp directory, the archive is built there before upload. |
| Download link opens `/link-expired` | The download is older than 7 days, or the id is unknown. | Create a new download. |
| The browser cannot reach the presigned URL | The S3 endpoint in `ASSETS_S3_URL` is only resolvable from the server. | Expose the S3 endpoint publicly (HTTPS) and use that hostname in the URL. See [Object storage](../integrations/object-storage.md). |
| `You cannot download more than 10GB.` | The selection's total original size is at or above 10 GB. | Split the download. |

## Client

| Symptom | Cause | Fix |
|---|---|---|
| Every request fails with a network error | `VITE_API_ENDPOINT` points to the wrong host, or was changed without rebuilding. | Fix `client/.env` and rebuild; the value is baked in at build time. |
| Deep links (for example `/collections/abc`) return 404 from the web server | The static host lacks the SPA history fallback. | See [Client build](../deployment/client-build.md). |
| The brand colour did not change | Tailwind reads `client/.env` at build time. | Restart `npm run dev` or rebuild. |
