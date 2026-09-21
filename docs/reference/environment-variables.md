---
title: Environment variables
description: Every variable the server and the client read, with its default and where it is used.
sidebar:
  order: 2
lastUpdated: 2026-09-21
---

This table is the source of truth. `server/.env.template` and `client/.env.template` are copies to start from; `scripts/check-docs.sh` fails when a variable used in the code is missing here. For the reasoning behind each group of settings, read [Server configuration](../configuration/server-env.md).

The server loads `server/.env` with `dotenv` at startup (`server/src/env.ts`). `APP_SECRET` is validated at startup. Other variables may use a default or fail when first used; empty and absent values can behave differently.

## Server

### Application

| Variable | Default | Purpose |
|---|---|---|
| `APP_NAME` | `Damvia - Open Source Digital Asset Management` | Returned by the public `env` query; the client uses it as the document title. |
| `ADMIN_CLIENT_LOGO` | `false` | Host-only: `true` uses the uploaded client logo in the admin sidebar when available; otherwise Damvia. Cannot be changed through the DAM admin. `ADMIN-CLIENT-LOGO` is an accepted alias and takes precedence when both are set. Restart the server after changing it. |
| `APP_URL` | `http://localhost:5173` | Public URL of the client. Every link in an email is built from it, and expired download links redirect to `APP_URL/link-expired`. |
| `API_URL` | `http://localhost:3000` | Public URL of this server. Download links are `API_URL/v1/downloads/{id}`. |
| `APP_SECRET` | required | Randomly generated signing secret of at least 32 bytes, for example `openssl rand -hex 32`. Checked at startup. JWTs last 180 days; changing the secret logs every user out. |
| `PORT` | `3000` | HTTP port the server listens on (`0.0.0.0`). |
| `NODE_ENV` | unset | `production` in deployments. `npm start` sets it. |
| `ENABLE_WORKER` | unset (worker off) | `true` processes jobs and registers cron schedules inside this process. Without it the process still queues jobs. `npm run dev` sets it. See [Worker and scaling](../deployment/worker-and-scaling.md). |
| `ENABLE_PASSWORD_LESS_AUTH` | `false` | `true` selects passwordless sign-up/login; it does not erase existing hashes or disable password-reset endpoints. |
| `STORAGE_QUOTA` | unset (no limit) | Storage plan for the two buckets together, in decimal units: `1500GB`, `1.5TB` or a number of bytes. Cloud files that would exceed it are not downloaded, and every admin gets an email at 80, 90, 95 and 100 %. A value that does not parse stops the server at startup. See [Dashboard](../administration/dashboard.md). |
| `ASSET_SYNC_MAX_DELETION_PERCENT` | `20` | Share of a source's folders and files that may be absent from one listing before the sync refuses to mark them for deletion (whole number, 0 to 100; the check only applies above 20 items). `100` disables it. A value that does not parse stops the server at startup. See [Sources](../integrations/sources.md#how-the-runs-work). |
| `STORAGE_DISK_PATH` | `/` | Path whose disk is measured with `statfs` for the hosting contact. Inside a container `/` reports the host disk that holds Docker's data, which is where the MinIO volume lives on a single-disk server. Set it to the volume's mount point when MinIO sits on another disk. |
| `SERVER_ALERT_EMAILS` | unset | Comma-separated addresses of whoever runs the server and must be told about a critical server problem. They receive the `disk-alert` emails, an admin logged in with one of these addresses sees the server disk on the dashboard, and every admin sees them as the contact to raise the plan when storage passes 80 %. Unset means no disk alert and no disk figure for anyone. |
| `ANALYTICS_RETENTION_DAYS` | `365` | Days of activity events kept for [Insights](../administration/analytics.md). The `activity/prune-events` job deletes older events every night. `0` keeps them forever. |

### Database

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgresql://dam:dam@localhost/dam` | Postgres connection string, used by TypeORM and by pg-boss (which creates a `pgboss` schema in the same database). |

### Object storage

| Variable | Default | Purpose |
|---|---|---|
| `MAIN_S3_URL` | none, required | `http(s)://ACCESS_KEY:SECRET_KEY@host:port/bucket`. Bucket for collection and page thumbnails, page images/videos and the login background. |
| `ASSETS_S3_URL` | none, required | Same syntax. Bucket for asset originals (`asset-file/{id}`), asset thumbnails and download archives (`downloads/{id}`). |

The scheme sets `useSSL`; the port defaults to 443 for `https` and 80 for `http`. Details in [Object storage](../integrations/object-storage.md).

### Email

