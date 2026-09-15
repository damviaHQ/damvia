---
title: What is Damvia
description: Damvia is a self-hosted Digital Asset Management layer that sits on top of your Dropbox or OneDrive and adds access control, collections, pages and product search.
sidebar:
  order: 1
lastUpdated: 2026-09-15
---

This page explains what Damvia does, who it is built for, what it deliberately does not do, and what it is made of. Read it before [Getting started](../getting-started/index.md) to decide whether it fits your setup.

## Cloud storage stays the source of truth

Damvia is a Digital Asset Management (DAM) application that works on top of a cloud storage you already have. It never becomes the place where files live. The supported backends, selected with `ASSET_UPDATER`, are:

| Backend | Value | Notes |
| --- | --- | --- |
| Dropbox | `dropbox` | Lists the app's root folder recursively. Set `DROPBOX_USE_TEAM_ROOT=true` to sync a Dropbox Business team space instead of the member's home folder. |
| OneDrive for Business | `onedrive` | Uses the Microsoft Graph delta endpoint for the drive set in `ONEDRIVE_USER` and `ONEDRIVE_DRIVE`. |

Every 5 minutes the server walks the storage and mirrors its folder tree into Postgres as asset folders and asset files. Entries whose name starts with `.` are skipped (OneDrive also skips empty files). A folder or file that disappeared from the listing is marked `pending_deletion` and removed by the `asset/process-deletion` job, which runs every minute.

For each new file, and each file the daily integrity check re-queues, the `asset/update-content` queue downloads the original into Damvia's own assets bucket and generates a WebP thumbnail. Thumbnails are produced for:

| Kind | Extensions | Tool |
| --- | --- | --- |
| Images | `jpg` `jpeg` `png` `gif` `bmp` `webp` `tiff` `tif` `svg` `psd` | sharp, with ImageMagick for the formats sharp cannot read |
| Videos | `mp4` `mov` `avi` `mkv` `wmv` `flv` `webm` `m4v` | ffmpeg |
| PDF and vector | `pdf` `eps` `ai` | Ghostscript |
| Office and text | `doc` `docx` `xls` `xlsx` `ppt` `pptx` `odt` `ods` `odp` `rtf` `pps` `ppsx` `potx` `pot` `html` `htm` `xml` `json` `md` `yaml` `yml` `txt` `css` `js` `ts` `csv` | LibreOffice |
| Fonts | `ttf` `otf` | ImageMagick sample text |

Files of other types are still mirrored and downloadable, they simply have no preview.

## What Damvia adds on top

- Access control: four roles, account approval, regions, groups, licenses and time-limited guest invitations. See [Roles and access](./roles-and-access.md).
- Collections: a tree of curated sets of files. A collection can be bound to an asset folder so its content follows the storage automatically, or be assembled by hand.
- Pages: editorial pages built from blocks (collections, files, latest files, text, image, video) and a configurable menu.
- Search: full-text search on file names and on product attributes, with facets on asset types, product views, file kinds and any attribute flagged as facetable.
- PIM linking: products are imported from CSV, and `PRODUCT_MATCHING_REGEX` extracts a product key and a product view from each file name so files are linked to products automatically every 5 minutes.

The domain model is described in [Core concepts](./concepts.md).

## Who it is for

Damvia is designed for brand and marketing teams that hold product imagery, videos and documents in a shared drive and need to distribute them to internal users, regional teams and partners. Regions and licenses let an administrator decide which markets may use which assets, and invitations let any collection owner share a collection with an outside guest for a limited time without giving that guest access to anything else.

## What Damvia is not

Damvia is not an upload tool. Users do not upload assets in the browser: assets arrive by adding files to the cloud storage, and they disappear by removing them there. The only in-app uploads are the collection thumbnail, images and videos placed in page blocks, and the login background image, all of which go to the main bucket rather than the assets bucket.

Because the storage keeps every original, the README only asks you to back up the database. The assets bucket can be rebuilt from the cloud storage.

## Tech stack

| Layer | Technology |
| --- | --- |
| Client | Vue 3, Vite, Tailwind CSS, tRPC client |
| Server | Node.js, Fastify 5, tRPC 11 |
| Database | PostgreSQL 15 with TypeORM |
| Background jobs | pg-boss (runs in the same process when `ENABLE_WORKER=true`) |
| Object storage | Two S3-compatible buckets, MinIO by default (`MAIN_S3_URL`, `ASSETS_S3_URL`) |
| Email | Any SMTP provider via nodemailer (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`) |
| Media tooling | sharp, ffmpeg, LibreOffice, Ghostscript, ImageMagick |

The `docker-compose.yml` in `server/` starts Postgres, MinIO and MailHog for local development.

## License

Damvia is released under the GNU Affero General Public License v3 (see `LICENSE` at the repository root). For a self-hoster this means that if you modify Damvia and let users interact with it over a network, you must make the source code of your modified version available to those users.

:::note
Running an unmodified copy of Damvia for your own organisation does not require you to publish anything. The source-offer obligation only applies to modified versions.
:::

Next: [Core concepts](./concepts.md), [Roles and access](./roles-and-access.md), [Getting started](../getting-started/index.md).
