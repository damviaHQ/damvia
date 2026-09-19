---
title: tRPC API
description: How procedures are declared and authorised, what a request and an error look like on the wire, and every procedure of every router with its access predicate.
sidebar:
  order: 4
lastUpdated: 2026-09-19
---

This page lists the whole server API and the conventions a new procedure must follow. The request path through the process is in [Architecture](./architecture.md); the access rules as an administrator sees them are in [Roles and access](../introduction/roles-and-access.md).

## A procedure is a zod-validated query or mutation behind predicates

`server/src/trpc/index.ts` exports `router`, `publicProcedure`, `middleware` and `authMiddleware`. A procedure in `server/src/trpc/router/<domain>.ts` follows this skeleton:

```ts
findById: publicProcedure
	.use(authMiddleware(userApproved))
	.input(z.string().uuid())
	.query(async ({ input, ctx }) => {
		const collection = await userCollectionsQuery(ctx.user)
			.andWhere('collection.id = :id', { id: input })
			.getOne()
		if (!collection) {
			throw new TRPCError({ code: 'NOT_FOUND', message: 'Collection not found.' })
		}
		return formatCollection({ collection })
	}),
```

`ctx` is `{ req, res, user }`; `user` is the `User` entity loaded from the JWT or `null`. Each router file is `export default router({ ... })`, mounted under its key in `router/index.ts`, which also declares the only top-level procedure, `env`. Prefer plain objects built by local `format*` helpers. `user.update` returns public profile fields. Product mutations return product entities. Renaming a procedure is a client change too, since the client is compiled against `AppRouter`.

## Four predicates gate access

`authMiddleware(...predicates)` throws `UNAUTHORIZED` when `ctx.user` is `null` or any predicate returns false. `authMiddleware()` with no predicate only requires a logged-in user.

| Predicate | Passes when |
|---|---|
| `userApproved` | `user.approved && user.emailVerified` |
| `userMember` | `role` is `admin`, `manager` or `member` (not `guest`) |
| `userManagerOrAdmin` | Approved, email-verified, and `role` is `admin` or `manager` |
| `userAdmin` | Approved, email-verified, and `role` is `admin` |

Per-object rules (own region for managers, `collection.canEdit(user)`, visibility through `userCollectionsQuery`) are enforced inside the procedure body, not by the middleware.

## Errors carry a code, and validation errors carry field errors

Common explicit `TRPCError` codes are `UNAUTHORIZED` (only from `authMiddleware`), `NOT_FOUND`, `BAD_REQUEST` and `FORBIDDEN`. When zod rejects the input, tRPC raises `BAD_REQUEST` with a `ZodError` cause, and the `errorFormatter` in `trpc/index.ts` rewrites it to `message: 'Invalid request.'` and adds `data.fieldErrors` (the result of `error.cause.flatten().fieldErrors`, an object of field name to array of messages).

On the client, `extractErrors(error)` in `client/src/services/server.ts` returns `{ message, fieldErrors }` with the first message of each field, ready for a form.

## On the wire

- Base URL: `VITE_API_ENDPOINT`, default `http://localhost:3000/trpc`.
- A query is `GET /trpc/<router>.<procedure>?input=<JSON>`; a mutation is `POST /trpc/<router>.<procedure>` with the JSON input as body. Nested routers use dots: `collection.invitation.create`. The `httpLink` sends one request per call, no batching.
- The `authorization` header carries the raw JWT, with no `Bearer` prefix. The token is what `user.login` returns (or what a `?dam_token=` link sets), signed with `APP_SECRET`, valid 180 days.
- There is no OpenAPI document. Types flow from `AppRouter` (`export type AppRouter = typeof appRouter` in `router/index.ts`) to the client through `RouterInput` and `RouterOutput`, `inferRouterInputs<AppRouter>` and `inferRouterOutputs<AppRouter>` in `client/src/services/server.ts`.

## Every procedure

`Auth` is the predicate list passed to `authMiddleware`; `public` means no middleware, `login` means `authMiddleware()` with no predicate.

### `env` (`router/index.ts`)

| Procedure | Kind | Auth | Purpose |
|---|---|---|---|
| `env` | query | public | `passwordLessAuthentication`, `appName`, regions list, for the login screen |

### `user`

