---
title: Architecture
description: The single server process, the path of a request from the Vue client to a TypeORM entity, the folder map of both packages, and where a new feature goes.
sidebar:
  order: 2
lastUpdated: 2026-09-29
---

This page gives a developer the shape of the code: what runs, how a request travels, what each folder holds, and where to add something. The meaning of the objects (collections, pages, records) is in [Core concepts](../introduction/concepts.md).

## One Node process does four things

`server/src/index.ts` launches the sync task without awaiting it, then awaits the remaining startup steps:

1. The cloud sync: `assetUpdater().initialize()`, then a `fetchUpdates()` loop re-armed with `setTimeout` every 5 minutes. After every listing it inserts the missing `collection_files` rows for synchronised collections. This loop is **not** a pg-boss job and runs in every API process.
2. `dataSource.initialize()`: TypeORM connects and, because `migrationsRun: true`, applies pending migrations.
3. `startQueues()` from `server/src/worker.ts`: pg-boss connects to the same `DATABASE_URL` and creates every queue, so the API can queue jobs. Only if `ENABLE_WORKER=true` does it also register the cron schedules and the job handlers.
4. The Fastify server from `server/src/server.ts`, listening on `0.0.0.0` and `PORT` (default `3000`).

Any failure in steps 2 to 4 logs the error and exits with code 1. Sync initialisation failure also exits; sync-pass failures are logged and retried after five minutes. The first pass can reach the database/queues before they are ready. See [Worker and scaling](../deployment/worker-and-scaling.md) for the current single-process constraint.

## Fastify exposes tRPC and one REST route

