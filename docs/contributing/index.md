---
title: Contributing
description: Set up a development environment, know the scripts and checks that exist, and submit a change with its license header and its documentation.
sidebar:
  order: 1
lastUpdated: 2026-09-30
---

This page is the entry point for developers who want to change or extend Damvia. It covers the application packages, their scripts and checks, and what a pull request must contain. The other pages of this group describe the code itself: [Architecture](./architecture.md), [Data model](./data-model.md), [tRPC API](./api.md), [Writing a background job](./background-jobs.md), [Storage drivers](./storage-drivers.md), [Modules](./modules.md) and the proposed [Design system](./design-system.md).

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
| `server/` | `npm test` | Cleans `server/dist/`, builds the server and runs every suite in `server/test/*.cjs` one file at a time against `SECURITY_TEST_DATABASE_URL`, a disposable database whose name ends in `_test` |
| `server/` | `npm run test:security` | Same build, the security-related suites only: `security`, `auth`, `auth-invariants`, `access`, `catalogue-access`, `record-picture-access`, `audit`, `privacy`, `credentials` |
| `server/` | `npm start` | `NODE_ENV=production node dist/index.js` |
| `server/` | `npm run cli -- <command>` | Maintenance CLI; see [CLI](../reference/cli.md) for the current commands and their data effects |
| `server/` | `npm run typeorm` | `typeorm-ts-node-commonjs`, the TypeORM CLI running on the TypeScript sources |
| `client/` | `npm run dev` | `vite`, on port 5173 |
| `client/` | `npm run build` | `vite build` into `client/dist/` |
| `server/` | `node test/bench/catalogue.cjs` | Seeds a catalogue of `RECORDS` products with three files each and reports the timing of every reader-facing query. Not part of `npm test`; recreate the `_test` database first |
| `client/` | `npm run typecheck` | `vue-tsc --noEmit` over `src/`, `test/unit/` and the module fixture in `test/fixtures/`, then over `test/ui/` and `playwright.config.ts` with `tsconfig.playwright.json`; needs `npm run build` in `server/` first |
| `client/` | `npm run ui:check` | Type check of the shadcn-vue components and the design preview with `tsconfig.ui.json` |
| `client/` | `npm test` | Vitest over `client/test/unit/**/*.test.ts`; `npm run test:watch` keeps it running |
| `client/` | `npm run test:ui` | Playwright over `client/test/ui/*.spec.ts` in Chromium, against a Vite server it starts on port 5176; `modules.spec.ts` runs against a second one on port 5177, built with the module in `client/test/fixtures/module-hello`. Set `UI_SHOTS=1` to also write screenshots |
| `client/` | `npm run preview` | `vite preview` of the built bundle |
| `client/` | `npm run design:dev` | Isolated design proposal on port 5174 at `/design-system.html` |
| `client/` | `npm run design:check` | Strict type check of the isolated design proposal |
| `client/` | `npm run design:build` | Token freshness check and standalone static preview build |

## Automated checks

`.github/workflows/ci.yml` runs on every pull request and on pushes to `main`. Its five jobs are meant to be required status checks on `main`; enable that in the repository settings under branch protection.

| Job | What it runs |
|---|---|
| `server` | `npm ci` and `npm test` in `server/` against a `postgres:15` service |
| `client` | `npm ci` and `npm run build` in `server/`, then `npm ci`, `npm run typecheck`, `npm run ui:check`, `npm test` and `npm run build` in `client/` |
| `ui` | Builds the server types, installs Chromium (cached) and runs the whole Playwright suite with `npm run test:ui`, including `accessibility.spec.ts`: axe-core WCAG 2.1 A and AA rules on 13 desktop and phone screens |
| `dependencies` | `npm audit --omit=dev --audit-level=high` in `server/` and `client/`: fails on a known high or critical vulnerability in production dependencies |
| `docs` | `node --test scripts/docs.test.mjs`, `scripts/check-docs.sh` and `scripts/check-license-headers.sh` |