| Variable | Default | Purpose |
|---|---|---|
| `SMTP_HOST` | `localhost` | SMTP server. |
| `SMTP_PORT` | `1025` | SMTP port. The defaults match MailHog from `docker-compose.yml`. |
| `SMTP_USER` | unset | SMTP login. Authentication is only enabled when **both** `SMTP_USER` and `SMTP_PASS` are set. |
| `SMTP_PASS` | unset | SMTP password. |
| `MAILCONFIG` | unset | Base64-encoded JSON of the mail templates. When unset, the server reads `server/mailconfig.json` and exits with an error if the file is unreadable. See [Email templates](../configuration/email-templates.md). |

### Cloud storage sync

| Variable | Default | Purpose |
|---|---|---|
| `ASSET_SOURCES` | unset | JSON object, raw or base64, declaring several cloud folders (`accounts` and `sources`) across Dropbox, OneDrive and Google Drive. When set, `ASSET_UPDATER` and the provider variables below are ignored. Overlapping roots on one account stop the server. See [Sources](../integrations/sources.md). |
| `ASSET_UPDATER` | required unless `ASSET_SOURCES` is set | `dropbox`, `onedrive` or `googledrive`: the single source, keyed by that name. Any other value stops the server at startup with `Provide ASSET_SOURCES or a valid ASSET_UPDATER`. |
| `DROPBOX_APP_KEY` | unset | Dropbox app key (Dropbox only). |
| `DROPBOX_APP_SECRET` | unset | Dropbox app secret. |
| `DROPBOX_REFRESH_TOKEN` | unset | Long-lived refresh token obtained once through the OAuth flow. See [Dropbox](../integrations/dropbox.md). |
| `DROPBOX_USE_TEAM_ROOT` | `false` | `true` lists the Dropbox Business team space instead of the member's home folder. |
| `DROPBOX_ROOT_PATH` | empty | Folder to sync, such as `/Marketing/Assets`; it becomes the single top-level asset folder. Empty syncs the whole Dropbox under a folder named `Dropbox`. See [Dropbox](../integrations/dropbox.md). |
| `ONEDRIVE_TENANT_ID` | unset | Azure AD tenant (OneDrive only). |
| `ONEDRIVE_CLIENT_ID` | unset | Azure app registration client id. |
| `ONEDRIVE_CLIENT_SECRET` | unset | Azure app client secret. |
| `ONEDRIVE_USER` | unset | User principal name whose drive is synced, for example `assets@company.com`. |
| `ONEDRIVE_DRIVE` | unset | `root` for the whole drive, or a closed path such as `root:/Marketing/Assets:` to sync one subtree (the form production runs). See [OneDrive](../integrations/onedrive.md). |
| `GOOGLE_DRIVE_SERVICE_ACCOUNT` | unset | The JSON key of the service account, base64-encoded or raw (Google Drive only). See [Google Drive](../integrations/google-drive.md). |
| `GOOGLE_DRIVE_FOLDER_ID` | unset | Id of the folder to sync; it becomes the single top-level asset folder. |
| `GOOGLE_DRIVE_IMPERSONATE` | unset | Optional Workspace user the service account acts as, with domain-wide delegation. |

### Record linking

| Variable | Default | Purpose |
|---|---|---|
| `PRODUCT_MATCHING_REGEX` | unset (job logs an error and skips) | Deprecated. Copied once, at the upgrade that added the matching screen, into a File name step of every record-related asset type (group 1 key, group 2 view); edit the steps in the admin afterwards. Until the old job is switched off it still applies to files no step owns. Example: `^(.{6}-\d{3})(?:\.(\d{2}))?`. |
| `PIM_PRODUCT_VIEW` | unset | Deprecated. Copied once, at the same upgrade, into the thumbnail view of Settings (`00` when unset). |
| `ENABLE_LEGACY_PRODUCT_MATCHING` | `true` | `false` stops the `asset/assign-products-to-asset-files` job. Set it once every record-related asset type has matching steps. |

See [Records](../administration/records.md).

## Client

Client variables are read by Vite **at build time** and baked into the bundle. Changing one means restarting `npm run dev` or rebuilding.

| Variable | Default | Purpose |
|---|---|---|
| `VITE_API_ENDPOINT` | `http://localhost:3000/trpc` | Full URL of the server's tRPC endpoint, that is `API_URL` plus `/trpc`. |
| `VITE_BRAND_COLOR` | `#e5e5e5` | Accent colour. A Tailwind name (`red-500`), a hex colour without `#` (`e11d48`), or any CSS colour. In dotenv, quote values starting with `#`: `VITE_BRAND_COLOR="#e11d48"`. |
| `VITE_BRAND_COLOR_HOVER` | `#f5f5f5` | Hover shade of the accent. |
| `VITE_BRAND_COLOR_STRONG` | `#262626` | Strong shade of the accent. |

The brand colours are resolved in `client/tailwind.config.js`, which loads `client/.env` itself. See [Client configuration](../configuration/client-env.md).
