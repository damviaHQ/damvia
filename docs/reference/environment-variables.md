---
title: Environment variables
description: Every variable the server and the client read, with its default and where it is used.
sidebar:
  order: 2
lastUpdated: 2026-09-30
---

This table is the source of truth. `server/.env.template` and `client/.env.template` are copies to start from; `scripts/check-docs.sh` fails when a variable used in the code is missing here. For the reasoning behind each group of settings, read [Server configuration](../configuration/server-env.md).

The server loads `server/.env` with `dotenv` at startup (`server/src/env.ts`). `APP_SECRET` is validated at startup. Other variables may use a default or fail when first used; empty and absent values can behave differently.

Any variable can also be read from a file, the way Docker and Kubernetes mount secrets: `APP_SECRET_FILE=/run/secrets/app_secret` sets `APP_SECRET` to the file's contents, without one trailing newline. A value set directly in `APP_SECRET` wins over the file. The file must be readable by the user the server runs as.

## Server

### Application

| Variable | Default | Purpose |
|---|---|---|
| `APP_NAME` | `Damvia - Open Source Digital Asset Management` | The brand name when none is set in **Settings → Brand name**: the document title, and in emails the sender name, header and footer (`Damvia` there when unset). Also the issuer of two-step verification entries. See [Branding](../configuration/branding.md). |
| `ADMIN_CLIENT_LOGO` | `false` | Host-only: `true` uses the uploaded client logo in the admin sidebar when available; otherwise Damvia. Cannot be changed through the DAM admin. `ADMIN-CLIENT-LOGO` is an accepted alias and takes precedence when both are set. Restart the server after changing it. |
| `APP_URL` | `http://localhost:5173` | Public URL of the client. Every link in an email is built from it, and expired download links redirect to `APP_URL/link-expired`. |
| `API_URL` | `http://localhost:3000` | Public URL of this server. Download links are `API_URL/v1/downloads/{id}`. |
| `APP_SECRET` | required | Randomly generated signing secret of at least 32 bytes, for example `openssl rand -hex 32`. Checked at startup. Encrypts two-step verification secrets and signs the short-lived sign-in challenge. Changing it keeps sessions but makes every enrolled authenticator unreadable, so users must be reset with `user.resetMfa` and enrol again. |
| `PORT` | `3000` | HTTP port the server listens on (`0.0.0.0`). |
| `NODE_ENV` | unset | `production` in deployments. `npm start` sets it. |
| `ENABLE_WORKER` | unset (worker off) | `true` processes jobs and registers cron schedules inside this process. Without it the process still queues jobs. `npm run dev` sets it. See [Worker and scaling](../deployment/worker-and-scaling.md). |
| `ENABLE_PASSWORD_LESS_AUTH` | `false` | `true` selects passwordless sign-up/login; it does not erase existing hashes or disable password-reset endpoints. |
| `STORAGE_QUOTA` | unset (no limit) | Storage plan for the two buckets together, in decimal units: `1500GB`, `1.5TB` or a number of bytes. Cloud files that would exceed it are not downloaded, and every admin gets an email at 80, 90, 95 and 100 %. A value that does not parse stops the server at startup. See [Dashboard](../administration/dashboard.md). |
| `ASSET_SYNC_MAX_DELETION_PERCENT` | `20` | Share of a source's folders and files that may be absent from one listing before the sync refuses to mark them for deletion (whole number, 0 to 100; the check only applies above 20 items). `100` disables it. A value that does not parse stops the server at startup. See [Sources](../integrations/sources.md#how-the-runs-work). |
| `STORAGE_DISK_PATH` | `/` | Path whose disk is measured with `statfs` for the hosting contact. Inside a container `/` reports the host disk that holds Docker's data, which is where the MinIO volume lives on a single-disk server. Set it to the volume's mount point when MinIO sits on another disk. |
| `SERVER_ALERT_EMAILS` | unset | Comma-separated addresses of whoever runs the server and must be told about a critical server problem. They receive the `disk-alert` emails, an admin logged in with one of these addresses sees the server disk on the dashboard, and every admin sees them as the contact to raise the plan when storage passes 80 %. Unset means no disk alert and no disk figure for anyone. |
| `REQUEST_LOG` | `true` | `false` stops the one-line log written for every HTTP response (method, path without its query string, status, duration, client address, request id). |
| `ANALYTICS_RETENTION_DAYS` | `365` | Days of activity events kept for [Insights](../administration/analytics.md). The `activity/prune-events` job deletes older events every night. `0` keeps them forever. |
| `ANALYTICS_SEARCH_MODE` | `named` | How searches are kept for [Insights](../administration/analytics.md): `named` with the searcher, `anonymous` with the terms but not who typed them (search audiences are then empty), `off` not at all. Any other value stops the server at startup. |
| `PRIVACY_CONTROLLER` | unset | Name of the organisation responsible for the personal data, shown on the privacy page. Unset, the page refers to "the organisation that gave you access". |
| `PRIVACY_CONTACT` | unset | Email address or URL for privacy requests, shown on the privacy page. |
| `LICENSE_EXPIRY_NOTICE_DAYS` | `30,7,1` | Days before a licence's end date on which admins get the `license-expiring` email. Empty sends none. Anything but whole numbers stops the server at startup. |
| `AUDIT_RETENTION_DAYS` | `730` | Days of [audit log](../administration/audit-log.md) entries kept. The `audit/prune` job deletes older entries every night. `0` keeps them forever. |
| `AUDIT_LOG_IP` | `true` | `false` stops recording the client address and browser of each audit entry. |
| `AUDIT_LOG_STREAM` | `false` | `true` also writes every audit entry to the server log as an `audit` line, for a log collector or SIEM. |
| `DAMVIA_MODULES` | unset (no module) | Modules added to this server, separated by commas: installed package names such as `@acme/damvia-forecast`, or paths starting with `.` or `/`, read from the server folder. Each one adds its tables, migrations, procedures and jobs at startup. A module that cannot be loaded, or two with the same name, stop the server at startup. List the same modules in the client's `DAMVIA_MODULES`. See [Modules](../contributing/modules.md). |