`.github/workflows/codeql.yml` runs CodeQL (`security-extended` queries) on pull requests, on `main` and weekly; findings appear under the repository's Security tab. `.github/workflows/release.yml` attaches CycloneDX SBOMs of the server and client production dependencies to every published GitHub release. `.github/dependabot.yml` opens update pull requests for npm (weekly, minor and patch grouped), GitHub Actions and the Docker base image (monthly). Every action is pinned to a commit SHA with its version in a comment; Dependabot keeps the pins current. See [`SECURITY.md`](https://github.com/damviaHQ/damvia/blob/main/SECURITY.md) for how vulnerabilities are reported and handled.

Run the same commands before opening a pull request. There is no ESLint or Prettier configuration. `server/tsconfig.json` enables `strictNullChecks` but not the rest of `strict`; nullable entity columns therefore declare an explicit column `type`, because TypeORM cannot infer one from a `string | null` property. `client/tsconfig.json` is fully `strict`, with `noUnusedLocals` and `noUnusedParameters`. Both type checks must pass with zero errors.

### Server suites

`server/test/*.cjs` are `node:test` files that require the compiled `dist/` output, so every run starts with a clean build. There is one file per feature; a new test goes in the file of the area it covers, and a regression test for a security finding keeps the finding ID at the start of its name (`A5: ...`). `server/test/lib/helpers.cjs` holds the shared setup: it refuses any `SECURITY_TEST_DATABASE_URL` whose database name does not end in `_test`, never loads `server/.env`, replaces the S3 clients, the cloud driver, the mail transport and the pg-boss queues with in-memory stubs, and exposes `setup()` and `teardown()` for each suite's `before` and `after` hooks, the shared factories (`makeType`, `makeRecord`, `typedFolder`, `fileRow`, `productId` and the collection helpers) and a `waitFor()` poll to use instead of fixed sleeps. `test/lib/drivers.cjs` holds the cloud listing builders and `test/lib/offline.cjs` loads the environment for suites that need no database.

`setup()` reads the newest migration and the number of upgrade migrations from `dist/migrations`, undoes those migrations, seeds legacy rows, re-runs them and creates the fixture users, so adding a migration needs no change to the harness. All suites share one database, which is why `npm test` passes `--test-concurrency=1`. Because every suite undoes and re-applies the upgrade migrations, the columns they add and drop pile up in the PostgreSQL catalogue; the harness drops and recreates the `_test` database when a table passes 1,400 columns, which needs a test user allowed to create databases. Otherwise, when a run fails with `tables can have at most 1600 columns`, recreate the database by hand.

