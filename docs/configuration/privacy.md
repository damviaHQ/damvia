---
title: Privacy and personal data
description: What personal data Damvia stores, for how long, which settings reduce it, and how to answer access, correction and deletion requests.
sidebar:
  order: 6
lastUpdated: 2026-09-30
---

The organisation that runs a Damvia instance is responsible for the personal data in it. This page lists what the software stores, so you can write your record of processing and your privacy notice, and shows how to answer requests from the people concerned. It describes the software, not a legal assessment.

## What is stored

| Data | Where | Kept | Purpose |
|---|---|---|---|
| Name, email, company, organisation, region, role, groups, approval and verification status | `users`, `organisations`, `user_groups` | Until the account is deleted | Access to the library |
| Password (salted scrypt hash), two-step verification key (encrypted with `APP_SECRET`) and hashed recovery codes | `users` | Until changed or the account is deleted | Sign-in |
| Sessions: sign-in time, last use, method, browser (user agent) | `user_sessions` | Until sign-out, `SESSION_IDLE_HOURS` without use, or `SESSION_MAX_HOURS`; pruned nightly | Keeping people signed in; letting them sign out elsewhere |
| Failed sign-in count and lockout | `users` | Cleared at the next successful sign-in | Protection against password guessing |
| Single-use email links and reset tokens (hashed) | `login_tokens`, `users` | 15 minutes to 7 days | Sign-in by email, password reset |
| Views, downloads, shares, favourites and searches | `activity_events` | `ANALYTICS_RETENTION_DAYS` (365) | [Insights](../administration/analytics.md) |
| Administrative changes, sign-ins, refusals, with address and browser | `audit_log` | `AUDIT_RETENTION_DAYS` (730) | Security; see [Audit log](../administration/audit-log.md) |
| Downloads requested, licence acceptance | `downloads` | Archives 7 days; rows until the account is deleted | Delivering files; proof of accepted usage terms |
| Invitations (invited email, sender) | `collection_invitations` | Until removed or the collection is deleted | Guest access |
| Changes to product records | `record_changes` | Until the record history is cleared | Record history |
| Newsletter choice, and a bounce reported for the address with the provider's reason | `users` (`newsletter_opt_out_at`, `email_bounced_at`, `email_bounce_reason`) | Until changed or the account is deleted | Not sending newsletters to people who declined them or cannot receive them |
| Who each newsletter went to: address, name, status, send time, the mail server's refusal | `newsletter_recipients` | As long as the newsletter (sent newsletters cannot be deleted); address and name removed when the account is deleted | Delivery report; the daily sending limit |
| People picked by hand in saved audiences | `audiences`, `newsletters` (the filter, as account ids) | Until the audience or draft is deleted | Choosing who receives a newsletter |
| Request log lines (method, path, status, address) | Server log | Your log retention | Operations |

The client stores display preferences, filters and recent searches in the browser's local storage. It sets one cookie, `damvia_session` (HttpOnly), plus `damvia_oidc` for 10 minutes during single sign-on. There are no statistics or advertising cookies, so no consent banner is needed for Damvia itself.

Outside the instance, personal data reaches your SMTP provider (email addresses and message content; with `EMAIL_EVENTS_SECRET` set, it reports bounces and spam complaints back), your object storage (downloaded archives), your identity provider (with single sign-on), and, when a password is set with `PASSWORD_BREACH_CHECK` on, the Have I Been Pwned range API. That API receives only the first 5 characters of the password's SHA-1, never the password or the email.

## Settings that reduce what is kept

| Setting | Effect |
|---|---|
| `ANALYTICS_RETENTION_DAYS` | Shorter statistics history. |
| `ANALYTICS_SEARCH_MODE=anonymous` or `off` | Searches without the searcher, or no searches. |
| `AUDIT_RETENTION_DAYS` | Shorter audit history. Keep it long enough for security investigations. |
| `AUDIT_LOG_IP=false` | No address or browser in the audit log. |
| `REQUEST_LOG=false` | No per-request log line. |
| `SESSION_IDLE_HOURS`, `SESSION_MAX_HOURS` | Shorter sessions. |
| `PASSWORD_BREACH_CHECK=false` | No call to Have I Been Pwned. |

## The privacy page

`APP_URL/privacy-policy` is built from the running configuration: retention periods, search mode, whether addresses are logged, session lengths and the breach check. Set `PRIVACY_CONTROLLER` (the responsible organisation) and `PRIVACY_CONTACT` (an email address or URL) so it names who to contact. If your organisation publishes its own notice, link to it from the legal information page (see [Branding](./branding.md#legal-pages)) and keep the facts consistent with this page.

## Answering requests

| Request | How |
|---|---|
| Access and portability (GDPR articles 15, 20) | The person uses **Account > Profile > Download my data** (`user.exportMyData`, three times an hour). For a request received by email, an admin calls `user.exportData` with the user id. Both return JSON with the account, groups, favourites, collections, invitations, downloads, activity, record changes, sessions, audit entries about them, and their newsletter choice, any bounce reported for their address, and the newsletters they were sent. Other people's addresses in those entries are left out. Both are recorded in the audit log. |
| Correction (article 16) | Account > Profile for name and company; an admin changes email, role, region and groups in Users. |
| Deletion (article 17) | Account > Profile > Delete account, or an admin deletes the user. Personal collections, invitations addressed to them, downloads and sessions are deleted. Statistics, record history and audit entries are kept for other purposes without naming the person: `activity_events.user_id` and `record_changes.changed_by_id` become empty, newsletter recipient rows lose the address and name (the counts of a sent newsletter stay right), and audit entries they made say `deleted user <id prefix>`, without address or browser. Audit entries that quote their email (for example a failed sign-in with that address) keep it until `AUDIT_RETENTION_DAYS` removes them; the log cannot be edited. Backups keep deleted data until they expire. |
| Restriction or objection (articles 18, 21) | Suspend the account (Users > Suspend access): nothing is processed for them until it is restored, and their data stays. For newsletters alone, the person unsubscribes from the link in any newsletter or under Account > Profile > Email communication; a spam complaint reported by the mail provider unsubscribes them too; see [Newsletters](../administration/newsletters.md#unsubscribing). |

Handle requests within one month. Record what you did; the audit log already records exports, deletions and suspensions.

## Breaches

The audit log, the request log and the `security.configuration` warnings at startup are where an investigation starts. See [Operations](../deployment/operations.md). Under the GDPR, a breach likely to affect people must be reported to the supervisory authority within 72 hours.
