---
title: Configuration
description: Damvia is configured almost entirely through environment variables; this group explains them by concern.
sidebar:
  order: 1
lastUpdated: 2026-09-16
---

Runtime configuration is read from environment variables and the mail templates. Restoring an instance also requires its database and main S3 bucket: that bucket holds collection thumbnails, page images and videos, and the login background. Keep configuration, secrets and application version alongside those backups; see [Backups](../deployment/backups.md).

| Page | Covers |
|---|---|
| [Server configuration](./server-env.md) | The server's `.env`, group by group: application URLs and secret, database, storage, mail, cloud sync, PIM. |
| [Client configuration](./client-env.md) | The client's build-time variables: API endpoint and brand colours. |
| [Email templates](./email-templates.md) | The `mailconfig.json` format, the seven templates and the variables each can use. |
| [Branding](./branding.md) | Everything that changes the look: app name, colours, login background, logo and favicon. |

The exhaustive table with defaults is [Environment variables](../reference/environment-variables.md). Provider setup (Dropbox app, Azure registration, SMTP, buckets) is in [Integrations](../integrations/index.md).

:::caution
Two defaults are safe on a laptop and dangerous on a server: `APP_SECRET` (signs every session token) and the MinIO credentials in `MAIN_S3_URL` / `ASSETS_S3_URL`. Change both before exposing an instance.
:::
