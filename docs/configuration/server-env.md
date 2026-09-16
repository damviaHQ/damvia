---
title: Server configuration
description: What each group of server variables controls, and the values that trip people up.
sidebar:
  order: 2
lastUpdated: 2026-09-16
---

`server/.env` is loaded by `dotenv` when `server/src/env.ts` is imported, which is the first thing the server, the worker and the CLI do. Copy `server/.env.template` and work through it top to bottom. Defaults and one-line descriptions are in [Environment variables](../reference/environment-variables.md); this page explains the choices.

## The two URLs must be the public ones

`APP_URL` is where users open the client; `API_URL` is where the server is reachable. They are not used to bind sockets, they are used to build links: verification, login and invitation emails point at `APP_URL`, download links point at `API_URL/v1/downloads/{id}`, and an expired download redirects to `APP_URL/link-expired`. If either is left at its localhost default on a server, every email contains a dead link.

The client has its own copy of the API location, `VITE_API_ENDPOINT`, which is `API_URL` plus `/trpc` and is baked in at build time. See [Client configuration](./client-env.md).

## APP_SECRET signs every session

Auth tokens are JSON Web Tokens signed with `APP_SECRET` and valid for 180 days. The client stores the token in the `dam_token` cookie for 365 days. Consequences:

- Set a randomly generated secret of at least 32 bytes (`openssl rand -hex 32`). Startup checks this requirement; there is no default.
- Rotating the secret invalidates every token at once: every user is logged out and every unexpired invitation link stops working.

## Passwordless mode changes the login flow

`ENABLE_PASSWORD_LESS_AUTH=true` switches the whole instance to email login: sign-up stores no password, the login form asks for an email only, and each login queues a `mailer/log-in` email with a link that carries a fresh token. With `false` (the default), users have passwords. The same email path is also used, regardless of the flag, when the login page is opened through a collection share link: the link carries an `auth_params` parameter with `magicLink: true` and the invited email, and the form then sends a login email instead of asking for a password.

Passwords use scrypt with a random salt (`hashPassword` in `server/src/services/credentials.ts`). Older hashes are upgraded on successful login. Passwordless sign-up stores no password, but enabling the flag does not erase existing hashes or disable the password-reset API.

## Worker on or off

`ENABLE_WORKER=true` starts pg-boss in the same process as the API. Emails, file downloads and thumbnails, archives, deletions and the daily integrity check all run there. `npm run dev` sets it; `npm start` does not, so a production deployment must set it explicitly on the single server process. The cloud sync loop is **not** controlled by this flag and runs in every server process. With the flag off, this process does not start the pg-boss producer either, so publishing jobs can fail. Details in [Worker and scaling](../deployment/worker-and-scaling.md).

## One database for data and jobs

`DATABASE_URL` is used by TypeORM for the application tables and by pg-boss, which creates its own `pgboss` schema on first start. Migrations run automatically at boot, so the database user needs `CREATE` rights on the schema. See [Upgrading](../deployment/upgrading.md).

## Two buckets, credentials in the URL

`MAIN_S3_URL` and `ASSETS_S3_URL` pack endpoint, credentials and bucket into one URL: `https://ACCESS_KEY:SECRET_KEY@s3.example.com/bucket`. The scheme decides TLS, the port defaults to 443 or 80. The two buckets have different lifecycles: the assets bucket can be rebuilt from the cloud storage, the main bucket cannot. [Object storage](../integrations/object-storage.md) covers bucket policies and MinIO versus AWS.

## Mail

`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` configure Nodemailer. Authentication is only sent when both user and password are set, so leave both empty for an unauthenticated relay such as MailHog. The server adds the header `X-PM-Message-Stream: outbound` to every email, which Postmark uses to pick the message stream and other providers ignore.

`MAILCONFIG` holds the templates as base64 JSON. It exists so a container can carry the templates without a mounted file; leaving it empty falls back to `server/mailconfig.json`. See [Email templates](./email-templates.md).

## Exactly one cloud storage

`ASSET_UPDATER` selects `dropbox` or `onedrive`; the server refuses to start otherwise, because the sync loop is part of startup. Only the variables of the selected provider are read. Switching providers on an existing instance is not a configuration change: external ids differ, so every asset would be marked for deletion and re-imported.

## PIM matching

`PRODUCT_MATCHING_REGEX` is compiled with `new RegExp()` and run against each file name every 5 minutes. Group 1 must capture the product key exactly as it appears in the `productKey` column of imported products; optional group 2 captures the view code. `PIM_PRODUCT_VIEW` names the view whose thumbnail represents the product in the admin list. Write the regex without surrounding slashes and without flags. See [Products and PIM](../administration/products-and-pim.md).

## Variables you rarely set

| Variable | When |
|---|---|
| `PORT` | The container runtime imposes a port. Default `3000`. |
| `NODE_ENV` | `npm start` already sets `production`. |
| `APP_NAME` | Shown as the browser tab title and in the public `env` query. |

The API, worker and CLI all require a valid `APP_SECRET` at startup. See [Accounts and links](../administration/accounts-and-links.md) for token lifetime and revocation limits.

For `docker run --env-file`, use literal `KEY=value` lines without quotes or inline comments. The server template uses separate comment lines. Docker does not parse this file as dotenv or as a shell script.
