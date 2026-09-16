---
title: Users and approval
description: How a visitor becomes a user, how approval and roles work, and what managers can and cannot do.
sidebar:
  order: 3
lastUpdated: 2026-09-16
---

Users sign up themselves, verify their email address, and then wait for an administrator or a manager of their region to approve them, unless their email domain is on the authorized list. This page follows that path and the rules around roles, magic links, password resets and account removal.

## A sign-up creates an unapproved member

The sign-up form (`/sign-up`) asks for a name, a company, a region picked from the list of existing regions, an email address and a password of 6 to 100 characters. When `ENABLE_PASSWORD_LESS_AUTH=true` the password is ignored and not stored.

`createUser` in `server/src/services/user.ts` then:

| Step | Detail |
| --- | --- |
| Role | Always `member` |
| Group | The user joins the region's default group (`regions.default_group_id`) |
| Verification code | 12 random bytes, hex encoded, stored in `email_verification_code` |
| Approval | `approved` is true only if the part after `@` matches a row in `authorized_domains` |
| Email | A job is pushed to `mailer/email-verification` |

The API returns a JWT immediately, so the person is logged in, but `client/src/app.vue` shows a waiting screen instead of the app until both `emailVerified` and `approved` are true. A second sign-up with the same email fails with `Email address already taken.`

## Verifying the email address triggers the approval request

The verification email links to `APP_URL` with `?verificationCode=<code>`. `app.vue` watches the route, calls `user.verifyEmail` with the code and refreshes the user. On success the code is cleared and `emailVerified` becomes true.

If the user is still unapproved at that moment, a job is pushed to `email/request-approval`. `sendRequestApprovalEmail` in `server/src/services/mailer.ts` sends one message to every user whose role is `manager` or `admin` **and** whose `region_id` equals the requester's. If that list is empty, no email is sent.

A signed-in user can resend their own verification email. `user.resendVerificationEmail` queues the email and returns no login token.

## Approve a pending user

On `/admin/users`, a user who has verified their email but is not approved shows an `Approve User` button in the Approval Status column. Approval:

1. Sets `approved` to true.
2. Pushes a job to `email/user-approved`.
3. The email contains a link to `/login?token=<jwt>`; opening it logs the user in directly.

Approving an already approved user fails with `User already approved.` The templates for these emails are described in [Email templates](../configuration/email-templates.md).

## Managers only see their own region

Every procedure in `server/src/trpc/router/user.ts` that lists or changes other users is open to `admin` and `manager`, but a manager's queries are filtered by `regionId = <manager's region>`:

| Procedure | Admin | Manager |
| --- | --- | --- |
| `list` | All users | Users of own region |
| `findById` | Any user | Users of own region |
| `approve`, `remove` | Any user | Members and guests of own region |
| `update` role | Any role | `member` or `guest` only; `admin` or `manager` fails with `Managers cannot set admin or manager roles.` |
| `update` region and groups | Yes | Members and guests of own region |
| `update` `maintenanceContact` | Admin profiles only | Ignored |
| `update` own profile | Name, company, email, region, role, groups | Name, company, email only |
| Edit or remove an admin or another manager | Yes | Refused by the server |

Changing a user's email through `update` resets `emailVerified` and sends a new verification email. In the Edit User dialog the Role select shows `Guest` and `Member` to everyone, and `Manager` and `Admin` only to admins.

## Designated admins receive the storage and maintenance emails

The `storage-alert` email sent when the plan passes 80, 90, 95 or 100 % goes only to admins whose profile has "Receives storage and maintenance emails" ticked (`maintenanceContact` on `users`). Only an admin sees the box, and only on a profile whose role is `admin`; the flag is cleared when the account is demoted, and a manager cannot set it. When no admin is designated, the worker logs `storage.alert-no-recipient`, sends nothing, and the [dashboard](./dashboard.md) shows a warning. The server disk alerts do not use this flag: they go to `SERVER_ALERT_EMAILS`, see [Server configuration](../configuration/server-env.md).

## What each role can do

| Role | Given by | Access |
| --- | --- | --- |
| `admin` | Another admin | Every admin screen and every collection that is public, plus own private ones |
| `manager` | An admin | The Users screen for their region; otherwise a member |
| `member` | Sign-up default | Browse public collections allowed by groups and licenses, create private collections, download |
| `guest` | Created by a collection invitation | Only collections they own, are invited to, or that are limited to one of their groups |

The predicates `userApproved`, `userAdmin`, `userMember` and `userManagerOrAdmin` in `server/src/trpc/index.ts` implement these checks; nearly every non-admin procedure requires `userApproved`. See [Roles and access](../introduction/roles-and-access.md) for the full matrix.

## Magic links replace passwords when enabled

With `ENABLE_PASSWORD_LESS_AUTH=true`:

- No password is stored at sign-up and the password field is hidden on `/login`.
- `user.login` looks the user up by email, pushes a job to `mailer/log-in` and returns `null`; the client shows a check-your-inbox message.
- The email links to `/login?token=<jwt>`; the login view stores the token and redirects home.
- An unknown email fails with `User not found.`

In password mode the same email flow is used when the login request carries `magicLink: true`, which the client sets when it was opened from an invitation link (see [Collections and sharing](./collections-and-sharing.md)).

## Password-reset implementation

A reset link expires after one hour and works once. Requesting another link replaces the previous one. The email links to `/password-update?email=<email>&token=<token>`.

The server generates 32 random bytes and stores the token’s SHA-256 hash in `reset_password_token`, with its deadline in `reset_password_expires_at`. The email job carries the original token and sends it only while it is still current. A successful reset stores the new password (6 to 100 characters), clears the reset fields and returns a fresh session. It also invalidates the account’s earlier sessions and login links. Concurrent submissions cannot reuse the same reset link.

The request returns the same empty response for an unknown email address.

## Removing an account

`user.remove` (admin or manager, within the rules above) and `user.removeAccount` (a user deleting their own account) both call `removeUser`, which in one transaction:

1. Deletes every `collection_invitations` row addressed to the user's email.
2. Sets `owner_id` to null on public collections the user owned, so they survive without an owner.
3. Deletes the user's downloads, including the archive objects in the assets bucket.
4. Deletes the user row.

## Authorized domains

`/admin/authorized-domains` (admin only) lists rows of `authorized_domains` with a `Domain` and a `Description`. The dialog `Add new authorized domain` takes a domain such as `company.com` and an optional description. A sign-up whose email ends with a listed domain is approved at creation; it still has to verify its email address. Removing a domain does not change users already approved.

## Password storage and sessions

Passwords use scrypt with a separate random salt for each password. Existing password hashes are upgraded when the user next logs in successfully. See `server/src/services/credentials.ts`.

Sessions are signed with the required `APP_SECRET` and last 180 days. The server also checks the account’s `auth_version`; a password reset increments it and ends earlier sessions. See [Accounts and links](./accounts-and-links.md).

## Account removal

`removeUser` does not remove or reassign private collections. Their owner foreign key can block the final user deletion. Resolve ownership or remove those collections through the application before attempting account removal. Earlier archive-object deletions are external effects and cannot be rolled back with the SQL transaction.