| File | Covers |
|---|---|
| **Authentication and access** | |
| `auth.cjs` | Session cookies, idle and absolute expiry, lockout, email sign-in links, legacy JWT exchange, two-step verification and recovery codes, password policy and resets, security headers and CSRF, single sign-on (OIDC) and `OIDC_ONLY`, listing and ending sessions |
| `auth-invariants.cjs` | Walks every tRPC procedure: everything outside a short public allowlist must reject an anonymous caller, and an unverified account may reach only the account-management procedures |
| `credentials.cjs` | Salted password hashing, legacy unsalted hashes refused, reset-token hashing, `APP_SECRET` validation; needs no database |
| `access.cjs` | The visibility matrix of `userCollectionsQuery` and `userCollectionFilesQuery` for every role and collection state, guest restrictions |
| `security.cjs` | Cross-cutting regressions: upgrade repairs, manager limits on elevated accounts, inherited restrictions under concurrency, licence dates and regions, credentials kept out of logs, export failures and retries |
| `audit.cjs` | The append-only audit log: what is recorded, secrets redacted, access denials, retention, filtered and formula-safe exports |
| `privacy.cjs` | Personal data export, account deletion with anonymised history, search logging modes, the privacy page |
| `trpc-error-format.cjs` | The HTTP error shape, `fieldErrors` on validation errors |
| **Users and administration** | |
| `users.cjs` | Sign-up approval and default groups, password-less mode, invited guests, profile edits, reading accounts by role, verification mails and their job |
| `groups.cjs` | Group management rights, the default group, merges and refused removals |
| `regions.cjs` | Region management, user and licence counts, moving users, the last region |
| `licenses.cjs` | Licence management, sanitised terms, updates, removal freeing folders and files |
| `license-expiry.cjs` | The 30, 7 and 1 day licence notices |
| `authorized-domains.cjs` | Authorised domains and the automatic approval they grant |
| `branding.cjs` | Host and client branding, logo validation and SVG rasterising, the sign-in background |
| `dashboard.cjs` | Dashboard access and number-only values |
| `analytics.cjs` | Insights access, search demand, audiences and reports |
| `storage-quota.cjs` | `STORAGE_QUOTA`: pending files, reservations, alerts, maintenance contact, measure and retry guards |
| `integrity-check.cjs` | The nightly integrity check: orphan objects, changed checksums, missing or mis-sized copies, recounts |
| `env.cjs`, `logging.cjs` | `STORAGE_QUOTA` parsing, `*_FILE` secrets, insecure-transport warning, error logging; need no database |
| **Collections** | |
| `collection-tree.cjs` | The reader and admin trees, private collections, latest files, removing files from a hand-made collection |
| `collection-nesting.cjs` | Folder renames and moves, custom children, deletions, the upgrade merge, manual moves, inherited restrictions (A1) |
| `collection-rename.cjs` | Renaming without propagating visibility |
| `collection-invitations.cjs` | Removing and listing invitations |
| `collection-action-bar.cjs` | Action bar rules per role, group and user, inheritance, colleague picker (B15) |
| `collection-favorites.cjs` | Collection favourites and their migration |
| `menu-sections.cjs` | Menu sections, placement of root collections, moves between sections |
| `pages.cjs`, `page-blocks.cjs`, `page-migration.cjs` | Collection pages, block schemas and sanitising, uploads and garbage collection, the layout migration |
| `search.cjs` | Token and exact search, filters, scope, pagination, search events (A6, B3) |
| **Downloads** | |
| `download.cjs` | Single-file and archive downloads, conversions, access refusals, size and export limits (A5), licence acceptance (A9), suspended owners (A8), expiry job, ready mail |
| `download-selection.cjs` | Record selections and exports with their access checks |
| `download-spreadsheet.cjs` | CSV and XLSX export content; needs no database |
| **Catalogue and records** | |
| `records.cjs` | Records, fields, tables, history, imports and exports, the records upgrade |
| `catalogue-access.cjs` | What a reader sees of the catalogue through collections, facets, related records |
| `product-collections.cjs` | Product membership by hand, by rule and by reference list, catalogue collections |
| `record-picture-access.cjs` | Pictures published through record collections and their restrictions |
| `families.cjs` | Product families and their grouping key |
| `readiness.cjs` | The readiness score and its effects |
| `entity-resolution.cjs` | Matching files to records: rules, merge, links by hand, the upgrade from `PRODUCT_MATCHING_REGEX`, folder search and preview |
| `record-links-other-types.cjs` | Linking any asset type with rules, while only product pictures give visuals, views and access |
| `catalogue-file-records.cjs` | The products and ranges a file shows in the download dialog |
| `asset-type-rules.cjs` | Folder rules for asset types |
| `variant-grouping.cjs` | Variant grouping, axes and collapsed search |
| `enrichment-overview.cjs` | Enrichment passes, the last-pass overview and the menu badges |
| `file-metadata.cjs`, `xmp.cjs` | IPTC, EXIF and XMP parsing, metadata fields and search, CSV mappings, the metadata extraction job |
| **Cloud sync** | |
| `sync.cjs` | Folder and file upserts, inheritance, folder deletion, `synchronizeCollection`, conversions without a shell (B2), oversized images |
| `sources.cjs`, `asset-sources.cjs` | `ASSET_SOURCES` parsing, several sources in one library, `list-sources`, `rename-source`, `remove-source` |
| `dropbox.cjs`, `dropbox-sync.cjs` | The Dropbox listing plan and one full sync with a stubbed SDK |
| `google-drive.cjs`, `google-drive-sync.cjs` | The Google Drive listing plan and one full sync with a stubbed client |
| `onedrive.cjs`, `onedrive-sync.cjs` | The OneDrive listing plan and one production-shaped sync. These suites lock the guarantees in [OneDrive](../integrations/onedrive.md); change them only for a confirmed critical bug or a security hazard |
| `pgboss-legacy.cjs` | Retiring a pg-boss 10 schema at boot |

