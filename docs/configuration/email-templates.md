---
title: Email templates
description: The ten emails Damvia sends, when each goes out, the variables it can use, and how its wording is rendered safely.
sidebar:
  order: 4
lastUpdated: 2026-09-27
---

Every email Damvia sends uses one branded layout, carrying the client logo and accent colour, and has wording admins edit under **Admin → Emails**. This page is the reference for the templates themselves: when each is sent, to whom, and what it can say. The editing workflow is in [Emails](../administration/emails.md).

## What every email looks like

Each message is sent as HTML with a plain-text alternative, both built from the same content:

- the client logo above the message, or the brand name in text when no logo is uploaded;
- a short accent-coloured bar, the heading, and the message;
- a button in the accent colour, followed by the same link in plain text for mail clients that block buttons;
- the footer line from the sender settings, then `Sent by <brand name> · <APP_URL host>`.

The layout is table-based with inline styles, 560 pixels wide, and narrows on phones. It declares a light colour scheme so a dark-mode inbox does not invert the logo. The button text is white, unless the accent colour is too light for white text (contrast under 3:1), in which case it is near-black.

The logo is served from `API_URL/v1/branding/email-logo.png`, a PNG copy made when the logo is uploaded, because Outlook shows neither WebP nor SVG. The address is public and stable, so it keeps working in old emails; a presigned storage link would stop after an hour. A `?v=` suffix changes when the logo is replaced, so inboxes fetch the new one. `API_URL` must therefore be reachable from the internet for the logo to show.

## The ten templates

Each template has a subject, a preview text (the grey line most inboxes show after the subject), a heading, a message and, where the email has a link, a button label. An email whose template was never edited uses the built-in wording, which improves with Damvia releases.

| Key | Sent when | Recipients | Variables |
|---|---|---|---|
| `email-verification` | A user signs up, asks to resend the verification, or an admin changes their address | The user | `url`: `APP_URL/?verificationCode=...` |
| `login` | Sign-in without password, or with the magic-link option. Only to an existing account that is not suspended | The user | `url`: `APP_URL/login?link=...`, single use, valid 15 minutes |
| `reset-password` | "Forgot password", or an admin or manager sends a reset. Not to a suspended account | The user | `url`: `APP_URL/password-update?email=...&token=...`, valid one hour. The token is created when the email is sent; a newer request replaces it |
| `request-approval` | A user verifies their email while still unapproved | Every admin, plus the managers of the user's region, in one message; only approved, verified, non-suspended accounts | `requester.name`, `requester.email`, `requester.company`; `url`: `APP_URL/admin/users/{id}` |
| `user-approved` | An admin or manager approves the user | The user | `user.name`; `url`: `APP_URL/login?link=...`, single use, valid 7 days |
| `invitation` | A guest is invited to a collection with "send an email" | The invited address | `collection.name`, `inviter.name` (empty if that account was deleted), `expiresAt`; `url`: `APP_URL/login?invite=...`. Each sending creates a new link; links from earlier emails stop working |
| `download-ready` | An emailed download's archive is built | The requesting user | `expiresAt`; `url`: `API_URL/v1/downloads/{id}`, which checks the download and its owner at each click |
| `storage-alert` | Storage use crosses 80, 90, 95 or 100 % of `STORAGE_QUOTA`, once per crossing | Admins marked "Receives storage and maintenance emails"; nothing is sent, and `storage.alert-no-recipient` is logged, when none is | `severity` (`warning`, `critical` or `full`), `percent`, `used`, `quota`; `url`: `APP_URL/admin` |
| `disk-alert` | The server disk crosses 80, 90, 95 or 100 %, once per crossing | `SERVER_ALERT_EMAILS`; nothing is sent when unset | `severity`, `percent`, `free`, `total`. No button |
| `license-expiring` | A licence's end date is 30, 7 or 1 days away (`LICENSE_EXPIRY_NOTICE_DAYS`), daily at 06:00 UTC | Every approved, verified, non-suspended admin | `licenses` (list of `{ name, date, days }`), `licenses.size`, the `licenseList` block; `url`: `APP_URL/admin/licenses` |

Every template can also use `appName`, the brand name from **Settings → Brand name** (`APP_NAME` when empty, then `Damvia`), and `appUrl` (`APP_URL`). See [Branding](./branding.md). Dates in `expiresAt` read like `4 October 2026`.

Every link that signs someone in is a credential. The server stores only its hash, but anyone holding the email can use it: a `login` or `user-approved` link once before it expires, an `invitation` link for as long as the invitation lasts.

## Writing with variables

Wording is written with [LiquidJS](https://liquidjs.com) syntax. `{{ user.name }}` prints a value; filters and conditions work in every field:

```liquid
{{ inviter.name | default: "Someone" }} shared “{{ collection.name }}” with you
{% if licenses.size == 1 %}A licence ends soon{% else %}{{ licenses.size }} licences end soon{% endif %}
```

A variable that the template does not list prints nothing. A **block** such as `{{ licenseList }}` is laid out by Damvia (here, a bulleted list of licences with their end dates) and placed where it is written; put it on its own line in the message.

## What a template cannot do

Templates are written by admins, and the values they print come partly from other people (a user's name, a collection name). The renderer therefore:

- **escapes every value** printed into the HTML, so a name such as `<script>` shows as text. The `raw` filter does not turn escaping off. Subjects are plain text and are not escaped;
- **keeps only the formatting the editor produces** in the message: paragraphs, headings, bold, italic, lists, quotes, links (`http`, `https`, `mailto`) and rules. Styles, images, scripts and event attributes are removed when the template is saved, and again once values are filled in, so a value used as a link address (for example a name set to `javascript:…`) loses its link;
- **treats the preview text, heading and button label as text**: a tag typed into them shows as text, without its attributes;
- **refuses `{% include %}`, `{% render %}` and `{% layout %}`**: a template cannot read files from the server;
- **refuses unknown filters and runaway loops**, with a render and memory limit.

A template that fails to render is refused when saved, with the error shown in the editor, so a broken template never stops an email from being sent.

## Moving from `mailconfig.json` or `MAILCONFIG`

Before this change, templates were plain text in `server/mailconfig.json` or in the base64 `MAILCONFIG` variable. Both are no longer read: the file is gone and the variable only logs a warning at startup. Customised wording must be entered again under **Admin → Emails**; see [Upgrading](../deployment/upgrading.md).
