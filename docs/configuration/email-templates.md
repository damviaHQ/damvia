---
title: Email templates
description: The nine transactional emails, the JSON that defines them, and the variables each template can use.
sidebar:
  order: 4
lastUpdated: 2026-09-16
---

Every email Damvia sends is plain text rendered from a template with [LiquidJS](https://liquidjs.com). The templates live in one JSON document, either the file `server/mailconfig.json` or the `MAILCONFIG` environment variable holding the same JSON encoded in base64.

## The file format

```json
{
  "email-verification": {
    "from": "\"Acme DAM\" <hello@acme.com>",
    "subject": "Please Verify Your Email Address",
    "body": "Hello,\n\nPlease verify your email address by clicking the link below:\n\n{{ url }}"
  },
  "login": { "from": "...", "subject": "...", "body": "..." }
}
```

Each key is a template name; each template has `from`, `subject` and `body`. Every `body` is a Liquid template. The `request-approval`, `storage-alert` and `disk-alert` subjects are rendered with Liquid; the other six subjects and every `from` are used literally. Bodies are plain text (`\n` for new lines), not HTML. All nine keys should be present: the sender reads `mailConfig()[name]` without a fallback and fails the job otherwise, except `storage-alert` and `disk-alert`, whose absence skips the alert, logs `storage.alert-template-missing` or `storage.disk-alert-template-missing`, and tries again at the next measurement, every 30 minutes, until the template is added. When `MAILCONFIG` is set, `server/mailconfig.json` is not read at all, so new templates must be added to the variable.

## The nine templates

| Key | Sent when | Recipient | Variables |
|---|---|---|---|
| `email-verification` | A user signs up, or asks to resend the verification | The user | `url`: `APP_URL/?verificationCode=...` |
| `login` | Login in passwordless mode, or with the magic-link option | The user | `url`: `APP_URL/login?token=...` (a 180-day session token) |
| `reset-password` | "Forgot password" | The user | `url`: `APP_URL/password-update?email=...&token=...` |
| `request-approval` | A user verifies their email while still unapproved | Every admin and manager of the user's region, in one message | `requester.name`; `url`: `APP_URL/admin/users/{id}/edit`. `requester.name` is also available in `subject`. The client defines no `/admin/users/{id}/edit` route today, so the link opens the app but not the user directly; approvers use `/admin/users`. |
| `user-approved` | An admin or manager approves the user | The user | `user.name`; `url`: `APP_URL/login?token=...` |
| `download-ready` | An "email" download's archive is built | The requesting user | `link`: a presigned S3 URL to the archive (not the `/v1/downloads/` link) |
| `invitation` | A guest is invited to a collection | The invited email | `url`: `APP_URL/collections/{id}?dam_token=...` (logs the guest in) |
| `storage-alert` | Storage usage crosses 80, 90, 95 or 100 % of `STORAGE_QUOTA` (once per crossing) | The admins designated with "Receives storage and maintenance emails", in one message; nothing is sent and `storage.alert-no-recipient` is logged when none is designated | `severity`: `warning` (80), `critical` (90, 95) or `full` (100); `percent`: integer; `used` and `quota`: sizes such as `1.2 TB`; `url`: `APP_URL/admin`. All are also available in `subject`. |
| `disk-alert` | The server disk crosses 80, 90, 95 or 100 % (once per crossing) | `SERVER_ALERT_EMAILS`, in one message; nothing is sent when unset | `severity`, `percent`, `free` and `total` (sizes), `appUrl`: `APP_URL`, to tell instances apart. All are also available in `subject`. |

Only the variables listed are available; any other `{{ name }}` renders empty.

## Loading order

1. If `MAILCONFIG` is set, it is base64-decoded and JSON-parsed synchronously at startup. A decoding error crashes the process immediately.
2. Otherwise the server reads `mailconfig.json` from the parent directory of the compiled `env.js`, which is `server/` both in development (`src/env.ts`) and in the Docker image (`dist/env.js`). If the read fails, it logs `Failed to read mailconfig.json` and exits.

To produce the variable from a file:

```bash
base64 -i mailconfig.json | tr -d '\n'
```

On Linux, `base64 -w0 mailconfig.json`. Paste the result as `MAILCONFIG=...`.

## Editing templates on a running instance

Templates are read once at startup. Restart the server after changing the file or the variable. Because emails are sent by the worker, the process that must restart is the one with `ENABLE_WORKER=true`.

:::tip
In development, MailHog at `http://localhost:8025` shows every message with its rendered subject and body, which is the fastest way to check a template.
:::

## Sender address and deliverability

`from` should be an address your SMTP provider is allowed to send for; with Postmark, a verified sender signature or domain. The server adds `X-PM-Message-Stream: outbound` to every message so Postmark routes it through the transactional stream. See [SMTP](../integrations/smtp.md).
