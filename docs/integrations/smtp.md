---
title: SMTP
description: Send Damvia's emails and newsletters through any SMTP provider or your own mail server, switch providers, and why Loops is not a drop-in relay.
sidebar:
  order: 6
lastUpdated: 2026-09-29
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
| `NEWSLETTER_RATE_PER_SECOND` | `5` | How many newsletter messages leave per second. Decimals below 1 are allowed, such as `0.5` for one every two seconds. See [Newsletters](#newsletters). |
| `NEWSLETTER_DAILY_LIMIT` | `2000` | At most this many newsletter messages in any 24 hours; `0` for no limit. See [Newsletters](#newsletters). |
| `EMAIL_EVENTS_SECRET` | unset | At least 32 characters, such as the output of `openssl rand -hex 32`. Turns on the address that receives bounces and spam reports. See [Bounce and spam reports](#bounce-and-spam-reports). |
| `NEWSLETTER_MESSAGE_STREAM` | unset | Postmark only: the message stream for newsletters, such as `broadcast`. |

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

1. Verify the sender domain with the provider and publish the SPF and DKIM records it gives you, plus a DMARC record. Without them, sign-in and verification emails are often filtered as spam. **Admin → Emails → Sender domain** reads these records and says what is missing; see [Emails](../administration/emails.md#check-the-sender-domain).
2. Set the sender address under **Admin → Emails** to an address on that domain.
3. Restart the API and the worker with the new `SMTP_*` values.
4. Use **Send me a test** on any email in **Admin → Emails**. A refusal shows the mail server's message, for example an authentication or sender error.

### Switching provider

Emails are not stored at the provider: templates, branding and the sender all stay in Damvia. To move, verify the domain with the new provider, change the `SMTP_*` variables, restart, and send a test. Point the new provider's bounce and complaint webhook at Damvia (see [Bounce and spam reports](#bounce-and-spam-reports)), and remove the old one's. Messages queued during the switch are retried by the worker (see below), so nothing needs to be exported.

### Postmark

The transport adds the header `X-PM-Message-Stream: outbound` to every account email, which sends it through Postmark's default transactional stream; newsletters carry `NEWSLETTER_MESSAGE_STREAM` instead when it is set. Other providers ignore the header.

Postmark does not accept bulk email on a transactional stream. Before sending [newsletters](../administration/newsletters.md) through Postmark, create a *Broadcasts* stream in the Postmark server and set `NEWSLETTER_MESSAGE_STREAM` to its ID (usually `broadcast`).

### Loops is not a drop-in relay

[Loops](https://loops.so) offers SMTP at `smtp.loops.so`, but its relay does not deliver the message it receives. The body must be a JSON object naming a template built in the Loops editor (`transactionalId`) and its data variables, and Loops renders its own template. Pointing `SMTP_*` at Loops therefore fails: Damvia sends finished HTML, not that JSON, and the branding and wording edited in Damvia would not be used. Loops' [SMTP documentation](https://loops.so/docs/smtp) describes the format.

To send through Loops, Damvia would need a Loops sender that maps each of the ten emails to a Loops transactional ID and passes the variables in [Email templates](../configuration/email-templates.md). The design, logo and wording would then be managed in Loops, not in Damvia. This sender does not exist today.

## Which emails are sent

The ten account emails, their triggers and recipients are listed in [Email templates](../configuration/email-templates.md). Admins can also send [newsletters](../administration/newsletters.md). Damvia sends no digest or sync-error email; sync errors are in the server logs.

## Newsletters

A newsletter goes to many people at once, so it is sent differently from the account emails:

- **One message per person.** Each message is addressed to that person alone and carries their own unsubscribe link. It also carries the `List-Unsubscribe` and `List-Unsubscribe-Post` headers, which Gmail and Yahoo require from bulk senders.
- **A separate, paced connection.** Newsletters use their own connection, and leave one at a time at `NEWSLETTER_RATE_PER_SECOND` messages a second. The pace and the daily limit are kept in the database, so they hold however many worker processes run. A password reset sent during a large newsletter does not wait behind it.
- **A failure is kept, not retried.** When the mail server refuses a message, the refusal is kept against that recipient and shown on the newsletter's **Delivery** page. An admin retries the failed recipients from there. A worker job that restarts never sends twice to someone already marked as sent.

**Protect the domain's reputation.** Mailbox providers judge a domain by how much it sends, how suddenly, and how many people complain or never open. A domain that goes from a few account emails a day to thousands of newsletters at once is treated as a spammer, and then its password resets land in spam too. Damvia guards against this in three ways:
- **A daily limit.** At most `NEWSLETTER_DAILY_LIMIT` messages (2,000 by default) leave in any 24 hours, across every worker. The rest of a send waits and resumes by itself when the window allows; the newsletter shows when. The review step says how many go today and over how many days the rest follow.
- **A steady pace.** `NEWSLETTER_RATE_PER_SECOND` spreads each day's messages out.
- **Only people who can receive it.** Unapproved, unverified, suspended and unsubscribed accounts are never sent to, and every message carries one-click unsubscribe. With [bounce and spam reports](#bounce-and-spam-reports) connected, addresses that bounce and people who complain are left out too.

For a new domain, or one that never sent newsletters, warm it up: start with a few hundred a day for the first week, then raise `NEWSLETTER_DAILY_LIMIT` step by step. A separate subdomain for newsletters (for example `news.acme.com`, set as the sender address) keeps their reputation apart from the main domain's, but it applies to account emails too, since both use the same sender.

**Know when to use a dedicated platform.** Damvia's newsletters suit organisations with up to about 500 people. For larger audiences or frequent campaigns, use an email platform (Brevo, Mailchimp, Loops, Customer.io) that spreads sending over its own warmed-up servers. And whatever the size, relay through a sending provider rather than your own mail server: an office or self-hosted server has no sending reputation, and its IP address is often on block lists.

**Set the rate below your provider's limit.** Many providers throttle or suspend accounts that send faster than their plan allows. At the default of 5 a second, 1,000 people take a little over three minutes.

**Check the provider's policy for bulk email.** Some providers accept newsletters only on a separate stream or with a marketing plan:
- Postmark: see [Postmark](#postmark).
- Amazon SES: sending limits apply per account and region.
- Microsoft 365 and Google Workspace: daily recipient limits make them a poor fit for more than a few hundred recipients.

## Bounce and spam reports

Providers learn after sending that an address does not exist, or that the reader marked the message as spam. Connected, they report it to Damvia, which pauses newsletters to addresses that bounced and unsubscribes people who complained. See [Newsletters](../administration/newsletters.md#bounces-and-spam-reports).

1. Generate a secret, for example with `openssl rand -hex 32`, and set it as `EMAIL_EVENTS_SECRET` on the API. Restart it.
2. In the provider, add a webhook to `API_URL/v1/email-events/<the secret>`, with the events below.
3. Check **Admin → Emails → Sender domain**: **Bounce and spam reports** shows **Connected**, then the time of the last bounce or complaint applied to an account.

| Provider | Where | Events |
|---|---|---|
| Postmark | Server → Settings → Webhooks | Bounce, Spam complaint |
| Amazon SES | An SNS topic set for the identity's bounce and complaint notifications, with an HTTPS subscription to the address. Damvia confirms the subscription itself, and only at an `sns.<region>.amazonaws.com` address. Raw message delivery on or off both work | Bounce, Complaint |
| SendGrid | Settings → Mail Settings → Event Webhook | Bounced, Spam Reports |
| Mailgun | Sending → Webhooks | Permanent failure, Spam complaints |
| Resend | Webhooks | `email.bounced`, `email.complained` |
| Brevo | Transactional → Settings → Webhooks | Hard bounce, Complaint (spam) |

The menus come from each provider's documentation and may have moved; the events are what matters. Soft bounces, deliveries and opens can be left off: Damvia ignores them.

The secret in the address is the only proof a report comes from the provider, so keep it out of tickets and screenshots. Without `EMAIL_EVENTS_SECRET`, the address answers `404`. A request log shows the path as `/v1/email-events/:secret`. A report is applied once: a bounce for an address already paused, or a complaint from someone already unsubscribed, changes nothing, so a provider sending the same report again is harmless. Reports for addresses that belong to no account are ignored. Your own mail server sends no such reports; bounces arrive as emails at the sender or reply-to address, and are handled by hand.

## When delivery fails

1. Watch the server log for a `job` line with `status: failed` and a `mailer/…` or `email/…` queue. Nodemailer's message (authentication, connection, sender rejected) is included.
2. On success nothing is logged; check the inbox or the provider's activity log.

A newsletter message the mail server refuses is not a job failure: it is shown on the newsletter's **Delivery** page and logged as `newsletter.send-failed`. Reaching the daily limit logs `newsletter.daily-limit-reached`, and a send picked up again after it stalled logs `newsletter.resumed-stalled`.

Failed mail jobs are retried with backoff, twice after the first attempt. Restarting after correcting SMTP can deliver jobs still eligible for retry; it does not revive jobs that failed permanently. Check the provider's logs for earlier deliveries, then trigger the action again from the application. Storage and disk alerts are sent directly by the storage check, not queued; a failed alert is tried again at the next check, every 30 minutes.
