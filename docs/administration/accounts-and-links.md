---
title: Accounts and links
description: Session lifetime, email links, sign-in protection, two-step verification, suspension and the actual scope of link revocation for administrators.
sidebar:
  order: 12
lastUpdated: 2026-09-29
---

Account access, invitation access and object URLs have separate lifetimes. This page describes administrative consequences; it is not a login or sharing tutorial.

| Mechanism | Lifetime and revocation |
|---|---|
| Session | A row in `user_sessions` and an HttpOnly `damvia_session` cookie. Ends after `SESSION_IDLE_HOURS` without use (12 by default) or `SESSION_MAX_HOURS` after sign-in (720, 30 days, by default), and earlier on the events listed below. |
| Login email link (`login`) | Single use, valid 15 minutes. Stored as a hash in `login_tokens`. |
| Approval email link (`user-approved`) | Single use, valid 7 days. Stored as a hash in `login_tokens`. |
| Password-reset link | Valid one hour, stored as a hash, consumed once on success. A newer request replaces it. |
| Invitation link | Works while the invitation exists and before its expiry date. Each invitation email creates a new link and disables the earlier one. The sessions it opens end with the invitation. |
| Collection invitation | Access branch expires at the start of the selected date; deleting the invitation removes that branch. Other owner/group/public grants remain. |
| Presigned S3 URLs | Authorisation is embedded in the signed URL. Removing an invitation or a user does not revoke an already issued S3 URL, but it expires on its own: one hour for previews and originals shown in the library, 5 minutes for the redirect behind a download link. |
| Newsletter unsubscribe link | Signed with `APP_SECRET`, valid 90 days, and can only unsubscribe its one account. It stops working as soon as the person changes their newsletter choice in their profile. See [Newsletters](./newsletters.md#unsubscribing). |
| Download link | `API_URL/v1/downloads/{id}` requires no session, so it can be passed on. Each click checks that the download is ready, not past its seven-day expiry, and that its owner is still approved, not suspended and can still reach every file, then redirects to an S3 URL valid 5 minutes. |

## What ends a session

- Sign-out, or the user signing out one of their other sessions under **Account > Security**, which lists every browser signed in with its sign-in method and last activity.
- `SESSION_IDLE_HOURS` without a request, or `SESSION_MAX_HOURS` after sign-in. `last_seen_at` is written at most every 5 minutes, so the idle limit is precise to about 5 minutes.
- A password reset: every session of the account.
- An admin changing the user's email address: every session, pending reset link and email link of the account. A verification email goes to the new address.
- Suspension or deletion of the account.
- The user turning on two-step verification: every other session.
- An admin or manager revoking the user's sessions (`user.revokeSessions`), or an admin resetting their two-step verification (`user.resetMfa`).
- For a session opened from an invitation link: the invitation being deleted or expiring.

Ended sessions stop working at once. The `auth/prune-sessions` job deletes their rows every night at 04:45 UTC, with email-link tokens expired for more than a day.

Changing `APP_SECRET` does not end sessions. It makes every enrolled authenticator unreadable, and it stops the exchange of tokens issued before server-side sessions. See [Server configuration](../configuration/server-env.md#app_secret-protects-two-step-verification).

## Sign-in attempts are limited

Unknown email addresses and wrong passwords get the same answer, `Invalid email or password.`, in the same time. A login-link request always answers that an email was sent; the email goes only to an existing account that is not suspended.

After 5 consecutive wrong passwords or two-step verification codes, the account is locked for 1 minute, then 2, 4 and so on, up to 60 minutes per further failure. A locked account answers `Too many attempts` even to the right password or code. A successful sign-in or a password reset clears the count; so does `user.resume`. With two-step verification on, the right password alone does not clear it, only a right code does.

The API also counts attempts per client address and per account:

| Attempt | Limit |
|---|---|
| Password sign-in | 20 per minute per address |
| Login-link request | 5 per 15 minutes per address, 3 per 15 minutes per email |
| Sign-up | 5 per 15 minutes per address |
| Password-reset request | 5 per 15 minutes per address, 3 per 15 minutes per email |
| Password-reset submission | 10 per 15 minutes per address |
| Email-link and invitation-link exchange | 20 per minute per address |
| Two-step verification code | 5 per 5 minutes per account |
| Email verification code | 10 per 15 minutes per account |

Over the limit, the API answers `TOO_MANY_REQUESTS`. The counters live in the memory of the API process: a restart resets them, and two API processes count separately. The client address comes from `X-Forwarded-For` as allowed by `TRUST_PROXY`; see [Reverse proxy](../deployment/reverse-proxy.md#forward-the-client-address).

## Two-step verification

Any user can turn on two-step verification under **Account > Security**: scan the QR code or type the key into an authenticator app, then enter a 6-digit code. Ten single-use recovery codes are shown once; the server keeps only their hashes. A code cannot be used twice.

With two-step verification on, a sign-in by password, email link, invitation link or password reset asks for a code, or a recovery code, within 5 minutes. Single sign-on sessions do not ask: the identity provider's own policy applies.

`MFA_REQUIRED_ROLES` makes it compulsory for the listed roles, for example `admin,manager`. Their users are asked to enrol at their next sign-in and can do nothing else until they have, and they cannot turn it off.

A user who loses both the authenticator and the recovery codes asks an admin to call `user.resetMfa`. It removes the enrolment and ends every session of the account; the user signs in again and enrols again if their role requires it.

## Suspending an account

Suspension (`user.suspend`) blocks every sign-in and every email to the account, ends its sessions, cancels its pending email links and disables its download links. The account and its collections, invitations and downloads are kept. `user.resume` lifts it and clears a lockout. Nobody can suspend their own account; managers can suspend only members and guests of their region.

Deletion removes the account, its personal collections, the invitations addressed to its email and its downloads. See [Users and approval](./users-and-approval.md#remove-an-account-carefully). Archive removal touches S3 and cannot be undone by a database rollback.

## Passwords and logs

Passwords use scrypt with a random salt per password. A new password must be 12 to 128 characters, differ from the email address and not appear in the Have I Been Pwned breach list. Only the first 5 characters of the password's SHA-1 are sent to that service, with padding; if it cannot be reached the password is accepted, and `PASSWORD_BREACH_CHECK=false` turns the check off. Existing passwords are not checked again. Passwordless mode changes sign-up/login behaviour; it does not erase existing hashes or remove the reset API.

API error logs contain the procedure path, error code, request id and user id, without request bodies or raw error objects. The request log records each path without its query string and masks download ids. Keep email login links, invitation links and reset links out of logs and tickets because they carry credentials.
