---
title: Server configuration
description: What each group of server variables controls, and the values that trip people up.
sidebar:
  order: 2
lastUpdated: 2026-09-30
---

`server/.env` is loaded by `dotenv` when `server/src/env.ts` is imported, which is the first thing the server, the worker and the CLI do. Copy `server/.env.template` and work through it top to bottom. Any variable can instead be read from a file by setting `NAME_FILE=/path`, which suits Docker and Kubernetes secrets; a value set directly in `NAME` wins. Defaults and one-line descriptions are in [Environment variables](../reference/environment-variables.md); this page explains the choices.

## The two URLs must be the public ones

`APP_URL` is where users open the client; `API_URL` is where the server is reachable. They are not used to bind sockets, they are used to build links: verification, login and invitation emails point at `APP_URL`, download links point at `API_URL/v1/downloads/{id}`, and an expired download redirects to `APP_URL/link-expired`. If either is left at its localhost default on a server, every email contains a dead link.

The client has its own copy of the API location, `VITE_API_ENDPOINT`, which is `API_URL` plus `/trpc` and is baked in at build time. See [Client configuration](./client-env.md).

`APP_URL` must also be the exact origin the browser shows for the client (scheme, host and port). The API accepts cross-origin requests from that origin only, and refuses any `POST` whose `Origin` header is neither the origin of `APP_URL` nor that of `API_URL` with a `403`. A client served from a second hostname that is not `APP_URL` cannot sign in.

## Sessions live in the database

A sign-in creates a row in `user_sessions` and sets an HttpOnly cookie, `damvia_session`, that holds a random token; the database keeps only its SHA-256 hash. The browser sends the cookie with every API call, and the client's JavaScript never reads it. A session ends after `SESSION_IDLE_HOURS` without use (12 by default), `SESSION_MAX_HOURS` after sign-in (720, 30 days, by default), or earlier when the user signs out or an event ends it; [Accounts and links](../administration/accounts-and-links.md) lists them.

The cookie is `SameSite=Lax` and marked `Secure` when `API_URL` starts with `https:`. `Lax` requires the client and the API to share a registrable domain: one hostname, or `dam.example.com` with `api.dam.example.com`. For a client and an API on unrelated domains, set `SESSION_COOKIE_SAMESITE=none`, which forces `Secure` and therefore needs HTTPS on both. See [Reverse proxy](../deployment/reverse-proxy.md).

For an absolute limit of one working day, set `SESSION_MAX_HOURS=12`. A new `SESSION_IDLE_HOURS` applies to existing sessions at their next request; `SESSION_MAX_HOURS` is fixed on each session when it is created, so a shorter value applies to new sign-ins only.

## APP_SECRET protects two-step verification

Set a randomly generated secret of at least 32 bytes (`openssl rand -hex 32`). Startup checks this requirement; there is no default. The secret no longer signs sessions. It encrypts the two-step verification secrets stored in `users.mfa_secret` (AES-256-GCM, with a key derived by HKDF) and signs the five-minute challenge between a password and its verification code. Consequences of changing it:

