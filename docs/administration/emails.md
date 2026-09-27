---
title: Emails
description: Set the sender, edit the wording of each email with a live preview, send yourself a test and restore the default.
sidebar:
  order: 18
lastUpdated: 2026-09-27
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

## Edit an email

The list groups the ten emails into **Account**, **Sharing and downloads** and **Alerts**, with what triggers each and who receives it. **Customised** marks an email whose wording was changed, with the date and the admin who changed it.

Opening an email shows the form on the left and the preview on the right:

1. Change the **subject**, the **preview text** shown after the subject in most inboxes, the **heading**, the **message** and the **button label**. Select text in the message to format it or add a link. An empty button label removes the button.
2. Click a variable under **Personalise** to insert it where the cursor is, in any field. The variables and their meaning are listed in [Email templates](../configuration/email-templates.md).
3. The preview updates as you type, with sample values, at desktop or phone width. A mistake in a variable or a condition shows above the preview, and the test and save buttons wait until it is fixed.
4. **Send me a test** sends the unsaved draft, with `[Test]` before the subject, to your own address. Ten tests per quarter of an hour are allowed.
5. **Save** applies the wording to every email sent from then on. Emails already queued are rendered when they are sent, so they use the new wording too.

Leaving with unsaved changes asks for confirmation.

## Restore the default wording

**Reset to default** removes your changes to that email. From then on it follows the built-in wording, including improvements in later Damvia releases. An email you customised keeps your wording across upgrades.

## What is recorded

Saving or resetting an email and changing the sender are written to the [audit log](./audit-log.md) as `email_template.updated`, `email_template.reset` and `email_settings.updated`, with the previous and new content.
