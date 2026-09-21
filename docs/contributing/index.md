---
title: Contributing
description: Set up a development environment, know the scripts and checks that exist, and submit a change with its license header and its documentation.
sidebar:
  order: 1
lastUpdated: 2026-09-21
---

This page is the entry point for developers who want to change or extend Damvia. It covers the application packages, their scripts and checks, and what a pull request must contain. The other pages of this group describe the code itself: [Architecture](./architecture.md), [Data model](./data-model.md), [tRPC API](./api.md), [Writing a background job](./background-jobs.md) [Storage drivers](./storage-drivers.md) and the proposed [Design system](./design-system.md).

## The development environment is the local setup

Follow [Local setup](../getting-started/local-setup.md): `docker-compose up -d` in `server/` for Postgres, MailHog and MinIO, then `npm run dev` in `server/` and in `client/`. The server test suites use their own disposable PostgreSQL database; keep it separate from development data.

## Application packages and shared foundations

The two application packages have their own `package.json` and `node_modules`. A separate foundation package holds the proposed shared design tokens and styles:

| Package | Stack |
|---|---|
| `server/` | Node 22.12+, Fastify 5, tRPC 11, TypeORM 1, pg-boss 12, MinIO client 8, winston, zod 4 |
| `packages/design-system/` | Framework-independent design tokens, CSS and self-hosted font; proposal only |
| `client/` | Vue 3, Vite 8, TypeScript, Tailwind 4, shadcn-vue (`components/ui/`), Pinia, TanStack Vue Query, tRPC 11 client, Vitest |

`client/package.json` declares `"server": "file:../server"`, which makes `client/node_modules/server` a symlink to `../../server`. The client only imports types from it: `client/src/services/server.ts` imports `type { AppRouter } from "server/src/trpc"`, and `client/src/stores/downloadStore.ts` imports the `DownloadStatus` and `DownloadType` types from `server/src/entity/download`. The client type check reads those types from the declaration files that `npm run build` in `server/` writes to `server/dist/` (`client/tsconfig.json` maps `server/src/*` to `../server/dist/*`), so build the server before running `vue-tsc`.

## Scripts

| Package | Script | What it runs |
|---|---|---|
| `server/` | `npm run dev` | `ENABLE_WORKER=true nodemon --exec ts-node src/index.ts`: API, worker and cloud sync in one process, restarted on save |
| `server/` | `npm run build` | `NODE_ENV=production tsc` into `server/dist/`, then the type declarations the client reads |
| `server/` | `npm test` | Builds the server and runs every suite in `server/test/*.cjs` one file at a time against `SECURITY_TEST_DATABASE_URL`, a disposable database whose name ends in `_test` |
| `server/` | `npm run test:security` | Same build, security suite only |
| `server/` | `npm start` | `NODE_ENV=production node dist/index.js` |
| `server/` | `npm run cli -- <command>` | Maintenance CLI; see [CLI](../reference/cli.md) for the current commands and their data effects |
| `server/` | `npm run typeorm` | `typeorm-ts-node-commonjs`, the TypeORM CLI running on the TypeScript sources |
| `client/` | `npm run dev` | `vite`, on port 5173 |
| `client/` | `npm run build` | `vite build` into `client/dist/` |
| `client/` | `npm run typecheck` | `vue-tsc --noEmit` over `src/` and `test/unit/`; needs `npm run build` in `server/` first |
| `client/` | `npm test` | Vitest over `client/test/unit/**/*.test.ts`; `npm run test:watch` keeps it running |
| `client/` | `npm run preview` | `vite preview` of the built bundle |
| `client/` | `npm run design:dev` | Isolated design proposal on port 5174 at `/design-system.html` |
| `client/` | `npm run design:check` | Strict type check of the isolated design proposal |
| `client/` | `npm run design:build` | Token freshness check and standalone static preview build |

## Automated checks

One GitHub Actions workflow, `.github/workflows/ci.yml`, runs on every pull request and on pushes to `main`. Its three jobs are meant to be required status checks on `main`; enable that in the repository settings under branch protection.

