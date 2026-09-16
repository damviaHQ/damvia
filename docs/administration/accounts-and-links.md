---
title: Accounts and links
description: Session lifetime, account removal and the actual scope of link revocation for administrators.
sidebar:
  order: 12
lastUpdated: 2026-09-16
---

Account access, invitation access and object URLs have separate lifetimes. This page describes administrative consequences; it is not a login or sharing tutorial.

| Mechanism | Lifetime and revocation |
|---|---|
| JWT session and login/invitation tokens | Signed with `APP_SECRET`, expire after 180 days. A password reset ends the account’s earlier sessions and login links; rotating the secret ends all sessions. |
| Client `dam_token` cookie | Stored for 365 days; this does not extend the JWT's validity. |
| Password-reset token | Expires after one hour. Stored as a hash, consumed once on success and replaced by another reset request. |
| Collection invitation | Access branch expires at the start of the selected date; deleting the invitation removes that branch. Other owner/group/public grants remain. |
| Presigned S3 URLs | Authorisation is embedded in the signed URL. Removing an invitation or rotating `APP_SECRET` does not revoke an already issued S3 URL. |
| Public archive URL | `API_URL/v1/downloads/{id}` requires no session and redirects to a signed object URL until its seven-day expiry. |

## Secret rotation

Changing `APP_SECRET` and restarting invalidates previously signed sessions and login/invitation JWT links. Invite records remain in the database, so users can regain access using a fresh login if the invitation is still live. Password-reset tokens are separate database values, not these JWTs.

Deleting a user prevents the API from loading that user for a JWT, but removal can fail while private collections still reference the owner. Resolve that ownership first; see [Users and approval](./users-and-approval.md). Archive removal touches S3 and cannot be undone by a database rollback.

## Passwords and logs

Passwords use scrypt with a random salt per password. Older stored hashes are upgraded on successful login. Passwordless mode changes sign-up/login behaviour; it does not erase existing hashes or remove the reset API.

API error logs contain the procedure path, error code, request id and user id, without request bodies or raw error objects. Keep email login links and reset links out of logs and tickets because they carry credentials.