### Client suites

`client/test/unit/**/*.test.ts` run with Vitest in a Node environment; files under `client/test/unit/dom/` run in happy-dom because they need `window`, `localStorage`, Pinia or a mounted component. Put pure logic tests under `test/unit/utils/`, `lib/`, `components/` or `page-renderer/`, and the rest under `test/unit/dom/`, mirroring the `src/` folder.

The Playwright specs in `client/test/ui/` run against the real client screens with the whole backend faked. Every spec imports `test` and `expect` from `test/ui/lib/trpc.ts`, whose fixture:

- answers each tRPC call from `test/ui/lib/fixtures.ts` (the sample library) merged with the overrides the spec passes to `mockTrpc(overrides, { role })`;
- records every call so a spec can assert its input (`calls`, `inputs`, `last`, `count`) and wait for the API to go quiet (`settled()`);
- offers `unauthorized`, `forbidden`, `conflict` and `serverError` answers;
- fails the test when the page calls a procedure that has no mock, or throws an uncaught error.

A new screen therefore needs its procedures added to the fixtures, not a running server. The records screens use `test/ui/lib/records.ts`. `shot()` writes a screenshot only when `UI_SHOTS=1`. On CI, `.only` is refused and a failing test is retried once with a trace.

`server/test/bench/catalogue.cjs` is a measurement rather than a suite: it seeds a catalogue at a realistic size and prints the median timing of each reader-facing query, which is how the shape of the catalogue queries and the cost of the membership triggers were settled. On 20,000 products and 60,000 files, the first page, its facets and a product page each measure under 100 ms, and writing the whole membership of a rule-driven collection measures around 0.13 s.

## Submitting a change

1. Branch from `main`.
2. Make the change, keeping the license header and the documentation rule below.
3. Run `npm test` in `server/`, then `npm run typecheck`, `npm run ui:check`, `npm test`, `npm run test:ui` and `npm run build` in `client/`, `scripts/check-license-headers.sh` and `scripts/check-docs.sh` (install checker dependencies with `npm ci --prefix scripts`). Run `node --test scripts/docs.test.mjs` for documentation tooling changes.
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

`.vue` single-file components carry the same text as an HTML comment (`<!-- ... -->`) placed before the `<script setup>` tag; see `client/src/app.vue`. The shadcn-vue files generated under `client/src/components/ui/` do not carry it. Every other source and test file does, and `scripts/check-license-headers.sh` fails on any file that lacks it.

## Documentation changes ship in the same pull request

`docs/` is the source of the public documentation site. When a change alters behaviour that a page describes, update that page in the same pull request and set its `lastUpdated` to the day you checked it. The contract for the pages (frontmatter, style, folder layout) and the list of triggers that always require a doc edit are in the `docs/README.md` file in the repository; `docs/_internal/page-map.md` maps code areas to pages. Adding an environment variable means touching the code, `server/.env.template` or `client/.env.template`, and [Environment variables](../reference/environment-variables.md); adding a queue means updating [Background jobs](../reference/background-jobs.md). `scripts/check-docs.sh` catches the forgotten ones.
