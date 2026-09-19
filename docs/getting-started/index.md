---
title: Requirements
description: "What you need before installing Damvia: runtime, services, a cloud storage app, and the media tools that make previews."
sidebar:
  order: 1
lastUpdated: 2026-09-19
---

Damvia is a Node.js server, a static single-page client, and three services it depends on. This page lists what to have ready; [Local setup](./local-setup.md) walks through running it on one machine, and [Deployment](../deployment/index.md) through running it for real.

## Runtime

| Requirement | Version | Why |
|---|---|---|
| Node.js | Node 22.12 or newer | Both packages declare `engines.node >=22.12.0`. The server Dockerfile uses `node:22-bookworm`. See [Validation status](../reference/validation-status.md) for local checks. |
| npm | ships with Node | Both packages install with `npm install`. There is no monorepo tool; `client/` depends on `server/` through `"server": "file:../server"` for shared tRPC types, so install the server first. |
| Git | any | Recommended for version tracking; an archive containing both `server/` and `client/` can also satisfy the local npm dependency. |

## Services

| Service | Version | Notes |
|---|---|---|
| PostgreSQL | 15 | Back up with the main bucket and configuration. pg-boss (the job queue) lives in the same database. The initial migration seeds one group (`Default`) and one region (`Global`). |
| S3-compatible object storage | MinIO or AWS S3 | Two buckets: one for app uploads (thumbnails, login background), one for asset originals, previews and download archives. Browsers talk to it directly through presigned URLs, so it must be reachable from users, not only from the server. See [Object storage](../integrations/object-storage.md). |
| SMTP server | any | Every account flow (verification, approval, magic link, password reset, invitations, "download ready") is an email. Postmark is the provider the code is tuned for. See [SMTP](../integrations/smtp.md). |

`server/docker-compose.yml` starts all three for development (Postgres 15, MinIO, MailHog).

## A cloud storage the assets already live in

Damvia does not host uploads. It mirrors one of:

| Provider | What you need |
|---|---|
| Dropbox (personal or Business) | A Dropbox app with a refresh token. For a Business team space, `DROPBOX_USE_TEAM_ROOT=true`. See [Dropbox](../integrations/dropbox.md). |
| OneDrive for Business | An Azure app registration with application permissions on Microsoft Graph, and the user whose drive to sync. See [OneDrive](../integrations/onedrive.md). |
| Google Drive | A service account with the Drive API enabled, and the folder to sync shared with it. See [Google Drive](../integrations/google-drive.md). |

Exactly one provider is active per instance (`ASSET_UPDATER`).

## System packages for previews

Thumbnails are generated on the server, per file family, by external tools. Without them, files sync but show a placeholder.

| Package | Used for |
|---|---|
| `ffmpeg` (with `ffprobe`) | Video thumbnails and transcoding downloads to MP4 or WebM. |
| `ghostscript` | PDF, EPS and AI previews. |
| `libreoffice` | Office and text document previews (`doc`, `docx`, `xls`, `xlsx`, `ppt`, `pptx`, `odt`, `ods`, `odp`, `rtf`, `txt`, `csv`, `md`, `html`, ...). |
| `imagemagick` | Image conversions that `sharp` does not handle. |
| `coreutils` | Listed in the Dockerfile for the shell helpers the pipeline calls. |

The exact install line from `server/Dockerfile`:

```bash
apt-get install -y ffmpeg ghostscript libreoffice coreutils imagemagick
```

Images (`jpg`, `png`, `gif`, `bmp`, `webp`, `tiff`, `svg`, `psd`) go through `sharp`, which is bundled with the Node dependencies. Fonts (`ttf`, `otf`) are rendered to a specimen thumbnail using ImageMagick `convert`.

## Sizing

- The server keeps the full listing of the cloud storage in memory during each 5-minute sync, and downloads each file once to a temp directory before uploading it to S3. Allow for up to ten concurrent asset downloads, archive source files, converted copies and the finished archive at the same time. The API limit bounds source bytes, not conversion output. Dropbox also buffers `fileBinary` in memory. Measure peak disk and memory with representative files; there is no verified minimum sizing.
- LibreOffice conversions are the heaviest step; a small instance handles them, but expect the first sync of a large library to take hours.
- One API process is enough for most teams. The documented operating topology is one process with `ENABLE_WORKER=true`; see [Worker and scaling](../deployment/worker-and-scaling.md).
