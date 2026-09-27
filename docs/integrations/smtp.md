---
title: SMTP
description: Send Damvia's emails through any SMTP provider or your own mail server, switch providers, and why Loops is not a drop-in relay.
sidebar:
  order: 6
lastUpdated: 2026-09-27
---

Damvia sends its emails through Nodemailer over SMTP. Damvia renders every message itself (the branded HTML and its plain-text version), so the provider only relays it. Any service or server that accepts SMTP works, and switching provider means changing four variables and restarting. Every message is sent by a worker job, so a working setup also needs a process with `ENABLE_WORKER=true`.

## Variables

| Variable | Default | Notes |
|---|---|---|
| `SMTP_HOST` | `localhost` | |
| `SMTP_PORT` | `1025` | Nodemailer picks TLS from the port: 465 is implicit TLS, 587 and 25 start plain and upgrade with STARTTLS when the server offers it. |
| `SMTP_USER` | unset | Authentication is only configured when **both** user and password are set. |
| `SMTP_PASS` | unset | |
| `SMTP_REQUIRE_TLS` | `false` | `true` refuses to send when the server does not offer STARTTLS. |

The defaults match MailHog from `server/docker-compose.yml`, which accepts anything on port 1025 and shows it at `http://localhost:8025`.

The sender name, sender address and reply-to address are not variables: admins set them under **Admin → Emails**. See [Emails](../administration/emails.md).

## Choose a provider

| Provider | `SMTP_HOST` | `SMTP_PORT` | `SMTP_USER` / `SMTP_PASS` |
|---|---|---|---|
| Postmark | `smtp.postmarkapp.com` | `587` | The server API token, as both user and password |
| Amazon SES | `email-smtp.<region>.amazonaws.com` | `587` | SMTP credentials generated in SES, not the IAM access keys |
| Brevo | `smtp-relay.brevo.com` | `587` | The SMTP login and SMTP key from the Brevo account |
| Mailgun | `smtp.mailgun.org` (`smtp.eu.mailgun.org` for EU) | `587` | The domain's SMTP user and password |
| Resend | `smtp.resend.com` | `465` | `resend` and an API key |
| SendGrid | `smtp.sendgrid.net` | `587` | `apikey` and an API key |
| Your own server (Postfix, Exchange, Microsoft 365, Google Workspace relay) | Its hostname | `587`, or `25` inside a private network | An account allowed to send for the sender address, or none if the relay trusts the server's IP |

These values come from each provider's documentation and are not tested by Damvia's test suite; check the provider's current SMTP page. Whatever the provider:

1. Verify the sender domain with the provider and publish the SPF and DKIM records it gives you, plus a DMARC record. Without them, sign-in and verification emails are often filtered as spam.
2. Set the sender address under **Admin → Emails** to an address on that domain.
3. Restart the API and the worker with the new `SMTP_*` values.
4. Use **Send me a test** on any email in **Admin → Emails**. A refusal shows the mail server's message, for example an authentication or sender error.

### Switching provider

Emails are not stored at the provider: templates, branding and the sender all stay in Damvia. To move, verify the domain with the new provider, change the `SMTP_*` variables, restart, and send a test. Messages queued during the switch are retried by the worker (see below), so nothing needs to be exported.

### Postmark

The transport adds the header `X-PM-Message-Stream: outbound` to every message, which sends it through Postmark's default transactional stream. Other providers ignore the header.

### Loops is not a drop-in relay

[Loops](https://loops.so) offers SMTP at `smtp.loops.so`, but its relay does not deliver the message it receives. The body must be a JSON object naming a template built in the Loops editor (`transactionalId`) and its data variables, and Loops renders its own template. Pointing `SMTP_*` at Loops therefore fails: Damvia sends finished HTML, not that JSON, and the branding and wording edited in Damvia would not be used. Loops' [SMTP documentation](https://loops.so/docs/smtp) describes the format.

To send through Loops, Damvia would need a Loops sender that maps each of the ten emails to a Loops transactional ID and passes the variables in [Email templates](../configuration/email-templates.md). The design, logo and wording would then be managed in Loops, not in Damvia. This sender does not exist today.

## Which emails are sent

The ten emails, their triggers and recipients are listed in [Email templates](../configuration/email-templates.md). Damvia sends no digest, newsletter or sync-error email; sync errors are in the server logs.

## When delivery fails

1. Watch the server log for a `job` line with `status: failed` and a `mailer/…` or `email/…` queue. Nodemailer's message (authentication, connection, sender rejected) is included.
2. On success nothing is logged; check the inbox or the provider's activity log.

Failed mail jobs are retried with backoff, twice after the first attempt. Restarting after correcting SMTP can deliver jobs still eligible for retry; it does not revive jobs that failed permanently. Check the provider's logs for earlier deliveries, then trigger the action again from the application. Storage and disk alerts are sent directly by the storage check, not queued; a failed alert is tried again at the next check, every 30 minutes.