| Procedure | Kind | Auth | Purpose |
|---|---|---|---|
| `create` | mutation | public | Sign-up |
| `login` | mutation | public | Password login returning the JWT, or pushes `mailer/log-in` when passwordless or `magicLink` |
| `sendResetPasswordEmail` | mutation | public | Pushes `mailer/password-reset` |
| `resetPassword` | mutation | public | Sets a new password given the email and the reset token |
| `resendVerificationEmail` | mutation | login | Resends the caller’s verification email; no token is returned |
| `me` | query | login | Current user. Also stamps `users.last_login_at` and inserts a `login` activity event when the previous stamp is older than 30 minutes |
| `updateProfile` | mutation | login | Own name/company; changing email requires admin |
| `verifyEmail` | mutation | login | Consumes `?verificationCode=` |
| `removeAccount` | mutation | login | Deletes own account (`FORBIDDEN` for any other id) |
| `findById` | query | `userManagerOrAdmin` | One user (managers: own region) |
| `update` | mutation | `userManagerOrAdmin` | Name, company, email, region, role, groups of a user; `maintenanceContact` is applied by admins on admin profiles only |
| `list` | query | `userManagerOrAdmin` | Users (managers: own region), with `lastLoginAt`; `maintenanceContact` is only returned to admins |
| `approve` | mutation | `userManagerOrAdmin` | Approves and pushes `email/user-approved` |
| `remove` | mutation | `userManagerOrAdmin` | Deletes a user; managers can delete only members and guests in their region |

### `group`, `region`, `authorizedDomain`

| Procedure | Kind | Auth | Purpose |
|---|---|---|---|
| `group.list` | query | `userManagerOrAdmin` | All groups |
| `group.create`, `group.update`, `group.remove` | mutation | `userAdmin` | CRUD |
| `group.setDefault` | mutation | `userAdmin` | Flags the default group |
| `group.moveUsersAndRegions` | mutation | `userAdmin` | Re-points `user_groups` and `regions.default_group_id` from one group to another |
| `region.list` | query | `userAdmin` | Regions |
| `region.create`, `region.update`, `region.remove` | mutation | `userAdmin` | CRUD |
| `region.moveUsers` | mutation | `userAdmin` | Moves every user of one region to another |
| `authorizedDomain.list` | query | `userAdmin` | Domains allowed to sign up |
| `authorizedDomain.create`, `authorizedDomain.remove` | mutation | `userAdmin` | CRUD |

### `collection` and `collection.invitation`

| Procedure | Kind | Auth | Purpose |
|---|---|---|---|
| `tree` | query | `userApproved` | Collections visible to the user, as a tree |
| `treeAdmin` | query | `userAdmin` | Public collection tree for the admin screen |
| `search` | query | `userApproved` | Files matching text, asset types, product facets and scope; without `exactMatch` every whitespace-separated word may match and surrounding whitespace is ignored. Values of one attribute are alternatives, different attributes narrow each other. `sort` is `relevance` (default with a query: files matching more words first, then names starting with a word), `name` or `newest`; the order is stable across pages. The response carries `facets`: counts per asset type, file type (`image`, `video`, `document`, `other`), product view and facetable attribute value, computed over the whole result set with the dimension's own filter left out |
| `searchNotFound` | query | `userApproved` | Returns the search terms found neither in a visible file name nor in a searchable attribute, within the same scope, asset type, product view and file type filters |
| `findById` | query | `userApproved` | One collection with files, children, invitations |
| `lastAddedFiles` | query | `userApproved` | 10 most recent collection files, optionally under one collection |
| `create` | mutation | `userApproved` | New collection; `public` is forced to `false` for non-admins, so only admins create public ones |
| `createFromAsset` | mutation | `userAdmin` | Synchronised collection from an asset folder; pushes `collection/synchronization` |
| `createUserCollection` | mutation | `userApproved` | Private collection owned by the caller |
| `ListPrivateCollections` | query | `userApproved` | The caller's private collections |
| `addItems` | mutation | `userApproved` | Duplicates selected files or whole collections into a collection the caller can edit (`duplicateCollection`, `duplicateFiles`) |
| `update` | mutation | `userApproved` | Name, description, `public`, `draft`, `hasThumbnail`, `limitedToGroupIds` |
| `presignedThumbnailUploadUrl` | query | `userApproved` | Presigned PUT for `collections/{id}-thumbnail` |
| `removeFiles` | mutation | `userApproved` | Removes collection files |
| `remove` | mutation | `userApproved` | Deletes a collection the caller can edit |
| `getFiles` | mutation | `userApproved` | Resolves a selection (files and collections) into files, licenses and `allowDirectDownload` (total at most 2,000,000,000 bytes) |
| `invitation.create` | mutation | `userApproved` | Invites an email to a collection, creating a guest user when unknown; pushes `mailer/invitation` |
| `invitation.remove` | mutation | `userApproved` | Revokes an invitation |
| `invitation.getUserInvitations` | query | login | Invitations on collections the caller owns (admins: also public ones) |

