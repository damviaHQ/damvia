---
title: First admin
description: There is no seed command; the first administrator is a normal sign-up promoted with one SQL statement.
sidebar:
  order: 3
lastUpdated: 2026-09-16
---

Every account is created through the sign-up form with the `member` role and, unless its email domain is pre-authorized, `approved = false`. Authorizing domains and approving users are admin actions, so the very first admin has to be promoted directly in the database.

## Sign up normally

Go to `APP_URL/sign-up`, pick the `Global` region (the initial migration seeds it, together with a `Default` group), and submit. Then open the verification email (MailHog at `http://localhost:8025` in development) and click the link. The client shows a screen saying the account is waiting for approval.

If `ENABLE_PASSWORD_LESS_AUTH=true`, the form has no password field and the login page emails a link instead.

## Promote the account

Connect to the database from `DATABASE_URL` and run:

```sql
UPDATE users
SET role = 'admin', approved = true, email_verified = true
WHERE email = 'you@company.com';
```

With the development stack:

```bash
psql postgresql://dam:dam@localhost/dam -c "UPDATE users SET role = 'admin', approved = true, email_verified = true WHERE email = 'you@company.com';"
```

Reload the client. The avatar menu now has the admin shortcuts and `/admin/settings` opens.

The `email_verified` flag is set here only as a safety net; clicking the verification link already set it. Setting `approved` is required: an unapproved user is blocked by the client and by every server procedure that requires an approved user.

## What to do next as the first admin

| Step | Where | Why |
|---|---|---|
| Add your company's email domain | `/admin/authorized-domains` | Colleagues who sign up with that domain are approved automatically. Without it, each sign-up emails the admins and managers of the user's region for approval. |
| Create regions and groups that match your organisation | `/admin/regions`, `/admin/groups` | A user belongs to exactly one region and gets the region's default group at sign-up. Managers act only inside their region. See [Groups and regions](../administration/groups-and-regions.md). |
| Give each region a manager or admin | `/admin/users` | Approval requests are emailed to the admins and managers of the requester's region; a region with none sends the request to nobody. |
| Check the assets tree | `/admin/assets` | Confirms the sync works. Assign asset types and licenses from here. See [Assets tree](../administration/assets-tree.md). |
| Build the menu and a first collection | `/admin/menu-items`, `/admin/collections` | Without a Home item, the client opens the first accessible collection or its welcome message. See [Menu and pages](../administration/menu-and-pages.md). |

## Adding more admins later

Edit the user under `/admin/users` and set the role to `admin`. Only admins can do this; managers can approve, edit and remove users of their own region but cannot promote to `admin` or remove an admin. See [Users and approval](../administration/users-and-approval.md).
