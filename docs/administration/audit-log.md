---
title: Audit log
description: The append-only record of administrative changes, sign-ins, refusals and access to downloads, and how to filter, export and retain it.
sidebar:
  order: 17
lastUpdated: 2026-09-28
---

Damvia records who changed what, every sign-in and failed sign-in, and every refused request in the `audit_log` table. Admins read it under **User Management > Audit log** (`/admin/audit-log`). Managers have no access.

## Entries cannot be changed

A database trigger rejects any `UPDATE` or `DELETE` on `audit_log`. There are two exceptions:

- the nightly `audit/prune` job, which deletes entries older than `AUDIT_RETENTION_DAYS` (730 days by default, `0` keeps them forever);
- removing a person's identity from entries: the actor, address and browser can be cleared, for example when a user is deleted. The action, target and values never change.

An entry is written in the same transaction as the change it describes where the code allows it, so a change and its record commit or roll back together. When an entry cannot be written, the action fails rather than going unrecorded.

## What an entry holds

| Field | Content |
|---|---|
| When | Time of the event. |
| Actor | The account that acted, and its email at that moment. Empty for events without a signed-in person, such as a failed sign-in or a download link opened from an email. |
| Action | What happened, for example `user.updated`. |
| Target | The kind of object and its id. For accounts the screen also shows the current email. |
| Before / After | The values that changed, as JSON. Any field whose name contains `pass`, `token`, `secret`, `code`, `challenge`, `authorization` or `cookie` is replaced by `[redacted]`. Long values are cut at 2,000 characters and lists at 200 items. |
| Address, browser | Client address (see `TRUST_PROXY`) and user agent. `AUDIT_LOG_IP=false` leaves them empty. |

## Recorded events

| Action | When |
|---|---|
| `admin.change` | Any successful change made by an admin or a manager through the API, with the procedure name as target and its input as After. This covers settings, groups, regions, domains, licences, asset types, menu, pages, records and every other administration screen. Procedures listed below write their own, more detailed entry instead. |
| `access.denied` | A signed-in user called something their role or the object does not allow. |
| `session.created` | A sign-in succeeded. After holds the method: `password`, `email_link`, `invitation`, `sso`, `password_reset`, `sign_up` or `legacy`. |
| `session.ended`, `session.revoked` | Sign-out; a session ended from Account > Security, or every session ended by an admin or manager. |
| `auth.sign_in_failed`, `auth.locked` | A wrong password (target: the account, or the typed email when no account exists); an account locked after repeated failures. |
| `auth.mfa_challenged`, `auth.mfa_failed` | A second-step code was asked for; a wrong code was given. |
| `auth.sso_failed` | A single sign-on attempt failed, with the reason. |
| `mfa.enabled`, `mfa.disabled`, `mfa.recovery_codes_renewed`, `mfa.reset` | Two-step verification changes; `mfa.reset` is an admin removing a user's enrolment. |
| `user.created`, `user.updated`, `user.approved`, `user.deleted` | Account lifecycle. `user.updated` carries before and after of email, name, company, role, region, groups, approval and maintenance contact. |
| `user.suspended`, `user.resumed` | Suspension and its lifting. |
| `password.reset`, `password.reset_sent`, `user.verification_resent` | A password reset completed; a reset or verification email sent by an admin or manager. |
| `user.email_verified` | An admin or manager marked a user's email address as verified without the confirmation link. |
| `access_review.exported`, `audit.exported` | Someone exported the access review or the audit log. |
| `collection.access_changed` | A collection's draft state, owner or group restrictions changed, with before and after. |
| `invitation.created`, `invitation.removed` | A guest invitation was sent or withdrawn. |
| `license.accepted` | A user accepted the usage terms before a download, with the licences. |
| `download.link_opened` | A download link was followed and redirected to the file. |
| `email_template.updated`, `email_template.reset` | An admin changed the wording of an email, or restored its default, with the previous and new content. |
| `email_settings.updated` | The sender name, address, reply-to or footer changed. |
| `brand.updated` | The brand name or accent colour changed. |

## Filter and export

Filter by actor email, action and date range; the list shows 50 entries per page, newest first. **Details** opens the before and after values.

**Export CSV** saves up to 50,000 entries that match the filters as `audit-log-YYYY-MM-DD.csv`. Cells starting with `=`, `+`, `-` or `@` are prefixed with `'` so spreadsheets do not run them. The export itself is recorded as `audit.exported`. An export holds personal data: keep it only as long as needed.

## Sending entries elsewhere

`AUDIT_LOG_STREAM=true` also writes each entry to the server log as an `audit` line with the same fields. A log collector can forward those lines to a SIEM or to storage that the Damvia host cannot modify. That covers the case where someone with database access could otherwise drop the table.

## Retention and personal data

Entries identify people by email and, unless `AUDIT_LOG_IP=false`, by address. Choose `AUDIT_RETENTION_DAYS` to match your organisation's retention policy, and mention the audit log in your privacy notice.
