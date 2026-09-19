---
title: SMTP
description: Configure outgoing email with any SMTP provider; Postmark is the one the code is tuned for.
sidebar:
  order: 6
lastUpdated: 2026-09-19
---

Damvia sends plain-text emails through Nodemailer over SMTP. There is no HTTP mail API integration and no HTML. Every message is sent by a worker job, so a working SMTP setup also needs a process with `ENABLE_WORKER=true`.

## Variables

| Variable | Default | Notes |
|---|---|---|
| `SMTP_HOST` | `localhost` | |
| `SMTP_PORT` | `1025` | Nodemailer picks TLS mode from the port: 465 is implicit TLS, 587 and 25 start plain and upgrade with STARTTLS when the server offers it. |
| `SMTP_USER` | unset | Authentication is only configured when **both** user and password are set. |
| `SMTP_PASS` | unset | |

The defaults match MailHog from `server/docker-compose.yml`, which accepts anything on port 1025 and shows it at `http://localhost:8025`.

Sender addresses and subjects are not variables; they are in the mail templates. See [Email templates](../configuration/email-templates.md).

## Postmark

The transport adds the header `X-PM-Message-Stream: outbound` to every message. On Postmark this selects the default transactional stream; other providers ignore the header. A Postmark setup:

```bash
SMTP_HOST=smtp.postmarkapp.com
SMTP_PORT=587
SMTP_USER=<server API token>
SMTP_PASS=<server API token>
```

Postmark uses the same server token as both user and password. The `from` addresses in the templates must belong to a verified sender signature or domain.

## Other providers

Any SMTP relay works, for example Amazon SES (`email-smtp.<region>.amazonaws.com:587` with SMTP credentials), Mailgun, Brevo, or a company mail server. The requirements are the same: the relay must accept the `from` addresses in the templates, and it should sign with SPF and DKIM so verification links are not filtered.

## Which emails are sent

| Event | Template |
|---|---|
| Sign-up, resend verification | `email-verification` |
| Login without password | `login` |
| Password reset request | `reset-password` |
| Unapproved user verified their email | `request-approval`, to the admins and managers of the user's region |
| User approved | `user-approved` |
| Email-type download ready | `download-ready` |
| Guest invited to a collection | `invitation` |

There is no digest, newsletter or notification email beyond these seven, and no email is sent to admins on sync errors; use the server logs for that.

## Testing

1. With the worker running, request a password reset from the login page for an existing account.
2. Watch the server log for a `job` line with `status: failed` and queue `mailer/password-reset` if delivery fails; Nodemailer's error message (authentication, connection, sender rejected) is included.
3. On success nothing is logged; check the inbox or the provider's activity log.

Failed mail jobs use backoff with two retries after the initial attempt in installed pg-boss 12. Mail is sent with nodemailer 10 over plain SMTP; nothing changes for `SMTP_*`. Restarting after correcting SMTP can deliver jobs still eligible for retry; it does not revive permanently failed jobs. Inspect their state and trigger a fresh application action after checking provider logs for prior delivery.