- Signed-in users stay signed in.
- Every enrolled authenticator becomes unreadable: those users cannot finish a sign-in until an admin resets their two-step verification with `user.resetMfa`, then they enrol again.
- Browsers still holding a pre-upgrade `dam_token`, and invitation emails sent before the upgrade, can no longer be exchanged for a session. See [Upgrading](../deployment/upgrading.md#sign-in-and-sessions-in-this-upgrade).

Keep the secret stable, and back it up with the configuration.

## Sign-in is rate limited behind the proxy

Sign-in, email-link, sign-up, password-reset and verification-code attempts are counted per client address and per account, in the memory of the API process. The client address comes from `X-Forwarded-For`, trusting as many proxies as `TRUST_PROXY` says (1 by default). Behind two proxies, such as a CDN and nginx, set `TRUST_PROXY=2`; with `1` every visitor seems to come from the CDN and they share one limit. `TRUST_PROXY=true` trusts any chain and suits only a private network. The limits are listed in [Accounts and links](../administration/accounts-and-links.md#sign-in-attempts-are-limited).

`MFA_REQUIRED_ROLES`, for example `admin,manager`, makes two-step verification compulsory for those roles: their users must enrol at their next sign-in and cannot turn it off. `PASSWORD_BREACH_CHECK=false` stops new passwords from being checked against Have I Been Pwned, for a server without internet access.

## Passwordless mode changes the login flow

`ENABLE_PASSWORD_LESS_AUTH=true` switches the whole instance to email login: sign-up stores no password, the login form asks for an email only, and each login queues a `mailer/log-in` email with a single-use link valid 15 minutes. The form always answers that an email was sent; the email goes only to an existing account that is not suspended. With `false` (the default), users have passwords. The same email path is also used, regardless of the flag, when the login page is opened through a collection share link: the link carries an `auth_params` parameter with `magicLink: true` and the invited email, and the form then sends a login email instead of asking for a password.

Passwords use scrypt with a random salt (`hashPassword` in `server/src/services/credentials.ts`). A new password must be 12 to 128 characters and differ from the email address. Passwordless sign-up stores no password, but enabling the flag does not erase existing hashes or disable the password-reset API.

## Worker on or off

`ENABLE_WORKER=true` starts pg-boss in the same process as the API. Emails, file downloads and thumbnails, archives, deletions and the daily integrity check all run there. `npm run dev` sets it; `npm start` does not, so a production deployment must set it explicitly on the single server process. The cloud sync loop is **not** controlled by this flag and runs in every server process. With the flag off, the process still connects pg-boss and creates the queues, so it can queue jobs; it does not process them or register the cron schedules. Details in [Worker and scaling](../deployment/worker-and-scaling.md).

## One database for data and jobs

`DATABASE_URL` is used by TypeORM for the application tables and by pg-boss, which creates its own `pgboss` schema on first start. Migrations run automatically at boot, so the database user needs `CREATE` rights on the schema. See [Upgrading](../deployment/upgrading.md).

## Two buckets, credentials in the URL

`MAIN_S3_URL` and `ASSETS_S3_URL` pack endpoint, credentials and bucket into one URL: `https://ACCESS_KEY:SECRET_KEY@s3.example.com/bucket`. The scheme decides TLS, the port defaults to 443 or 80. The keys are percent-decoded, so write a `/`, `+`, `@` or `:` in a key as `%2F`, `%2B`, `%40` or `%3A`.

At startup the server asks each bucket for its default server-side encryption and logs a `security.configuration` warning when there is none. Turn it on for both buckets: with MinIO, configure a KMS and run `mc encrypt set sse-s3 <alias>/<bucket>`; on AWS, new buckets already encrypt with SSE-S3. `S3_ENCRYPTION_CHECK=false` skips the check for a provider that does not answer it. The same startup check warns when `APP_URL`, `API_URL` or a bucket URL uses plain HTTP on a non-local host in production. The two buckets have different lifecycles: the assets bucket can be rebuilt from the cloud storage, the main bucket cannot. [Object storage](../integrations/object-storage.md) covers bucket policies and MinIO versus AWS.

## STORAGE_QUOTA is the plan, not the disk

`STORAGE_QUOTA` is the storage the customer pays for, written in decimal units such as `1500GB` or `1.5TB` (1.5 TB is 1 500 000 000 000 bytes, the way disks and hosting plans are sold). Every 30 minutes the worker adds up every object of the two buckets and compares the total with it. A file listed in the cloud storage is only downloaded while the plan has room; the first file that does not fit pauses the downloads of every source, and they resume on their own once a measurement finds space under the plan again. Archives, thumbnails and page media are never blocked, so keep the plan below the disk that holds MinIO: on a 2 TB disk, `STORAGE_QUOTA=1.5TB` leaves 500 GB for exports, previews, Postgres and temporary files.

Setting a plan on an instance that already stores files does not delete anything: when the buckets already hold more than the plan, usage shows above 100 % and no new file is downloaded until space is freed or the plan is raised. Set the plan to at least the current usage shown on the dashboard, then click "Measure now" right after the restart, so the check starts from the real usage instead of zero (see [Known limitations](../reference/known-limitations.md)).

Leave it empty for no limit: the dashboard still shows the used space, but no alert is sent and nothing is blocked. The value is parsed at startup; `abc` or `0` stops the server with `STORAGE_QUOTA must be a size such as 1500GB or 1.5TB.` The alerts and the recovery steps are described in [Dashboard](../administration/dashboard.md).

## ASSET_SYNC_MAX_DELETION_PERCENT guards against a truncated listing

Every sync pass marks for deletion what the cloud listing no longer contains. A listing cut short by the provider, a token that lost a scope or a root path pointed elsewhere all look like a mass deletion, so the sweep is skipped, and the run logged as failed, when more than this share of the source's folders and files is absent (20 % by default; the check ignores sources with 20 missing items or fewer, so a small library is never stuck). The synchronized collections, custom collections and menu items built on those rows survive until the operator has looked. For an intended clean-up of a large part of the library, raise the value (or set `100`) for one run, then put it back.

## SERVER_ALERT_EMAILS separates the host from the customer

When one server hosts several Damvia instances, each customer's admins must see their own plan and nothing about the machine. `SERVER_ALERT_EMAILS` names the people who run the server and must hear about a critical server problem. They receive the `disk-alert` emails when the disk itself passes 80, 90, 95 or 100 %, whatever fills it, and they see a "Server disk" block on the dashboard when they log in to an instance with one of these addresses. Nothing about the day-to-day administration of the DAM goes to these addresses. They are, however, shown to the instance's admins as the contact to raise the plan, in the storage warning of the dashboard, so list an address you are happy for customers to write to. Every other admin only sees the plan. The disk is read with `statfs` on `STORAGE_DISK_PATH` (default `/`), so nothing else has to be installed or mounted on a single-disk server.

Leave `SERVER_ALERT_EMAILS` empty and the server never sends nor shows a disk figure.

## ANALYTICS_RETENTION_DAYS bounds the activity history

[Insights](../administration/analytics.md) reads the `activity_events` table, which names the user behind each view, download and search. `ANALYTICS_RETENTION_DAYS` is how long those rows live: 365 days by default, deleted every night by `activity/prune-events`. Lower it to match the privacy policy of the instance, or set `0` to keep everything. The table grows by one row per file downloaded, so an instance that exports large archives every day should keep a bound.

## Mail

`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` configure Nodemailer. Authentication is only sent when both user and password are set, so leave both empty for an unauthenticated relay such as MailHog. Port `465` uses implicit TLS. On any other port, set `SMTP_REQUIRE_TLS=true` for a relay outside the host: sending then fails unless the server upgrades the connection with STARTTLS, instead of sending sign-in links in clear text. Startup logs a `security.configuration` warning when a non-local relay runs without it. The server adds the header `X-PM-Message-Stream: outbound` to every email, which Postmark uses to pick the message stream and other providers ignore.

The sender, the wording of each email and the branding are edited in the admin, not in variables. See [Emails](../administration/emails.md) and [SMTP](../integrations/smtp.md) for choosing a provider. `MAILCONFIG`, which used to hold the templates, is no longer read; startup logs a warning while it is still set.

## Configure one source or several

For a simple installation with one source, `ASSET_UPDATER` selects `dropbox`, `onedrive` or `googledrive`; only that provider's variables are read. The server requires a valid source configuration because synchronisation is part of startup.

For several folders, accounts or providers, set `ASSET_SOURCES` to the raw or base64-encoded JSON described in [Sources](../integrations/sources.md). When it is set, `ASSET_UPDATER` and the individual provider variables are ignored.

A source key becomes part of every mirrored row. Changing a provider, root or key on an existing instance can remove, duplicate or re-import assets if it is treated as an ordinary environment edit. Follow the rename and removal procedures in the Sources guide.

## Record matching

Record matching is set in the admin, on **Data Enrichment → Link to products**: each asset type has its own rules, and the enrichment pass after each sync applies them. `PRODUCT_MATCHING_REGEX` and `PIM_PRODUCT_VIEW` are only read when upgrading an install that used them: the regex becomes the File name rule of every asset type without rules, and the view became the thumbnail view in Settings. Nothing reads them afterwards. See [Records](../administration/records.md).

## Variables you rarely set

| Variable | When |
|---|---|
| `PORT` | The container runtime imposes a port. Default `3000`. |
| `NODE_ENV` | `npm start` already sets `production`. |
| `APP_NAME` | Shown as the browser tab title and in the public `env` query. |
| `REQUEST_LOG` | `false` stops the `http.response` line written for every request. |

The API, worker and CLI all require a valid `APP_SECRET` at startup. See [Accounts and links](../administration/accounts-and-links.md) for session and link lifetimes.

For `docker run --env-file`, use literal `KEY=value` lines without quotes or inline comments. The server template uses separate comment lines. Docker does not parse this file as dotenv or as a shell script.

## Host-controlled admin logo

`ADMIN_CLIENT_LOGO=false` keeps the Damvia logo in the admin sidebar. Set it to `true` to allow the uploaded client logo there; if no client logo exists, Damvia is still used. The spelling `ADMIN-CLIENT-LOGO` is also accepted and takes precedence if both are set. Restart the server after changing this environment setting. DAM administrators can upload a client logo but cannot change this host policy. See [Branding](./branding.md).
