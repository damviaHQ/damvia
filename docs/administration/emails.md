---
title: Emails
description: Set the sender, edit the wording of each email with a live preview, send yourself a test and restore the default.
sidebar:
  order: 18
lastUpdated: 2026-09-29
---

Admins control what Damvia's emails say and who they come from, under **Admin → Emails** (`/admin/emails`). The layout, logo and accent colour are shared by every email and come from [Settings](../configuration/branding.md). Only admins open this screen.

## Set the sender first

The **Sender** panel sets:

| Field | Used as | When empty |
|---|---|---|
| Name | The name inboxes show | The brand name from **Settings → Brand name** |
| Address | The `From` address | `no-reply@` followed by the `APP_URL` host |
| Replies go to | The `Reply-To` address | Replies go to the sender address |
| Footer | A line at the bottom of every email, such as the company name and postal address | No line |

The panel shows the address emails currently leave from. Your mail provider must be allowed to send for it, through a verified domain or sender signature; otherwise messages are refused or filtered as spam. See [SMTP](../integrations/smtp.md).

## Check the sender domain

The **Sender domain** panel reads the DNS records of the domain in the sender address and says, for each, whether it is set up, needs attention or is missing, with the record to add:

| Record | What it proves | Checked |
|---|---|---|
| SPF | Which servers may send for the domain | One `v=spf1` TXT record on the domain that ends in an `all` other than `+all` (`~all` or `-all` recommended) or uses `redirect=`, and includes the provider in `SMTP_HOST` when it is a known one (Postmark, Amazon SES, Brevo, Mailgun, Resend, SendGrid, Microsoft 365, Google Workspace) |
| DKIM | That the message was not changed and comes from the domain | A public key at `<selector>._domainkey.<domain>`. Common selectors and the provider's are tried; Postmark and Amazon SES make their own, so type yours in **Selector** |
| DMARC | What receivers do with mail that fails SPF and DKIM | A `v=DMARC1` TXT record on `_dmarc.<domain>`. `p=none` is flagged: fine to start, then move to `quarantine` |
| Replies | That replies and bounces reach someone | MX records on the domain |

Gmail and Yahoo require SPF, DKIM and DMARC from anyone sending newsletters. The check only reads DNS: it cannot see whether your provider actually signs with the key, so also send a test and look at its headers (`dkim=pass`, `spf=pass`, `dmarc=pass`). The panel also shows whether **Bounce and spam reports** are connected, when the last bounce or complaint was applied to an account and how many addresses are paused after a bounce (see [SMTP](../integrations/smtp.md#bounce-and-spam-reports)), and the newsletter pace and daily limit the host set. A sender address on `localhost` or another name receivers cannot check is reported instead of the records.

## Edit an email

The list groups the ten emails into **Account**, **Sharing and downloads** and **Alerts**, with what triggers each and who receives it. **Customised** marks an email whose wording was changed, with the date and the admin who changed it.

Opening an email shows the form on the left and the preview on the right:

1. Change the **subject**, the **preview text** shown after the subject in most inboxes, the **heading**, the **message** and the **button label**. Select text in the message to format it or add a link. An empty button label removes the button.
2. Click a variable under **Personalise** to insert it where the cursor is, in any field. The variables and their meaning are listed in [Email templates](../configuration/email-templates.md).
3. The preview updates as you type, with sample values, at desktop or phone width. A mistake in a variable or a condition shows above the preview. **Send me a test** waits until it is fixed, and **Save** is refused with the same error.
4. **Send me a test** sends the unsaved draft, with `[Test]` before the subject, to your own address. Ten tests per quarter of an hour are allowed.
5. **Save** applies the wording to every email sent from then on. Emails already queued are rendered when they are sent, so they use the new wording too.

Leaving with unsaved changes asks for confirmation.

## Restore the default wording

**Reset to default** removes your changes to that email. From then on it follows the built-in wording, including improvements in later Damvia releases. An email you customised keeps your wording across upgrades.

## What is recorded

Saving or resetting an email and changing the sender are written to the [audit log](./audit-log.md) as `email_template.updated`, `email_template.reset` and `email_settings.updated`, with the previous and new content.
