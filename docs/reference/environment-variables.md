---
title: Environment variables
description: Every variable the server and the client read, with its default and where it is used.
sidebar:
  order: 2
lastUpdated: 2026-09-15
---

This table is the source of truth. `server/.env.template` and `client/.env.template` are copies to start from; `scripts/check-docs.sh` fails when a variable used in the code is missing here. For the reasoning behind each group of settings, read [Server configuration](../configuration/server-env.md).

The server loads `server/.env` with `dotenv` at startup (`server/src/env.ts`). There is no schema validation: a missing variable takes its default, or throws when first used if it has none.

## Server

### Application

| Variable | Default | Purpose |
|---|---|---|
| `APP_NAME` | `Damvia - Open Source Digital Asset Management` | Returned by the public `env` query; the client uses it as the document title. |
| `APP_URL` | `http://localhost:5173` | Public URL of the client. Every link in an email is built from it, and expired download links redirect to `APP_URL/link-expired`. |
| `API_URL` | `http://localhost:3000` | Public URL of this server. Download links are `API_URL/v1/downloads/{id}`. |
| `APP_SECRET` | `Damvia App Secret` | Secret used to sign JWT auth tokens (180-day lifetime). **Change it**: with the default, anyone can forge a token. Changing it later logs every user out. |
| `PORT` | `3000` | HTTP port the server listens on (`0.0.0.0`). |
| `NODE_ENV` | unset | `production` in deployments. `npm start` sets it. |
| `ENABLE_WORKER` | unset (worker off) | `true` starts the pg-boss worker inside this process. `npm run dev` sets it. See [Worker and scaling](../deployment/worker-and-scaling.md). |
| `ENABLE_PASSWORD_LESS_AUTH` | `false` | `true` disables passwords entirely: sign-up stores none and login always emails a magic link. |

### Database

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgresql://dam:dam@localhost/dam` | Postgres connection string, used by TypeORM and by pg-boss (which creates a `pgboss` schema in the same database). |

### Object storage

| Variable | Default | Purpose |
|---|---|---|
| `MAIN_S3_URL` | none, required | `http(s)://ACCESS_KEY:SECRET_KEY@host:port/bucket`. Bucket for collection and page thumbnails, page images and the login background. |
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
| `ASSET_UPDATER` | none, required | `dropbox` or `onedrive`. Any other value stops the server at startup with `Provide a valid asset updater`. |
| `DROPBOX_APP_KEY` | unset | Dropbox app key (Dropbox only). |
| `DROPBOX_APP_SECRET` | unset | Dropbox app secret. |
| `DROPBOX_REFRESH_TOKEN` | unset | Long-lived refresh token obtained once through the OAuth flow. See [Dropbox](../integrations/dropbox.md). |
| `DROPBOX_USE_TEAM_ROOT` | `false` | `true` lists the Dropbox Business team space instead of the member's home folder. |
| `ONEDRIVE_TENANT_ID` | unset | Azure AD tenant (OneDrive only). |
| `ONEDRIVE_CLIENT_ID` | unset | Azure app registration client id. |
| `ONEDRIVE_CLIENT_SECRET` | unset | Azure app client secret. |
| `ONEDRIVE_USER` | unset | User principal name whose drive is synced, for example `assets@company.com`. |
| `ONEDRIVE_DRIVE` | unset | Path inside that drive, Graph syntax, for example `root:/DAM`. See [OneDrive](../integrations/onedrive.md). |

### PIM linking

| Variable | Default | Purpose |
|---|---|---|
| `PRODUCT_MATCHING_REGEX` | unset (job logs an error and skips) | Regex applied to each asset file name every 5 minutes. Capture group 1 is the product key, optional group 2 the product view. Example: `^(.{6}-\d{3})(?:\.(\d{2}))?`. |
| `PIM_PRODUCT_VIEW` | unset | The product view code (group 2 above) whose thumbnail represents the product in the admin product list, for example `00`. |

See [Products and PIM](../administration/products-and-pim.md).

## Client

Client variables are read by Vite **at build time** and baked into the bundle. Changing one means restarting `npm run dev` or rebuilding.

| Variable | Default | Purpose |
|---|---|---|
| `VITE_API_ENDPOINT` | `http://localhost:3000/trpc` | Full URL of the server's tRPC endpoint, that is `API_URL` plus `/trpc`. |
| `VITE_BRAND_COLOR` | `sky-400` | Accent colour. A Tailwind colour name (`red-500`) or any CSS colour (`#e11d48`). |
| `VITE_BRAND_COLOR_HOVER` | `sky-500` | Hover shade of the accent. |
| `VITE_BRAND_COLOR_STRONG` | `sky-600` | Strong shade of the accent, used for emphasis text. |

The brand colours are resolved in `client/tailwind.config.js`, which loads `client/.env` itself. See [Client configuration](../configuration/client-env.md).
