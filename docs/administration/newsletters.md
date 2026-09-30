---
title: Newsletters
description: Write an email once and send it to everyone or to a chosen audience, now or at a set time, then see who received it.
sidebar:
  order: 19
lastUpdated: 2026-09-29
---

A newsletter is an email written once and sent to many people: a new collection, a product launch, a monthly update. Admins write and send newsletters under **Admin → Newsletters** (`/admin/newsletters`). Only admins open this screen.

Newsletters use the same layout as the account emails: your logo, accent colour, sender and footer from [Settings](../configuration/branding.md) and [Emails](./emails.md). Each person receives their own copy, addressed to them alone, with a link to unsubscribe.

## Built for small audiences

Newsletters in Damvia suit organisations with up to about 500 people: a few hundred messages at a time, relayed by the mail server set in `SMTP_*`. Damvia paces them, holds them to a daily limit, removes addresses that bounce and people who complain, and handles unsubscribing.

For larger audiences, frequent campaigns, open and click statistics or A/B tests, use a dedicated email platform (Brevo, Mailchimp, Loops, Customer.io) and export the addresses from **Admin → Users**. That export does not say who unsubscribed or bounced: remove those people before importing, or the platform mails people who asked not to be. Those platforms spread sending over many servers and warm up their addresses; a single company domain sending thousands of messages a day on its own is soon filtered as spam, whatever Damvia does.

