---
title: Troubleshooting
description: The failures a new instance meets first, what they mean, and the fix.
sidebar:
  order: 6
lastUpdated: 2026-09-29
---

Symptoms are grouped by where you notice them. Server messages are quoted as they appear in the logs (Winston, plain text on stdout).

## The server does not start

| Message | Cause | Fix |
|---|---|---|
| `Provide a valid asset updater` | `ASSET_UPDATER` is not `dropbox` or `onedrive`. | Set it. There is no "no sync" mode; a driver is mandatory. |
| `MAILCONFIG is ignored` warning at startup | The variable from before emails were edited in the admin is still set. | Enter any customised wording under **Admin → Emails**, then remove `MAILCONFIG`. |
| An email shows no logo | No logo is uploaded, or `API_URL/v1/branding/email-logo.png` is not reachable from the internet. | Upload a logo in **Admin → Settings**, and check that `API_URL` is the public address of the API. |
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
| The approval request reaches nobody | `email/request-approval` mails every admin and the managers of the requester's region, counting only accounts that are approved, verified and not suspended. With none, the job sends nothing. | Make sure at least one active admin exists, or give the region a manager. |
| Sign-in succeeds but the next page shows the login screen again | The browser did not keep or send the `damvia_session` cookie: the client and the API are on unrelated domains with `SESSION_COOKIE_SAMESITE=lax`, `SESSION_COOKIE_SAMESITE=none` without HTTPS, or the proxy strips `Set-Cookie`. | Serve the client and the API from one domain, or set `SESSION_COOKIE_SAMESITE=none` with HTTPS on both. See [Reverse proxy](../deployment/reverse-proxy.md#the-session-cookie-must-reach-the-api). |
| Every call fails with a CORS error, or mutations get `403 Origin not allowed` | The client's origin is not the origin of `APP_URL` (another hostname, `http` instead of `https`, a missing port). | Set `APP_URL` to the exact address users open, restart the server. |
| Users are signed out after a few hours | `SESSION_IDLE_HOURS` (12 by default) passed without a request, or `SESSION_MAX_HOURS` since sign-in. | Expected. Raise the values if the instance's policy allows. |
| `Too many attempts` for everyone at once | The API sees every visitor with the proxy's address, so they share one rate limit. | Make the proxy set `X-Forwarded-For` and set `TRUST_PROXY` to the number of proxies. See [Reverse proxy](../deployment/reverse-proxy.md#forward-the-client-address). |
| `Too many attempts` for one account | 5 wrong passwords in a row locked the account for 1 to 60 minutes. | Wait, reset the password, or have an admin or manager call `user.resume`. |
| `This account is suspended` | An admin or manager suspended the account. | `user.resume` lifts it. |
| A password is refused as found in a data breach | The Have I Been Pwned check matched it. | Choose another password. On a server without internet access the check is skipped silently; `PASSWORD_BREACH_CHECK=false` turns it off. |
| An existing user's password stopped working after the upgrade | The account still had a pre-scrypt SHA-512 hash, which the security migration cleared. | The user resets their password once, or signs in with an email link. |
| A user with two-step verification cannot finish signing in after `APP_SECRET` changed | The stored authenticator secret is encrypted with a key derived from `APP_SECRET`. | Restore the old secret, or have an admin call `user.resetMfa` for each enrolled user; they enrol again. |
| A user lost their authenticator and recovery codes | Codes can only come from the enrolled authenticator or the ten recovery codes. | An admin calls `user.resetMfa`; the user signs in and enrols again. |
| A guest's invitation link says the link is invalid or expired | The invitation's `expiresAt` has passed, the invitation was deleted, or a newer invitation email was sent (only the latest link works). An old `?dam_token=` link also stops working 180 days after it was issued or after an `APP_SECRET` change. | Send the invitation email again. |
| A login or approval link says it is invalid or expired | The link was already used, or it is older than 15 minutes (login) or 7 days (approval). | Request a new login email. |

## Downloads

| Symptom | Cause | Fix |
|---|---|---|
| "Email" downloads stay in `preparing` | Worker off, or `download/create-archive` failing (check the job log). | Enable the worker; check disk space in the server's temp directory, the archive is built there before upload. |
| Download link opens `/link-expired` | The download is older than 7 days, or the id is unknown. | Create a new download. |
| The browser cannot reach the presigned URL | The S3 endpoint in `ASSETS_S3_URL` is only resolvable from the server. | Expose the S3 endpoint publicly (HTTPS) and use that hostname in the URL. See [Object storage](../integrations/object-storage.md). |
| `You cannot download more than 10GB.` | The selection's total original size is at or above 10 GB. | Split the download. |

## Newsletters

| Symptom | Cause | Fix |
|---|---|---|
| A newsletter stays **Scheduled** after its time | No process runs with `ENABLE_WORKER=true`, so `newsletter/dispatch` never runs. | Start the worker. It sends within a minute. |
| A newsletter stays **Sending** | The daily limit is reached (the **Delivery** page says when it resumes), or the worker stopped. | Wait: it resumes by itself when the limit allows, or 15 minutes after the worker is back. Raise `NEWSLETTER_DAILY_LIMIT` only if your domain and provider can take more. |
| Many recipients **Failed** at once | The mail server refused every message: wrong `SMTP_*`, a sending limit at the provider, or an unverified sender. | Read the error next to a recipient, fix the cause, then **Retry failed**. |
| Newsletters land in spam | Missing SPF, DKIM or DMARC, or a sudden volume from a young domain. | Fix what **Admin → Emails → Sender domain** lists, lower `NEWSLETTER_DAILY_LIMIT`, and connect bounce and spam reports. See [SMTP](../integrations/smtp.md#newsletters). |
| **Bounce and spam reports** shows **Not connected** | `EMAIL_EVENTS_SECRET` is not set on the API. | Set it (32 characters or more) and add the webhook at the provider. See [SMTP](../integrations/smtp.md#bounce-and-spam-reports). |
| An unsubscribe link says it does not work | It is older than 90 days, or the person changed their choice in their profile since. | Sign in and use **Email communication** in the profile. |

## Client

| Symptom | Cause | Fix |
|---|---|---|
| Every request fails with a network error | `VITE_API_ENDPOINT` points to the wrong host, or was changed without rebuilding. | Fix `client/.env` and rebuild; the value is baked in at build time. |
| Deep links (for example `/collections/abc`) return 404 from the web server | The static host lacks the SPA history fallback. | See [Client build](../deployment/client-build.md). |
| The brand colour did not change | Tailwind reads `client/.env` at build time. | Restart `npm run dev` or rebuild. |