### `asset`, `assetType`, `license`, `favorite`, `download`

| Procedure | Kind | Auth | Purpose |
|---|---|---|---|
| `asset.tree` | query | `userAdmin` | Asset folder tree |
| `asset.findById` | query | `userAdmin` | One folder with children, files and ancestors |
| `asset.update` | mutation | `userAdmin` | Sets `assetTypeId` and `licenseId` on a folder, its descendants and their files |
| `asset.listProductViews` | query | `userApproved` | Distinct `productView` values |
| `assetType.list` | query | `userApproved` | Asset types |
| `assetType.create`, `update`, `remove` | mutation | `userAdmin` | CRUD |
| `license.list` | query | `userAdmin` | Licenses |
| `license.create`, `update`, `remove` | mutation | `userAdmin` | CRUD |
| `favorite.list` | query | `userApproved`, `userMember` | The caller's favourite collection files |
| `favorite.add`, `favorite.remove` | mutation | `userApproved`, `userMember` | Toggle a favourite |
| `favorite.listCollections` | query | `userApproved`, `userMember` | The caller's favourite collections, limited to those currently visible to them, ordered by name |
| `favorite.addCollection` | mutation | `userApproved`, `userMember` | Stars a collection; `NOT_FOUND` when the collection is not visible to the caller, idempotent when already starred. Unlike `favorite.add`, it records no activity event |
| `favorite.removeCollection` | mutation | `userApproved`, `userMember` | Unstars a collection; a no-op when it was not starred |
| `download.list` | query | `userApproved` | The caller's `ready`, `preparing` and `failed` downloads, plus those `expired` in the last month |
| `download.create` | mutation | `userApproved` | Creates a download (`FORBIDDEN` at or above 10,000,000,000 bytes); `email` type pushes `download/create-archive` |

### `pim` and `productAttribute`

| Procedure | Kind | Auth | Purpose |
|---|---|---|---|
| `pim.listProducts` | query | `userAdmin` | Products by `page` and `size`, optional `columnFilter` |
| `pim.compareCsv` | mutation | `userAdmin` | Diff of a parsed CSV against existing products |
| `pim.importCsv` | mutation | `userAdmin` | Upserts products from a parsed CSV |
| `pim.removeAllProducts` | mutation | `userAdmin` | Deletes every product |
| `pim.updateProduct` | mutation | `userAdmin` | Replaces one product's `metaData` |
| `productAttribute.listAvailable` | query | `userAdmin` | Distinct `hstore` keys found in products |
| `productAttribute.list` | query | `userAdmin` | Declared attributes |
| `productAttribute.listFacets` | query | login | Facetable attributes with their distinct values |
| `productAttribute.create`, `update`, `remove` | mutation | `userAdmin` | CRUD |

### `menuItem`, `page`, `settings`

| Procedure | Kind | Auth | Purpose |
|---|---|---|---|
| `menuItem.list` | query | `userApproved` | Menu tree, built against the collection ids the user can see |
| `menuItem.create`, `update`, `remove` | mutation | `userAdmin` | CRUD |
| `menuItem.setHome` | mutation | `userAdmin` | Flags the home item |
| `menuItem.updatePositions` | mutation | `userAdmin` | Reorders and reparents |
| `page.list` | query | `userAdmin` | Pages |
| `page.findById` | query | `userApproved` | One page with blocks |
| `page.create` | mutation | `userAdmin` | Standalone page |
| `page.createForCollection` | mutation | `userApproved` | Page bound to a collection the caller can edit |
| `page.update` | mutation | `userAdmin` | Renames a page |
| `page.remove` | mutation | `userApproved` | Deletes a page the caller can edit |
| `page.addBlock`, `removeBlock`, `updateLayout`, `updateBlockData` | mutation | `userApproved` | Block editing, checked with `page.canEdit(user)` |
| `page.presignedUploadUrl` | query | `userApproved` | Presigned PUT (24 h) for a block's `data.s3key` in the main bucket |
| `settings.getAdminBranding` | query | `userManagerOrAdmin` | Read-only host policy `{ useClientLogo }` |
| `settings.getClientLogo` | query | public | Presigned URL of processed client logo, or `{ exists: false, imageUrl: null }` |
| `settings.getClientLogoUpload` | mutation | `userAdmin` | Ten-minute presigned POST with scoped key, SVG/PNG/WebP MIME type and 5 MB limit |
| `settings.processClientLogo` | mutation | `userAdmin` | Validates/processes caller-owned staged `uploadId` and replaces the permanent WebP logo |
| `settings.removeClientLogo` | mutation | `userAdmin` | Removes the uploaded client logo; layouts fall back to Damvia |
| `settings.getAuthBackgroundImage` | query | public | Presigned URL of `settings/auth-background.webp`, if present |
| `settings.getAuthBackgroundUploadUrl` | query | `userAdmin` | Presigned PUT for the temporary background |
| `settings.processAuthBackgroundImage` | mutation | `userAdmin` | Converts the temporary upload to WebP (quality 80) at `settings/auth-background.webp` |
| `settings.removeAuthBackgroundImage` | mutation | `userAdmin` | Deletes the background |