| Job | What it runs |
|---|---|
| `server` | `npm ci` and `npm test` in `server/` against a `postgres:15` service |
| `client` | `npm ci` and `npm run build` in `server/`, then `npm ci`, `npm run typecheck`, `npm test` and `npm run build` in `client/` |
| `docs` | `node --test scripts/docs.test.mjs` and `scripts/check-docs.sh` |

Run the same commands before opening a pull request. There is no ESLint or Prettier configuration. `server/tsconfig.json` enables `strictNullChecks` but not the rest of `strict`; nullable entity columns therefore declare an explicit column `type`, because TypeORM cannot infer one from a `string | null` property. `client/tsconfig.json` is fully `strict`, with `noUnusedLocals` and `noUnusedParameters`. Both type checks must pass with zero errors.

### Server suites

`server/test/*.cjs` are `node:test` files that require the compiled `dist/` output, so every run starts with a build. `server/test/lib/helpers.cjs` holds the shared setup: it refuses any `SECURITY_TEST_DATABASE_URL` whose database name does not end in `_test`, never loads `server/.env`, replaces the S3 clients, the cloud driver, the mail transport and the pg-boss queues with in-memory stubs, and exposes `setup()` and `teardown()` for each suite's `before` and `after` hooks. `setup()` asserts the newest migration name, undoes the last upgrade migrations, seeds legacy rows, re-runs the migrations and creates the fixture users; when you add a migration, update `LATEST_MIGRATION` and `UPGRADE_MIGRATIONS` in the helper. All suites share one database, which is why `npm test` passes `--test-concurrency=1`. Because every suite undoes and re-applies the upgrade migrations, the columns they add and drop pile up in the PostgreSQL catalogue; when a run fails with `tables can have at most 1600 columns`, drop and recreate the `_test` database.

| File | Covers |
|---|---|
| `pure.cjs` | Password hashing, reset-token hashing, `APP_SECRET` validation, `STORAGE_QUOTA` parsing, byte formatting, download file names; needs no database |
| `auth-invariants.cjs` | Walks every tRPC procedure: everything outside a short public allowlist must reject an anonymous caller, and an unverified account may reach only the account-management procedures |
| `access.cjs` | The visibility matrix of `userCollectionsQuery` and `userCollectionFilesQuery` for every role and collection state, and that both builders agree |
| `sync.cjs` | Folder and file upserts, inheritance of licence and asset type, queued synchronisations, folder deletion, `synchronizeCollection` |
| `dropbox.cjs` | The Dropbox listing to upsert plan: pointed folder as the top row, parent by path, `content_hash` checksum, hidden paths and empty folders skipped, a synthetic `Dropbox` root when no path is pointed at; needs no database |
| `dropbox-sync.cjs` | A library run through one Dropbox sync with a stubbed SDK: nothing changed on an identical listing, `DROPBOX_ROOT_PATH`, one token refresh on `401`, empty listings, failed items, download errors. Same change policy as the OneDrive suites |
| `google-drive.cjs` | The Google Drive listing to upsert plan: pointed folder as the top row, parents by id, `md5Checksum` checksum, Google-native documents, shortcuts, hidden and empty items skipped; needs no database |
| `google-drive-sync.cjs` | A library run through one Google Drive sync with a stubbed client: nothing changed on an identical listing, folder-by-folder pagination, empty listings, failed items, download errors. Same change policy as the other driver suites |
| `sources.cjs` | `ASSET_SOURCES` parsing: keys, labels, accounts, the legacy single-provider form, and the refusal of overlapping roots on one account; needs no database |
| `asset-sources.cjs` | Several sources in one library, and the per-source status the dashboard shows (`asset_sources`): a source's sweep never touches another's rows, provider ids scoped per source, labels and same-name refusal, adoption of rows from before sources existed, the stale keys that stop the server, `list-sources`, `rename-source`, `remove-source`. Same change policy as the driver suites |
| `onedrive.cjs` | The OneDrive listing to upsert plan: root kept as the top folder, parent ids preserved, `eTag` checksum, skipped item kinds, parents-first order; needs no database |
| `onedrive-sync.cjs` | A production-shaped OneDrive library run through one sync with a stubbed Graph client: nothing re-parented, re-downloaded or deleted; guards for empty listings, failed items, startup and download errors. These two suites lock the guarantees in [OneDrive](../integrations/onedrive.md); change them only for a confirmed critical bug or a security hazard |
| `matching.cjs` | The record matching cron as it behaves today: capture groups for key and view, files without a match left alone, an unknown key erasing an earlier link, no-op without the regex |
| `asset-type-rules.cjs` | Folder rules: pattern guard, the pure resolution (deepest start wins, ties, hand-set anchors), the post-sync pass (paths, moves, idempotence, invalid rules skipped, scoped re-apply), the router and its admin-only access |
| `entity-resolution.cjs` | Matching: the file name step against the old job, folder steps, attachments, the merge rules (agreement, conflict, range, primary order, dangling), the pass (idempotence, re-attach after import, moves), the matching and unmatched routers, search deduplication and range results, the upgrade seed, admin-only access |
| `file-metadata.cjs` | IPTC and EXIF parsing, a real JPEG, fields created switched off, trusted metadata linking, metadata search, facets and date ranges, the CSV mapping compare and replace, the views setting, admin-only access |
| `variant-grouping.cjs` | The tokenizer, grouping (banners and teasers, SKUs apart, short prefixes, the pinned short-prefix collision, grids of formats), covers, overrides, 5,000 names within a second, recognizers and axis reuse, the pass (stable ids, nothing written twice, dissolved groups, orphan axes), collapsed search and axis filters with visibility, the admin actions and access |
| `enrichment-overview.cjs` | The record of each pass, its error and the 50 kept, the overview counts, Run now queued behind a running pass, the menu badges, admin-only access |
| `search.cjs` | Token and exact search, attribute, scope, file type and asset type filters, pagination, search activity events, `searchNotFound` |
| `download.cjs` | Single-file and archive downloads, entry names, access refusals |
| `users.cjs` | Sign-up approval and default groups, password-less mode, session tokens |
| `security.cjs` | The original regression suite: upgrades, credentials, roles, invitations, licences, exports, storage quota, alerts, branding, insights |

