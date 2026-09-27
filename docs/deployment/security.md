---
title: Security architecture
description: How Damvia protects accounts, files and personal data, where the trust boundaries are, and what the operator must provide.
sidebar:
  order: 11
lastUpdated: 2026-09-27
---

This page describes the security design of Damvia for the people who deploy it, and for reviewers who evaluate it. [Hardening checklist](./hardening.md) turns it into steps; [ASVS self-assessment](../reference/asvs-self-assessment.md) maps it to the OWASP Application Security Verification Standard level 2. Report vulnerabilities as described in [`SECURITY.md`](https://github.com/damviaHQ/damvia/blob/main/SECURITY.md).

## Components and trust boundaries

| Component | Trust | Talks to |
|---|---|---|
| Browser client (static Vite build) | Untrusted: runs on the user's device | The API over HTTPS; the buckets through presigned URLs |
| API and worker (`server/`, one Node process or several) | Trusted | Postgres, both buckets, SMTP, the cloud source, the identity provider, Have I Been Pwned |
| PostgreSQL | Trusted, private network only | The API and worker |
| Main bucket (thumbnails, page media) and assets bucket (originals, previews, archives) | Trusted, private; browsers reach single objects through signed URLs | The API, and browsers holding a signed URL |
| Cloud source (Dropbox, OneDrive, Google Drive) | External, read only | Read by the sync loop with the credentials in `ASSET_SOURCES` |
| SMTP relay | External | Receives sign-in links, invitations and alerts |
| OpenID Connect provider (optional) | External, trusted for identity | Browser redirects; token exchange from the API |
| Have I Been Pwned range API (optional) | External | Receives the first 5 characters of a new password's SHA-1 |

The reverse proxy terminates TLS for the client, the API and the S3 endpoint. The API speaks plain HTTP behind it and trusts `X-Forwarded-For` for `TRUST_PROXY` hops.

## Accounts and sign-in

- Methods: password, single-use email link, invitation link, OpenID Connect, password reset. Each successful sign-in creates a server-side session; see [Accounts and links](../administration/accounts-and-links.md).
- Sessions are random 256-bit tokens in an HttpOnly, `SameSite=Lax` cookie (`Secure` over HTTPS). The database keeps only their SHA-256. They end after `SESSION_IDLE_HOURS` (12) of inactivity, `SESSION_MAX_HOURS` (720) after sign-in, at sign-out, on password reset, suspension, deletion, or revocation from Account > Security or by an administrator.
- Passwords: 12 to 128 characters, not the email, checked against known breaches (`PASSWORD_BREACH_CHECK`), stored with scrypt (N = 131072, r = 8, p = 1, 16-byte salt).
- Guessing is slowed by per-address rate limits and by account lockout after 5 failures (1 minute, doubling, capped at 1 hour). Unknown emails receive the same answers and timing as existing ones.
- Two-step verification: TOTP (RFC 6238) with replay protection and ten single-use recovery codes. `MFA_REQUIRED_ROLES` makes it mandatory per role. Single sign-on sessions rely on the identity provider's policy.
- Email links, invitation secrets and reset tokens are random, single-use or bounded in time, and stored hashed.

## Authorisation

Every procedure checks the caller on the server. Roles (admin, manager, member, guest), approval and email verification, regions, groups, collection restrictions, invitations and licences decide what each person can see and do; [Roles and access](../introduction/roles-and-access.md) has the exact rules. Hiding a button in the client is never the control. A refused call by a signed-in user is recorded as `access.denied` in the [audit log](../administration/audit-log.md).

Files are never public. Previews and downloads use presigned URLs valid for one hour, and download links pass through `API_URL/v1/downloads/{id}`, which checks the owner's current access before redirecting for 5 minutes.

## Cryptography

| What | How |
|---|---|
| In transit | TLS at the reverse proxy (`Strict-Transport-Security` is sent by the API). S3 and SMTP use TLS when their URLs are `https` / `SMTP_REQUIRE_TLS=true`; startup warns otherwise. |
| Passwords | scrypt, salted |
| Session, link, invitation, reset tokens and recovery codes | SHA-256 of high-entropy random values |
| TOTP secrets | AES-256-GCM, key derived from `APP_SECRET` with HKDF |
| MFA challenge, SSO state | HMAC-SHA256 signed with `APP_SECRET`, 5 and 10 minutes |
| Files at rest | The buckets' default server-side encryption, which the operator enables; startup warns when it is missing |
| Database at rest | The operator's disk or database encryption |

`APP_SECRET` is the key material for the rows above: generate it randomly, keep it in a secret store (`APP_SECRET_FILE`), and never reuse it between instances.

## Browser protections

- API responses carry `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`, `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` and `Cross-Origin-Resource-Policy: same-site`.
- CORS allows only `APP_URL`'s origin, with credentials.
- Cross-site request forgery is blocked by the `SameSite` cookie and by refusing any non-GET request whose `Origin` is not the client or the API.
- The client's static files are served by your proxy; give them a Content-Security-Policy too ([Reverse proxy](./reverse-proxy.md) has a starting policy).
- Page content from the editor is sanitised on the server before storage.

## Logging and monitoring

- The [audit log](../administration/audit-log.md) records sign-ins and failures, lockouts, MFA and session changes, account and access changes, every administrative change, refusals, licence acceptance and download links. The database refuses edits to it. `AUDIT_LOG_STREAM=true` copies each entry to the server log for a SIEM.
- The server logs one `http.response` line per request, without query strings, and `security.configuration` warnings at startup.
- Worth alerting on: bursts of `auth.sign_in_failed` or `auth.locked`, `access.denied` from one account, `admin.change` outside working hours, `mfa.reset`, `audit.exported`, any `security.configuration` warning.

## Personal data

[Privacy and personal data](../configuration/privacy.md) lists what is stored and for how long, the settings that reduce it, and how to answer access, correction and deletion requests.

## Software supply chain

Dependencies are updated through Dependabot. CI fails on a known high or critical advisory in production dependencies, and CodeQL analyses every change. GitHub Actions are pinned to commit SHAs, and each release carries CycloneDX SBOMs. The Docker image runs as an unprivileged user.

## Limits to know

- Rate limits are counted per API process in memory. Several API replicas each keep their own counts, and a restart resets them; the account lockout is stored in the database and is not affected.
- Single sign-on is OpenID Connect only (no SAML), without provisioning (no SCIM) and without single logout.
- C2PA manifests are detected, not validated.
- Four moderate advisories remain in the S3 client's XML parsing dependencies (`minio` → `stream-json`, `query-string`); they concern responses from your own storage.
- Backups are the operator's: see [Backups](./backups.md). They contain personal data and every secret hash; protect them like the database.