### Sign-in and sessions

| Variable | Default | Purpose |
|---|---|---|
| `SESSION_IDLE_HOURS` | `12` | A session unused for this long ends. Whole hours. |
| `SESSION_MAX_HOURS` | `720` | A session ends this long after sign-in, however active (30 days). Set `12` for an absolute limit of one working day. |
| `SESSION_COOKIE_SAMESITE` | `lax` | `lax` works when the client and the API share a registrable domain (`dam.example.com` and `api.dam.example.com`, or one hostname). `none` is only for a client and an API on unrelated domains, and requires HTTPS. |
| `MFA_REQUIRED_ROLES` | unset | Comma-separated roles (`admin`, `manager`, `member`, `guest`) that must use two-step verification. Their users are asked to enrol at their next sign-in and can do nothing else until they have. Single sign-on sessions are exempt. An unknown role stops the server at startup. |
| `PASSWORD_BREACH_CHECK` | `true` | Checks new passwords against the Have I Been Pwned breach list. Only the first 5 characters of the password's SHA-1 leave the server. `false` for servers without internet access. |
| `TRUST_PROXY` | `1` | How many reverse proxies to trust for the client address (`X-Forwarded-For`), used by rate limiting and logs. A number of hops, `true` (any, only on a private network), `false`, or a comma-separated list of proxy addresses. |

### Single sign-on

Optional OpenID Connect sign-in. See [Single sign-on](../integrations/single-sign-on.md) for the provider setup and how accounts are matched.

| Variable | Default | Purpose |
|---|---|---|
| `OIDC_ISSUER` | unset | Issuer URL. With `OIDC_CLIENT_ID` and `OIDC_CLIENT_SECRET`, turns single sign-on on. Setting only some of the three stops the server at startup. |
| `OIDC_CLIENT_ID` | unset | Client id registered at the provider. |
| `OIDC_CLIENT_SECRET` | unset | Client secret. |
| `OIDC_LABEL` | `Single sign-on` | Text of the sign-in button. |
| `OIDC_SCOPES` | `openid email profile` | Scopes requested. |
| `OIDC_TRUST_EMAIL` | `false` | `true` treats the `email` claim as verified without `email_verified`. Only for a provider where users cannot choose their address. |
| `OIDC_AUTO_CREATE` | `false` | `true` creates an approved member at first sign-in when no account matches. |
| `OIDC_DEFAULT_REGION` | first region by name | Region name for accounts created at sign-in. |
| `OIDC_GROUPS_CLAIM` | unset | ID token claim listing the user's groups. |
| `OIDC_GROUP_MAP` | unset | JSON object mapping provider group values to Damvia group names. Invalid JSON stops the server at startup. |
| `OIDC_ONLY` | `false` | `true` makes single sign-on the only way in, except for guests. |

### Database

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgresql://dam:dam@localhost/dam` | Postgres connection string, used by TypeORM and by pg-boss (which creates a `pgboss` schema in the same database). |

### Object storage