`server/src/server.ts` builds Fastify with `maxParamLength: 5000` (path parameters, not the tRPC input query string), `bodyLimit: 5242880` and `trustProxy` from `TRUST_PROXY`. It registers `@fastify/cookie`, `@fastify/helmet` (the API's security headers), and `@fastify/cors` limited to the origin of `APP_URL` with credentials. An `onRequest` hook refuses with `403` any request other than `GET`, `HEAD` or `OPTIONS` whose `Origin` is neither `APP_URL`'s nor `API_URL`'s; with the `SameSite` cookie this is the defence against cross-site request forgery. Unless `REQUEST_LOG=false`, an `onResponse` hook logs one `http.response` line per request. It then mounts `fastifyTRPCPlugin` under the prefix `/trpc` with `appRouter` and `createContext`. Its `onError` hook logs every procedure error as `http.request` with the procedure `path`, error `code`, `requestId` and `userId`. It excludes request bodies and raw error objects.

The only non-tRPC route is `GET /v1/downloads/:downloadId`: it loads the `Download` and its owner, redirects to `APP_URL/link-expired` when the row is missing, not ready or past `expiresAt`, or when the owner is no longer approved, is suspended or can no longer see every file, and otherwise redirects to a 5-minute presigned URL of `downloads/{id}` in the assets bucket.

## A request travels client → tRPC → router → service → entity

| Step | File | What happens |
|---|---|---|
| 1 | `client/src/services/server.ts` | `createTRPCProxyClient<AppRouter>` with one `httpLink` to `VITE_API_ENDPOINT` (default `http://localhost:3000/trpc`), whose `fetch` passes `credentials: 'include'` so the browser sends the HttpOnly `damvia_session` cookie. The client never handles the token. |
| 2 | `server/src/server.ts` | Fastify hands `/trpc/*` to the tRPC adapter. |
| 3 | `server/src/trpc/index.ts` | `createContext` calls `sessionFromRequest(req)` (`services/session.ts`), which hashes the cookie, loads the live `UserSession` with its `User` and refreshes `last_seen_at` at most every 5 minutes; `ctx.user` and `ctx.session` are `null` otherwise. `authMiddleware(...predicates)` throws `UNAUTHORIZED` unless a session exists and every predicate passes, and `FORBIDDEN` when the user's role is in `MFA_REQUIRED_ROLES`, they have not enrolled, and the procedure is not in `MFA_ENROLMENT_PATHS`. The `errorFormatter` turns a zod failure into `message: 'Invalid request.'` plus `data.fieldErrors`. |
| 4 | `server/src/trpc/router/*.ts` | One file per domain, merged in `router/index.ts` into `appRouter`. Procedures validate input with zod and usually query TypeORM directly. |
| 5 | `server/src/services/*.ts` | Logic shared by several procedures or by jobs: `userCollectionsQuery` and `userCollectionFilesQuery` (the access filters), `upsertFolder` / `upsertFile`, `createDownloadArchive`, mail senders, thumbnails. |
| 6 | `server/src/entity/*.ts` | TypeORM entities, one per table. See [Data model](./data-model.md). |

Details of the procedures, predicates and error shape are in [tRPC API](./api.md).

## Folder map of `server/src`

| Folder or file | Holds |
|---|---|
| `index.ts` | Process startup described above |
| `server.ts` | Fastify instance, cookie, helmet, CORS and origin check, request log, tRPC plugin, `/v1/downloads/:downloadId` |
| `load-env.ts` | Loads `.env` with dotenv, then `loadFileVariables()` fills each `NAME` from the file named by `NAME_FILE` |
| `env.ts` | `logger` (winston, console transport, `timestamp` + `splat` + `simple` format), `dataSource`, S3 clients, mail transporter, `assetUpdater()` selection, session, cookie, proxy and MFA settings |
| `worker.ts` | pg-boss instance, `createQueue` helper, every queue definition |
| `cli.ts` | `commander` program: `check-integrity`, the source commands and `metadata:backfill` |
| `asset-updater/` | `base.ts` abstract driver, `dropbox.ts`, `one-drive.ts`; see [Storage drivers](./storage-drivers.md) |
| `entity/` | 47 TypeORM entities and their enums |
| `migrations/` | Hand-written SQL migrations, run at startup |
| `services/` | `asset.ts` (upsert, deletion, thumbnails), `asset-type-rules.ts` (folder rule compilation, the pure resolution of folder asset types, the set-based write), `enrichment.ts` (`runEnrichmentPass()`, the post-sync pass under an advisory lock, one committed transaction per stage, recorded in `enrichment_runs`; `isEnrichmentRunning()`), `variant-grouping.ts` (file name tokens, the trie, covers, the set-based write of groups, members and axes, the group summaries of a page of results), `variant-axes.ts` (recognizers and axis reuse), `file-metadata.ts` (EXIF, IPTC and XMP reading, C2PA manifest detection, the values of visible fields for a page of results), `entity-resolution.ts` (matching rules, CSV mappings, trusted metadata, folder attachments and links set by hand: pure strategies and merge, then the set-based write of links, resolutions and the derived `record_id`), `collection.ts` (access queries, synchronisation, duplication), `download.ts` (archives, format conversion, expiry), `image-processor.ts` (sharp, ffmpeg, LibreOffice, Ghostscript thumbnails), `mailer.ts` (one sender per template), `page.ts` (page and block helpers), `system.ts` (integrity check), `user.ts` (create, guest, legacy JWT reading, removal), `credentials.ts` (password hashing, token hashing, signing-secret validation), `session.ts` (create, read, revoke and prune sessions, the cookie options), `sign-in.ts` (`completeSignIn()`, the MFA challenge, lockout), `login-token.ts` (single-use email-link tokens), `rate-limit.ts` (in-memory attempt counters and lockout durations), `mfa.ts` (TOTP, secret encryption, recovery codes), `password-policy.ts` (length and breach check), `security-checks.ts` (the `security.configuration` startup warnings), `audit.ts` (`recordAudit()`, redaction, retention), `privacy.ts` (personal data export and anonymisation), `oidc.ts` (single sign-on), `license-expiry.ts` (licence end notices), `search-insights.ts` (search demand, daily spikes and contactable search audiences) |
| `trpc/index.ts` | tRPC init, context (user and session), `authMiddleware`, the MFA enrolment gate and the four predicates |
| `trpc/router/` | 28 domain routers, `auth.ts` among them (sign-in, sessions, two-step verification), plus `collection/invitation.ts`, merged in `index.ts` with the public `env` query |
| `util/array.ts` | `compact()` |

## Folder map of `client/src`

| Folder or file | Holds |
|---|---|
| `main.ts` | Creates the app with `VueQueryPlugin` using the shared `services/queryClient.ts` cache (`refetchOnWindowFocus: false`; cleared on sign-out), `vue3-lazyload`, the router and Pinia |
| `app.vue` | Root component: shows a loader while the user loads, `LayoutAuth` with the "verify your email" or "wait for approval" message for unapproved users, `LayoutRouter` otherwise; handles `?verificationCode=` and mounts the toaster |
| `router/index.ts` | Every route sets `meta.layout` (`auth`, `main`, `admin`, `editor` or `public`); `meta.roles` limits a screen to some roles, `meta.mobile` names its phone screen and `meta.mobileOnly` marks a screen that exists only on phones. The `beforeEach` guard (`router/guard.ts`) sends signed-out visitors to `login` and other roles, or computers on a phone-only screen, home. The server checks every call again |
| `layouts/` | `LayoutRouter.vue` renders `mobile/LayoutMobile.vue` below 768 px wide (`composables/useIsPhone.ts`) for the `main`, `admin` and `editor` layouts; otherwise it maps `route.meta.layout` to `LayoutMain`, `LayoutAuth`, `LayoutAdmin`, `LayoutEditor` or `LayoutPublic`, loading each layout on demand so portal visitors never download the admin shell; also `LayoutDialogMember.vue`. `LayoutEditor.vue` is the full-height page editor shell, with no navigation tree or top bar |
| `views/` | One component per route: `home`, `collection`, `search`, `favorites`, `page`, `page-edit` (the editor, for a collection page and a standalone page alike), `admin/` (one file per admin screen, `records/` and `pages/` sub-folders), `auth/` (`auth-login.vue` also exchanges `?link=` and `?invite=` for a session and asks for the verification code), `public/` |
| `mobile/` | The phone interface: `LayoutMobile.vue` (bottom tabs), `MobileDesktopOnly.vue` (shown for routes without a phone screen), `components/MobileMenuDrawer.vue` (the Menu tab: the desktop `components/layout-main/MainNavigation.vue`, the same component `LayoutMain` puts in its sidebar), `views/` (one screen per route that has `meta.mobile`), `components/` (file grid, preview, download, share and filter sheets) and `composables.ts`. It imports only `composables/`, `utils/`, `stores/`, `services/`, `components/ui/`, `PageRenderer`, `MainNavigation` and `ClientLogo`/`Loader`; desktop code never imports it except the router and `LayoutRouter.vue`. `test/unit/mobileBoundary.test.ts` enforces both rules |
| `components/` | Feature components grouped by area: `admin/`, `auth/` (`MfaSetup.vue`), `collection/`, `dialog-member/` (the Account dialog tabs, `DialogMemberSecurity.vue` for two-step verification and sessions), `layout-main/`, `page-renderer/` (`PageRenderer.vue`, the one grid used by readers and by the editor, with one component per block type in `blocks/`), `page-editor/` (the editing shell, block library, block toolbar, media chooser and settings, loaded on demand so readers never download it), `icons/` |
| `components/ui/` | shadcn-vue primitives (button, dialog, form, table, tabs...) generated from `components.json`; `lib/utils.ts` holds the `cn()` helper they use |
| `stores/` | Pinia stores: `globalStore.ts` (current user from `user.me`, `authChecked` and `whenReady()` that the router guard awaits, `signedIn()` after a sign-in procedure, the one-time exchange of a legacy `dam_token`, `env`, selection, display preferences) and `downloadStore.ts` (polls `download.list` with Vue Query) |
| `services/server.ts` | The tRPC client (`credentials: 'include'`), `upgradeLegacyToken()`, `RouterInput` / `RouterOutput` types, `extractErrors()` |
| `composables/` | `useGlobalToast`, `useIsTruncated` |
| `utils/` | `fileExtention.ts`, `fileSize.ts` |
| `assets/` | SVG logo and placeholders |
| `style.css` | Tailwind layers and the shadcn CSS variables |

Lists and detail data are fetched with TanStack Vue Query (`useQuery` around `trpc.<router>.<procedure>.query()`); Pinia holds the session, the current user, the `env` query result and UI state such as the selection.

## Logging goes through winston

Everything is logged with `logger` from `server/src/env.ts`: `logger.info('server listening', { addr })`, `logger.error('failed to update assets', { error })`, and the worker's `job` failure entries. Fastify's own logger is off (`logger: false`); the `onResponse` hook writes one `http.response` line per request, without the query string, and procedure errors are logged by the `onError` hook. Startup logs one `security.configuration` warning per unprotected setting.

## Where to add X

| To add | Touch |
|---|---|
| A tRPC procedure | The matching file in `server/src/trpc/router/`, or a new file registered in `router/index.ts`; the client sees it through `AppRouter` with no other change |
| An entity and its table | A class in `server/src/entity/` (the `entities` glob picks it up) and a migration in `server/src/migrations/` that creates the table; see [Data model](./data-model.md) |
| A background job | An exported `createQueue` call in `server/src/worker.ts`, plus a row in [Background jobs](../reference/background-jobs.md); see [Writing a background job](./background-jobs.md) |
| An admin screen | A view in `client/src/views/admin/`, a route with `meta: { layout: 'admin', roles: [...] }` in `client/src/router/index.ts`, the link in `LayoutAdmin.vue`, and a page in `docs/administration/` |
| A phone screen | A view in `client/src/mobile/views/` and `meta.mobile: () => import(...)` on its route. Move shared behaviour into a composable or `utils/` first; never import a desktop component. Update [Phones](../administration/phones.md) |
| A mail template | An entry in `EMAIL_DEFINITIONS` (`server/src/mail/catalogue.ts`: trigger, recipients, variables, sample values, default content), a `send*` function in `services/mailer.ts` that calls `sendTemplate`, usually a queue in `worker.ts`, and the table in [Email templates](../configuration/email-templates.md). `mail/render.ts` renders it with the hardened Liquid engine into `mail/layout.ts` |
| A storage provider | See [Storage drivers](./storage-drivers.md) |
