---
title: Architecture
description: The single server process, the path of a request from the Vue client to a TypeORM entity, the folder map of both packages, and where a new feature goes.
sidebar:
  order: 2
lastUpdated: 2026-09-21
---

This page gives a developer the shape of the code: what runs, how a request travels, what each folder holds, and where to add something. The meaning of the objects (collections, pages, products) is in [Core concepts](../introduction/concepts.md).

## One Node process does four things

`server/src/index.ts` launches the sync task without awaiting it, then awaits the remaining startup steps:

1. The cloud sync: `assetUpdater().initialize()`, then a `fetchUpdates()` loop re-armed with `setTimeout` every 5 minutes. After every listing it inserts the missing `collection_files` rows for synchronised collections. This loop is **not** a pg-boss job and runs in every API process.
2. `dataSource.initialize()`: TypeORM connects and, because `migrationsRun: true`, applies pending migrations.
3. `startQueues()` from `server/src/worker.ts`: pg-boss connects to the same `DATABASE_URL` and creates every queue, so the API can queue jobs. Only if `ENABLE_WORKER=true` does it also register the cron schedules and the job handlers.
4. The Fastify server from `server/src/server.ts`, listening on `0.0.0.0` and `PORT` (default `3000`).

Any failure in steps 2 to 4 logs the error and exits with code 1. Sync initialisation failure also exits; sync-pass failures are logged and retried after five minutes. The first pass can reach the database/queues before they are ready. See [Worker and scaling](../deployment/worker-and-scaling.md) for the current single-process constraint.

## Fastify exposes tRPC and one REST route

`server/src/server.ts` builds Fastify with `maxParamLength: 5000` (path parameters, not the tRPC input query string) and `bodyLimit: 5242880`, registers `@fastify/cors` with defaults, and mounts `fastifyTRPCPlugin` under the prefix `/trpc` with `appRouter` and `createContext`. Its `onError` hook logs every procedure error as `http.request` with the procedure `path`, error `code`, `requestId` and `userId`: at `warn` level for client errors (`UNAUTHORIZED`, `NOT_FOUND`, `BAD_REQUEST` and the other 4xx codes), at `error` level for `INTERNAL_SERVER_ERROR`, which also carries the `name`, `code` and `message` of its cause. It excludes request bodies, query parameters and raw error objects.

The only non-tRPC route is `GET /v1/downloads/:downloadId`: it loads the `Download`, redirects to `APP_URL/link-expired` when the row is missing or `expiresAt` is past, and otherwise redirects to a presigned URL of `downloads/{id}` in the assets bucket.

## A request travels client → tRPC → router → service → entity

| Step | File | What happens |
|---|---|---|
| 1 | `client/src/services/server.ts` | `createTRPCProxyClient<AppRouter>` with one `httpLink` to `VITE_API_ENDPOINT` (default `http://localhost:3000/trpc`). The `headers()` callback sends `authorization: <JWT>` from the Pinia store or the `dam_token` cookie, with no `Bearer` prefix. |
| 2 | `server/src/server.ts` | Fastify hands `/trpc/*` to the tRPC adapter. |
| 3 | `server/src/trpc/index.ts` | `createContext` calls `getUserFromRequest(req)` (`services/user.ts`), which verifies the header as a JWT signed with `APP_SECRET` and loads the `User`; `ctx.user` is `null` otherwise. `authMiddleware(...predicates)` throws `UNAUTHORIZED` unless a user exists and every predicate passes. The `errorFormatter` turns a zod failure into `message: 'Invalid request.'` plus `data.fieldErrors`. |
| 4 | `server/src/trpc/router/*.ts` | One file per domain, merged in `router/index.ts` into `appRouter`. Procedures validate input with zod and usually query TypeORM directly. |
| 5 | `server/src/services/*.ts` | Logic shared by several procedures or by jobs: `userCollectionsQuery` and `userCollectionFilesQuery` (the access filters), `upsertFolder` / `upsertFile`, `createDownloadArchive`, mail senders, thumbnails. |
| 6 | `server/src/entity/*.ts` | TypeORM entities, one per table. See [Data model](./data-model.md). |

Details of the procedures, predicates and error shape are in [tRPC API](./api.md).

## Folder map of `server/src`