Even for a small audience, relay through a sending provider (Postmark, Amazon SES, Brevo, Mailgun, Resend, SendGrid) rather than your own mail server. See [SMTP](../integrations/smtp.md#choose-a-provider).

## Write a newsletter

**New newsletter** opens the editor in three steps. The preview on the right updates as you type, at desktop or phone width, and is shown with your own name.

1. **Compose**
   - **Name**: seen only by admins.
   - **Subject** and **preview text**: the preview text is the line most inboxes show after the subject.
   - **Heading**: optional.
   - **Message**: select text to format it or add a link. The toolbar above the message adds:
     - an **Image**, uploaded from your computer;
     - a **Button** with a label and a link, drawn in your accent colour;
     - a **Divider**.
   - Click a variable under **Personalise** to insert it, for example `{{ user.firstName }}`. The variables are listed in [Email templates](../configuration/email-templates.md#newsletter-variables).
2. **Audience**: who receives it. See [Choose the audience](#choose-the-audience).
3. **Review and send**:
   - Check the subject and the number of recipients.
   - Choose **Send now** or **Schedule**.
   - Confirm. The confirmation repeats how many people it goes to.

**Send me a test** sends the draft to your own address, with `[Test]` before the subject and your own unsubscribe link. Ten tests per quarter of an hour are allowed. Send one before every newsletter: links, images and the unsubscribe link are best checked in a real inbox. Clicking **Unsubscribe** in the test does unsubscribe you.

**Save** keeps the draft. Leaving with unsaved changes asks for confirmation. Sending saves the draft first.

### Images

Images are uploaded when you add them: JPEG, PNG, WebP or GIF, up to 10 MB.

- **Format and size.** Damvia stores them as JPEG, or as PNG when they have transparent areas, because Outlook shows neither WebP nor animation. They are shown up to the width of the email.
- **Alt text.** You are asked for a short description, which is shown to people whose mail client hides images and is read aloud by screen readers.
- **Public address.** Newsletter images are served from a public address that does not expire (`/v1/newsletter-images/…` on the API), because they stay in inboxes after sending. Do not upload anything confidential.
- **When the API address changes.** Drafts and scheduled newsletters follow `API_URL`: their images are shown from the new address. Newsletters already in inboxes keep the old one, so redirect `/v1/newsletter-images/` from the old host to the new one.
- **Images from elsewhere.** An image copied from another website is removed when the newsletter is saved. It could track who opens the email, and it may disappear.

## Choose the audience

- **Everyone** sends to every account that can receive it.
- **Choose who** combines up to five things:

| Row | Matches |
|---|---|
| Role | Admins, managers, members or guests. Several roles mean any of them. |
| Group | People in any of the chosen groups. |
| Region | People in any of the chosen regions. |
| Also send to | People picked by hand, added whatever the rows above say. |
| Leave out | People picked by hand who never receive it, even when **Everyone** is chosen. |

The rows combine: **Guests** with the region **Europe** reaches guests in Europe only.

Leaving every row empty reaches nobody, so a newsletter is never sent to everyone by accident.

The box under the rows shows how many people match right now, with the first names.

Some accounts never receive a newsletter, even when picked by hand:
- accounts that are unapproved or unverified;
- suspended accounts;
- accounts that unsubscribed;
- addresses the mail provider reported as undeliverable (see [Bounces and spam reports](#bounces-and-spam-reports)).

In the person picker, they are marked *won't receive it*.

### Saved audiences

**Save as audience…** keeps the current selection under a name, such as *Guests in Europe*. **Use a saved audience…** fills it in again in one click. The **Saved audiences** tab lists them with how many people each reaches today; **New audience** creates one there, and clicking one edits or deletes it.

A newsletter copies the audience when you pick it. Editing or deleting the saved audience later never changes a newsletter that was already written or sent.

## Sending and scheduling

**Send now** starts within a minute.

**Schedule** takes a date and time in your browser's time zone, at most a year ahead. Until then:
- the newsletter shows as **Scheduled** and cannot be changed;
- **Unschedule and edit** takes it back to a draft without sending anything.

When sending starts:
- **The list of people is fixed.** Damvia takes everyone matching the audience at that moment. People who join the audience later are not added.
- **At most so many a day.** To protect the domain's reputation, at most `NEWSLETTER_DAILY_LIMIT` newsletter emails (2,000 unless the host changed it) leave in any 24 hours, across all newsletters and all workers. **Review and send** says how many go now and over how many days the rest follow; the **Delivery** page says when sending resumes. Nothing needs to be done: it resumes by itself.
- **Messages are paced.** They go out one at a time at the rate set by `NEWSLETTER_RATE_PER_SECOND` (5 a second unless the host changed it), however many workers run, through a connection separate from the account emails. A large send does not delay a password reset. See [SMTP](../integrations/smtp.md#newsletters).
- **It cannot be stopped.** A newsletter that has started sending runs to the end. If the worker stops in the middle, sending resumes where it left off: at the worker's next start, or after 15 minutes without progress.

## Who received it

Once sending starts, the newsletter opens on **Delivery** instead of the editor. While it sends, the page refreshes every few seconds. You can leave it.

**Delivery** shows a progress bar and these counts:

| Count | Meaning |
|---|---|
| Recipients | Everyone in the fixed list. |
| Sent | Your mail server accepted the message. Whether it reached the inbox or the spam folder is up to the receiving provider. |
| Failed | The mail server refused the message. The reason is shown next to the person, for example `550 mailbox unavailable`. |
| Skipped | Between the start and their turn, the person unsubscribed, was suspended, lost approval or verification, was deleted, or had their address reported as undeliverable. |
| Bounced | Sent, then reported by the mail provider as undeliverable. Only with bounce reports connected. |
| Marked as spam | Sent, then marked as spam by the person. Only with bounce reports connected. |

The table below lists every recipient, and can be filtered by status or searched.

After fixing the cause, **Retry failed** sends again to the failed people only. Nobody receives the newsletter twice.

**Duplicate** starts a new draft with the same content and audience. This is the way to reuse a sent newsletter or to send a correction. Sent newsletters cannot be deleted: they stay as the record of what went out. Only drafts can be deleted.

Damvia does not track opens or clicks: there is no tracking pixel and links are not rewritten.

## Bounces and spam reports

A mail server can accept a message and learn later that the address does not exist (a bounce), or the reader can mark it as spam (a complaint). Only the mail provider sees these. Sending again to such addresses is what damages a domain's reputation most, so Damvia acts on them when the provider reports them:

- **A bounce** pauses newsletters to that address. The person's profile says so, **Admin → Users** shows **Bounced** next to the address, and the newsletter that last reached them in the previous 30 days counts it as **Bounced**. Account emails are still sent. The pause ends when the address changes, when it is verified again, or when the person ticks **Receive news and updates** in their profile.
- **A spam report** unsubscribes the person, as if they had clicked the link.
- **A temporary failure** (a full mailbox, a server down) is retried by the provider and changes nothing.

The provider must send these reports to Damvia. The host sets `EMAIL_EVENTS_SECRET` and gives the provider the address `API_URL/v1/email-events/<secret>`. **Admin → Emails → Sender domain** shows whether reports are connected and when the last one arrived. Setup for each provider is in [SMTP](../integrations/smtp.md#bounce-and-spam-reports).

## Unsubscribing

Every newsletter ends with **Unsubscribe from these emails**, and carries the headers (`List-Unsubscribe`, one-click) that let Gmail, Outlook and Apple Mail show their own **Unsubscribe** button next to the sender.

- **The link.** It opens a page that asks before doing anything, because mail scanners open links on their own. The page shows the address partly masked.
- **The mail client's button.** It unsubscribes at once.
- **The profile.** People tick or untick **Receive news and updates from** your brand name under **Email communication** in **Account → Profile**, on a computer or a phone.

A link in a newsletter can only unsubscribe. Subscribing again is done from the profile, after signing in, so a newsletter forwarded to someone else cannot be used to sign the reader up again. Links stop working after 90 days, and as soon as the person changes their choice in their profile. An expired link says to sign in and use the profile instead.

Unsubscribing stops newsletters only. Account emails such as password resets, approvals, invitations and download links always arrive.

Every change is recorded in the [audit log](./audit-log.md) as `newsletter.unsubscribed` or `newsletter.resubscribed`.