| Variable | Default | Purpose |
|---|---|---|
| `MAIN_S3_URL` | none, required | `http(s)://ACCESS_KEY:SECRET_KEY@host:port/bucket`. Percent-encode a key that contains `/`, `+`, `@` or `:` (for example `/` becomes `%2F`). Bucket for collection and page thumbnails, page images/videos and the login background. |
| `ASSETS_S3_URL` | none, required | Same syntax. Bucket for asset originals (`asset-file/{id}`), asset thumbnails and download archives (`downloads/{id}`). |
| `S3_ENCRYPTION_CHECK` | `true` | At startup, asks each bucket for its default server-side encryption and logs a `security.configuration` warning when a bucket has none or the answer cannot be read. `false` skips the check, for a provider that does not implement `GetBucketEncryption`. |

The scheme sets `useSSL`; the port defaults to 443 for `https` and 80 for `http`. Details in [Object storage](../integrations/object-storage.md).

### Email

| Variable | Default | Purpose |
|---|---|---|
| `SMTP_HOST` | `localhost` | SMTP server. |
| `SMTP_PORT` | `1025` | SMTP port. The defaults match MailHog from `docker-compose.yml`. |
| `SMTP_USER` | unset | SMTP login. Authentication is only enabled when **both** `SMTP_USER` and `SMTP_PASS` are set. |
| `SMTP_PASS` | unset | SMTP password. |
| `SMTP_REQUIRE_TLS` | `false` | `true` refuses to send unless the server upgrades the connection with STARTTLS. Recommended for any relay outside the host. Port `465` always uses implicit TLS. |
| `NEWSLETTER_RATE_PER_SECOND` | `5` | How many [newsletter](../administration/newsletters.md) messages leave per second, one at a time, across every worker process. Below `1`, such as `0.5`, spaces them further apart. A value that is not a positive number stops the server at startup. Set it under your mail provider's limit. See [SMTP](../integrations/smtp.md#newsletters). |
| `NEWSLETTER_DAILY_LIMIT` | `2000` | At most this many newsletter messages leave in any 24 hours, across every worker process; the rest of a send waits and resumes by itself. `0` turns the limit off; anything but a whole number stops the server at startup. Raise it gradually as the sending domain earns a reputation. See [SMTP](../integrations/smtp.md#newsletters). |
| `NEWSLETTER_MESSAGE_STREAM` | unset | Postmark only: the message stream for newsletters, such as `broadcast`. Unset, newsletters use the transactional `outbound` stream, which Postmark does not allow for bulk email. |
| `EMAIL_EVENTS_SECRET` | unset | At least 32 characters (`openssl rand -hex 32`); shorter stops the server at startup. Turns on `POST API_URL/v1/email-events/<secret>`, where the mail provider reports bounces and spam complaints. Unset, that address answers `404`. See [SMTP](../integrations/smtp.md#bounce-and-spam-reports). |
| `MAILCONFIG` | unset | No longer read. Email templates are edited under **Admin → Emails**; startup logs a warning while the variable is set. Remove it. See [Email templates](../configuration/email-templates.md). |

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
| `PRODUCT_MATCHING_REGEX` | unset | Deprecated, read only by migrations. When upgrading an install that linked files with it, it becomes the File name rule (group 1 key, group 2 view) of every asset type without rules; matching is then edited in **Data enrichment → Link to products**. Nothing reads it at run time. Example: `^(.{6}-\d{3})(?:\.(\d{2}))?`. |
| `PIM_PRODUCT_VIEW` | unset | Deprecated, read only by the upgrade that added the matching screen: it became the thumbnail view of Settings (`00` when unset). |

See [Records](../administration/records.md).

## Client

Client variables are read by Vite **at build time** and baked into the bundle. Changing one means restarting `npm run dev` or rebuilding.

| Variable | Default | Purpose |
|---|---|---|
| `VITE_API_ENDPOINT` | `http://localhost:3000/trpc` | Full URL of the server's tRPC endpoint, that is `API_URL` plus `/trpc`. |
| `VITE_BRAND_COLOR` | `#e5e5e5` | Accent colour. A Tailwind name (`red-500`), a hex colour without `#` (`e11d48`), or any CSS colour. In dotenv, quote values starting with `#`: `VITE_BRAND_COLOR="#e11d48"`. |
| `VITE_BRAND_COLOR_HOVER` | `#f5f5f5` | Hover shade of the accent. |
| `VITE_BRAND_COLOR_STRONG` | `#262626` | Strong shade of the accent. |
| `DAMVIA_MODULES` | unset (no module) | Modules built into the client, separated by commas: the same package names as the server's `DAMVIA_MODULES`, or paths starting with `.` from the client folder. Their screens, menu entries and components are compiled with the core, so a change needs a rebuild. Read from the environment or from `client/.env`. See [Modules](../contributing/modules.md). |

The brand colours are resolved in `client/tailwind.config.js`, which loads `client/.env` itself. See [Client configuration](../configuration/client-env.md).