### Client suites

`client/test/unit/**/*.test.ts` run with Vitest in a Node environment; files under `client/test/unit/dom/` run in happy-dom for the Pinia store and the composables. They cover the pure helpers in `client/src/utils/` and `client/src/lib/`, `extractErrors`, the navigation guard in `client/src/router/guard.ts`, the global store and the toast composable. Playwright specs in `client/test/ui/` (`npm run test:ui`) exercise the isolated design preview and are not part of CI.

## Submitting a change

1. Branch from `main`.
2. Make the change, keeping the license header and the documentation rule below.
3. Run `npm test` in `server/`, then `npm run typecheck`, `npm test` and `npm run build` in `client/`, and `scripts/check-docs.sh` (install checker dependencies with `npm ci --prefix scripts`). Run `node --test scripts/docs.test.mjs` for documentation tooling changes.
4. Open a pull request against `main` on [github.com/damviaHQ/damvia](https://github.com/damviaHQ/damvia).

## Every source file starts with the AGPL header

Damvia is licensed under the GNU AGPL v3. Hand-written `.ts` files start with this exact block, before any import:

```ts
/* Damvia - Open Source Digital Asset Manager
Copyright (C) 2024  Arnaud DE SAINT JEAN
This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <https://www.gnu.org/licenses/>. */
```

`.vue` single-file components carry the same text as an HTML comment (`<!-- ... -->`) placed before the `<script setup>` tag; see `client/src/app.vue`. The shadcn-vue files generated under `client/src/components/ui/` do not carry it, and a few recent files were added without it. New files you write get the header.

## Documentation changes ship in the same pull request

`docs/` is the source of the public documentation site. When a change alters behaviour that a page describes, update that page in the same pull request and set its `lastUpdated` to the day you checked it. The contract for the pages (frontmatter, style, folder layout) and the list of triggers that always require a doc edit are in the `docs/README.md` file in the repository; `docs/_internal/page-map.md` maps code areas to pages. Adding an environment variable means touching the code, `server/.env.template` or `client/.env.template`, and [Environment variables](../reference/environment-variables.md); adding a queue means updating [Background jobs](../reference/background-jobs.md). `scripts/check-docs.sh` catches the forgotten ones.