| Folder or file | Holds |
|---|---|
| `index.ts` | Process startup described above |
| `server.ts` | Fastify instance, CORS, tRPC plugin, `/v1/downloads/:downloadId` |
| `env.ts` | `logger` (winston, console transport, `timestamp` + `splat` + error details + `simple` format), `dataSource`, S3 clients, mail transporter, `assetUpdater()` selection, `mailConfig()` |
| `worker.ts` | pg-boss instance, `createQueue` helper, every queue definition |
| `cli.ts` | `commander` program with the `check-integrity` command |
| `asset-updater/` | `base.ts` abstract driver, `dropbox.ts`, `one-drive.ts`; see [Storage drivers](./storage-drivers.md) |
| `entity/` | 19 TypeORM entities and their enums |
| `migrations/` | Hand-written SQL migrations, run at startup |
| `services/` | `asset.ts` (upsert, deletion, thumbnails, product matching), `collection.ts` (access queries, synchronisation, duplication), `download.ts` (archives, format conversion, expiry), `image-processor.ts` (sharp, ffmpeg, LibreOffice, Ghostscript thumbnails), `mailer.ts` (one sender per template), `page.ts` (page and block helpers), `system.ts` (integrity check), `user.ts` (create, guest, JWT, removal), `credentials.ts` (password hashing, reset-token hashing, signing-secret validation) |
| `trpc/index.ts` | tRPC init, context, `authMiddleware` and the four predicates |
| `trpc/router/` | 15 domain routers plus `collection/invitation.ts`, merged in `index.ts` with the public `env` query |
| `util/array.ts` | `compact()` |

## Folder map of `client/src`

| Folder or file | Holds |
|---|---|
| `main.ts` | Creates the app with `VueQueryPlugin` (`refetchOnWindowFocus: false`), `vue3-lazyload`, the router and Pinia |
| `app.vue` | Root component: shows a loader while the user loads, `LayoutAuth` with the "verify your email" or "wait for approval" message for unapproved users, `LayoutRouter` otherwise; handles `?verificationCode=` and mounts the toaster |
| `router/index.ts` | 28 routes; each has `meta.layout` set to `auth`, `main`, `admin` or `public`, and a `beforeEach` guard that redirects unauthenticated users to `login` |
| `layouts/` | `LayoutRouter.vue` maps `route.meta.layout` to `LayoutMain`, `LayoutAuth`, `LayoutAdmin` or `LayoutPublic`; also `LayoutDialogMember.vue` and `LayoutPageEditor.vue` |
| `views/` | One component per route: `home`, `collection`, `search`, `favorites`, `page`, `admin/` (one file per admin screen, `products/` and `pages/` sub-folders), `auth/`, `public/` |
| `components/` | Feature components grouped by area: `admin/`, `collection/`, `dialog-member/`, `layout-main/`, `page-editor/` (block editors and `blocks/` renderers), `icons/` |
| `components/ui/` | shadcn-vue primitives (button, dialog, form, table, tabs...) generated from `components.json`; `lib/utils.ts` holds the `cn()` helper they use |
| `stores/` | Pinia stores: `globalStore.ts` (auth token and `dam_token` cookie, current user, `env`, selection, display preferences) and `downloadStore.ts` (polls `download.list` with Vue Query) |
| `services/server.ts` | The tRPC client, `RouterInput` / `RouterOutput` types, `extractErrors()` |
| `composables/` | `useGlobalToast`, `useIsTruncated` |
| `utils/` | `fileExtention.ts`, `fileSize.ts` |
| `assets/` | SVG logo and placeholders |
| `style.css` | Tailwind layers and the shadcn CSS variables |

Lists and detail data are fetched with TanStack Vue Query (`useQuery` around `trpc.<router>.<procedure>.query()`); Pinia holds the session, the current user, the `env` query result and UI state such as the selection.

## Logging goes through winston

Everything is logged with `logger` from `server/src/env.ts`: `logger.info('server listening', { addr })`, `logger.error('failed to update assets', { error })`, and the worker's `job` failure entries. An `Error` anywhere in the metadata, nested ones included, is written as its `name`, `message`, `code`, `detail`, `query` and `cause`; a TypeORM `QueryFailedError` therefore shows the Postgres message and SQLSTATE but not its bound parameters. There is no request logging (`logger: false` on Fastify); only procedure errors are logged, by the `onError` hook.

## Where to add X

| To add | Touch |
|---|---|
| A tRPC procedure | The matching file in `server/src/trpc/router/`, or a new file registered in `router/index.ts`; the client sees it through `AppRouter` with no other change |
| An entity and its table | A class in `server/src/entity/` (the `entities` glob picks it up) and a migration in `server/src/migrations/` that creates the table; see [Data model](./data-model.md) |
| A background job | An exported `createQueue` call in `server/src/worker.ts`, plus a row in [Background jobs](../reference/background-jobs.md); see [Writing a background job](./background-jobs.md) |
| An admin screen | A view in `client/src/views/admin/`, a route with `meta: { layout: 'admin' }` in `client/src/router/index.ts`, the link in `LayoutAdmin.vue`, and a page in `docs/administration/` |
| A mail template | A key in `server/mailconfig.json` (`subject` and `body`, rendered with liquidjs by `renderTemplate` in `services/mailer.ts`), a `send*` function there, usually a queue in `worker.ts`, and the table in [Email templates](../configuration/email-templates.md) |
| A storage provider | See [Storage drivers](./storage-drivers.md) |