### `dashboard`

`summary` also returns total collections and folders, the three most recently updated asset files, the three most recently changed users, the three newest guest invitations with their creator and collection, and the three newest download requests with their requester. All remain admin-only.

| Procedure | Kind | Auth | Purpose |
|---|---|---|---|
| `summary` | query | `userAdmin` | `storage` (used and quota bytes, percent, `measuredAt`, `alertLevel`, `quotaReachedAt`, `serverContactEmails` (the `SERVER_ALERT_EMAILS` list, shown as the contact to raise the plan), and `disk` only when the caller's email is in `SERVER_ALERT_EMAILS`, else `null`: total and free bytes, `blockedFiles`, orphan figures), asset files by status, users (total, `pendingApproval`, `maintenanceContacts`, by role), `recentUsers`, `recentInvitations`, `recentFiles`, `recentDownloads`, `jobs` (`measuring`, `downloading` count, read from `pgboss.job`), downloads of the last 7 days by status |
| `retryPendingAssets` | mutation | `userAdmin` | Queues `asset/update-content` for every `creating` or `outdated` file; returns `{ queued }`. `BAD_REQUEST` while an `asset/update-content` job is `created`, `retry` or `active` in `pgboss.job`; an advisory lock serialises concurrent calls |
| `measureStorage` | mutation | `userAdmin` | Pushes one `storage/measure-usage` job. `BAD_REQUEST` while one is `created`, `retry` or `active`; an advisory lock serialises concurrent calls |

### `analytics`

The five queries take `{ from, to }` (dates, `to` excluded) and read `activity_events` with raw SQL; every count is returned as a number. Series are one row per day that has data, `{ day, count }`.

| Procedure | Kind | Auth | Purpose |
|---|---|---|---|
| `overview` | query | `userAdmin` | `totals` (views, downloads, `downloadRequests`, logins, `activeUsers`, searches, shares, favorites, `newUsers`, `newFiles`) and a daily `series` of views, downloads, logins, searches and active users |
| `assets` | query | `userAdmin` | `topDownloaded` and `topViewed` (20 each), `byType`, `byCollection`, `growth`, `neverDownloaded` (`total` and the 50 latest files), `storageByType` (whole library, not the period) |
| `users` | query | `userAdmin` | `activeSeries`, `loginSeries`, `newUserSeries`, `topDownloaders` (20), `byRole`, `byRegion`, `byGroup` |
| `searches` | query | `userAdmin` | `topTerms` (50, with `avgResults` and `zeroResults`), `zeroResultTerms`, `volume` |
| `searchTerm` | query | `userAdmin` | Daily volume and contactable users for one exact search term, including total audience count |
| `collections` | query | `userAdmin` | `createdSeries`, `shareSeries`, `mostShared`, `mostActive` |
| `trackView` | mutation | `userApproved` | Records an `asset_view` for a collection file the caller can see, else `NOT_FOUND`. Called by the preview dialog |

`download.create`, `collection.search` (first page, non-empty query), `collection.invitation.create` and `favorite.add` insert their own activity event; see [Data model](./data-model.md).

Uncaught database, storage or service exceptions can also surface as `INTERNAL_SERVER_ERROR`.

`searches` includes totals, daily zero-result counts, previous-period term counts and demand signals. A spike exceeds the preceding seven-day daily average by at least 5 searches and is at least 3× that average. Signals are evaluated before the 50-row display limit. `searchTerm({ from, to, term })` is also admin-only: it returns the exact term’s daily series and up to 200 approved, verified, non-guest users with their search counts and emails, plus the total contactable count. Neither endpoint sends messages. All analytics ranges require `to > from` and a duration no greater than 366 days.
