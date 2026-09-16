---
title: Contributing
description: Set up a development environment, know the scripts and checks that exist, and submit a change with its license header and its documentation.
sidebar:
  order: 1
lastUpdated: 2026-09-16
---

This page is the entry point for developers who want to change or extend Damvia. It covers the two packages, their scripts and checks, and what a pull request must contain. The other pages of this group describe the code itself: [Architecture](./architecture.md), [Data model](./data-model.md), [tRPC API](./api.md), [Writing a background job](./background-jobs.md) and [Storage drivers](./storage-drivers.md).

## The development environment is the local setup

Follow [Local setup](../getting-started/local-setup.md): `docker-compose up -d` in `server/` for Postgres, MailHog and MinIO, then `npm run dev` in `server/` and in `client/`. Security regression tests use their own disposable PostgreSQL database; keep it separate from development data.

## Two packages, linked by a file dependency

The repository holds two npm packages with their own `package.json` and `node_modules`:

| Package | Stack |
|---|---|
| `server/` | Node, Fastify 5, tRPC 11, TypeORM 0.3, pg-boss 10, MinIO client, winston, zod |
| `client/` | Vue 3, Vite 5, TypeScript, Tailwind 3, shadcn-vue (`components/ui/`), Pinia, TanStack Vue Query, tRPC 10 client |

`client/package.json` declares `"server": "file:../server"`, which makes `client/node_modules/server` a symlink to `../../server`. The client uses it for router types and also some runtime enums: `client/src/services/server.ts` imports `type { AppRouter } from "server/src/trpc"`, and `client/src/stores/downloadStore.ts` imports the `DownloadStatus` and `DownloadType` enums from `server/src/entity/download`. Install both packages before running either type check, or the client's imports do not resolve.

## Scripts

| Package | Script | What it runs |
|---|---|---|
| `server/` | `npm run dev` | `ENABLE_WORKER=true nodemon --exec ts-node src/index.ts`: API, worker and cloud sync in one process, restarted on save |
| `server/` | `npm run build` | `NODE_ENV=production tsc` into `server/dist/` |
| `server/` | `npm run test:security` | Builds the server and runs the database-backed security suite; requires `SECURITY_TEST_DATABASE_URL` pointing to a disposable database ending in `_test` |
| `server/` | `npm start` | `NODE_ENV=production node dist/index.js` |
| `server/` | `npm run cli -- <command>` | `ts-node src/cli.ts`; the only command is `check-integrity`, see [CLI](../reference/cli.md) |
| `server/` | `npm run typeorm` | `typeorm-ts-node-commonjs`, the TypeORM CLI running on the TypeScript sources |
| `client/` | `npm run dev` | `vite`, on port 5173 |
| `client/` | `npm run build` | `vite build` into `client/dist/` |
| `client/` | `npm run preview` | `vite preview` of the built bundle |

## Automated checks and current failures

Application checks and documentation checks are separate. Documentation has source validation, regression tests and a pull-request workflow. The server has a security regression suite and its own CI workflow; there is no ESLint/Prettier configuration. Application commands:

- `cd client && npx vue-tsc --noEmit` type-checks the client, including the `.vue` files and the tRPC procedure types pulled from the server.
- `cd server && npm run build` type-checks and compiles the server.
- `cd server && npm run test:security` runs API, credential, access and migration tests against `SECURITY_TEST_DATABASE_URL`. The suite clears fixture tables and never loads the application’s `.env`. Use a disposable PostgreSQL 15 database. CI provides one automatically.

Run both before opening a pull request and report failures. The client check currently fails; do not describe a Vite build as a passing type check. `server/tsconfig.json` does not enable `strict`; `client/tsconfig.json` does, with `noUnusedLocals` and `noUnusedParameters`.

:::note
The client depends on `@trpc/client` 10 and `@trpc/server` 10, while the server depends on `@trpc/server` 11 (installed: 10.45.0 and 11.1.0). The client only imports the `AppRouter` *type* from the server, and `inferRouterInputs` / `inferRouterOutputs` from its own tRPC 10, so the browser does not import the server router as executable code. The two versions must still agree on request and response formats, and the client must be able to read the server's types. The complete type check has not validated this version gap: it currently fails in `search.vue`. Vite build success is not a type or protocol compatibility check. When testing an upgrade, `RouterInput` and `RouterOutput` in `client/src/services/server.ts` are the first symbols that will fail.
:::

## Submitting a change

1. Branch from `main`.
2. Make the change, keeping the license header and the documentation rule below.
3. Run the two type checks and `scripts/check-docs.sh` (install checker dependencies with `npm ci --prefix scripts`). Run `node --test scripts/docs.test.mjs` for documentation tooling changes.
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
