---
title: What is Damvia
description: Damvia adds controlled discovery, presentation and sharing to assets that remain in your cloud storage.
sidebar:
  order: 1
lastUpdated: 2026-09-21
---

Damvia is a self-hosted Digital Asset Management application for organisations that already keep their files in Dropbox, OneDrive or Google Drive. It mirrors selected cloud folders, adds product data and access rules, and presents the result as a searchable library without asking teams to migrate their source files.

This documentation is for people evaluating, installing, configuring and administering Damvia. Everyday how-to articles and onboarding are maintained separately on the public website.

## Cloud storage remains the source of truth

Damvia reads configured folders every five minutes. Adding, renaming, moving or removing a file in the cloud storage changes the corresponding asset in Damvia. Users do not upload source assets through Damvia, and Damvia never writes changes back to a connected source.

An instance can use one source with the simple provider variables, or several sources through `ASSET_SOURCES`. Sources may use different accounts and a mix of Dropbox, OneDrive and Google Drive. Each appears as a top-level folder in the asset tree. See [Integrations](../integrations/index.md) and [Sources](../integrations/sources.md).

Damvia keeps a working copy of originals and previews in S3-compatible storage so that the library can search, preview and package files efficiently. The connected source is still authoritative: changing a source file updates the working copy, and removing it eventually removes its mirrored asset.

## What Damvia adds

- **Search and record data.** Import a CSV catalogue of products, events or any other record, extract its reference from filenames and use selected columns as search terms and filters.
- **Collections.** Mirror a cloud folder as a synchronised collection, or curate a manual collection from files already in the library.
- **Pages and navigation.** Present collections, files, text, pictures and videos in editorial pages and arrange them in a controlled menu.
- **Access control.** Approve accounts and combine roles, regions, groups, collection visibility and file licences.
- **Sharing and downloads.** Invite a guest to a collection and prepare original or converted downloads with expiring links.

[Core concepts](./concepts.md) explains how these parts relate. [Roles and access](./roles-and-access.md) describes the access model.

## What Damvia does not replace

Damvia does not replace the connected cloud storage or its backup. It also does not turn a page upload into a managed asset: collection thumbnails, page media, branding and other editorial uploads live only in Damvia's main bucket.

A recoverable installation therefore backs up PostgreSQL, the main bucket, configuration and secrets together. Asset originals and previews in the assets bucket can be rebuilt only while their cloud sources remain available; prepared download archives are not rebuilt. See [Backups](../deployment/backups.md).

## Who it is for

Damvia fits brand, marketing and product teams that manage a large visual library in shared cloud storage and need controlled access for internal teams, regions and partners. It is especially useful when filenames or catalogue data already identify products and variants.

Before installing, confirm that you can provide a supported cloud account, PostgreSQL, two S3-compatible buckets, SMTP and one server process with the media tools required for previews. Continue with [Requirements](../getting-started/index.md).

## Deployment shape

A production instance contains:

- one Node.js server process for the API, background work and source synchronisation;
- a static Vue client;
- PostgreSQL for application data and the job queue;
- two S3-compatible buckets;
- an SMTP provider;
- one or more configured cloud sources.

The supported topology and setup order are in [Deployment](../deployment/index.md). Contributors can find the implementation overview in [Architecture](../contributing/architecture.md).

## License

Damvia is released under the GNU Affero General Public License v3. If you modify Damvia and let users interact with that modified version over a network, section 13 requires offering those users the corresponding source. Read the repository `LICENSE` for the complete terms.
