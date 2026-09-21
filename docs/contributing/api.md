---
title: tRPC API
description: How procedures are declared and authorised, what a request and an error look like on the wire, and every procedure of every router with its access predicate.
sidebar:
  order: 4
lastUpdated: 2026-09-21
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
| `search` | query | `userApproved` | Files matching text, asset types, file formats, record facets and scope; without `exactMatch` every whitespace-separated word may match and surrounding whitespace is ignored. Values of one attribute are alternatives, different attributes narrow each other. `sort` is `relevance` (default with a query: files matching more words first, then names starting with a word), `name` or `newest`; the order is stable across pages. `extensions` keeps only files whose name ends in one of the given extensions, compared in lower case and with a leading dot ignored. `minSize` and `maxSize` bound the file size in bytes and either may be omitted. The response carries `facets`: counts per asset type, file type (`image`, `video`, `document`, `other`), file extension, product view and facetable attribute value, computed over the whole result set with the dimension's own filter left out. Each asset file appears once even when it sits in several visible collections (the first visible `collection_files` row stands for it) and facet counts count files. With a query, the first page also returns `rangeResults` (at most 60) and `rangeTotal`: files linked through an attribute value (a range) shared by the records whose key or searchable attribute matches the query, under the same visibility and filters, never one of the exact results |
| `rangeSearch` | query | `userApproved` | The range results of a query, 300 per `page`, with `total`, `totalPages` and `nextPage` |

`search` takes `collapseVariants`: each variant group is then one result, its cover when the caller can see it, and every result carries `variantGroup` (`id`, `displayName`, `memberCount` and `status` over the members the caller can see, `coverFileId`) or `null`; without it the output is unchanged. `search` and `rangeSearch` take `variantAxes`, a map from an axis id to values, and `facets.variantAxes` counts the values of each axis over the results. `assetType.create` and `update` take `groupVariants`; changing it re-runs the variant stage.

`search` and `rangeSearch` also take `metadata`: a map from a metadata field id to a list of values (text fields) or `{ from, to }` days (`YYYY-MM-DD`, inclusive, date fields); only facetable fields apply, different fields narrow each other. `facets.metadata` counts the values of each facetable text field and `facets.metadataRanges` gives the `min` and `max` of each date field over the results, each with its own filter left out. Searchable metadata fields join the text match. Every file returned by `search`, `rangeSearch`, `findById`, `lastAddedFiles` and `favorite.list` carries `metadata`: the values of its visible fields, joined by commas.
| `searchNotFound` | query | `userApproved` | Returns the search terms found neither in a visible file name nor in a searchable attribute, within the same scope, asset type, record view, file type and extension filters |
| `findById` | query | `userApproved` | One collection with files, children, invitations |
| `lastAddedFiles` | query | `userApproved` | 10 most recent collection files, optionally under one collection |
| `create` | mutation | `userApproved` | New collection, under any parent including a synchronized one; `public` is forced to `false` for non-admins, so only admins create public ones. `BAD_REQUEST` when a sibling already has that name |
| `createFromAsset` | mutation | `userAdmin` | Synchronised collection from an asset folder, at the root or under a custom collection (`BAD_REQUEST` under a synchronized parent, whose sub-folders the sync links itself); pushes `collection/synchronization` |
| `createUserCollection` | mutation | `userApproved` | Private collection owned by the caller |
| `ListPrivateCollections` | query | `userApproved` | The caller's private collections |
| `addItems` | mutation | `userApproved` | Duplicates selected files or whole collections into a collection the caller can edit (`duplicateCollection`, `duplicateFiles`) |
| `rename` | mutation | `userApproved` | Name only, refused on synchronized collections and when a sibling already has that name |
| `move` | mutation | `userApproved` | Changes the parent, or takes the collection to the top level with `parentId: null`. Refused on a synchronized collection under a synchronized parent, into the collection's own subtree, across the public and private divide, and onto a name a sibling already has. The subtree follows, with `draft`, owner and group restriction re-derived from the new parent |
| `update` | mutation | `userApproved` | Name, description, `public`, `draft`, `hasThumbnail`, `limitedToGroupIds`; the sibling-name rule applies to custom collections |
| `presignedThumbnailUploadUrl` | query | `userApproved` | Presigned PUT for `collections/{id}-thumbnail` |
| `removeFiles` | mutation | `userApproved` | Removes collection files |
| `remove` | mutation | `userApproved` | Deletes a collection the caller can edit. `BAD_REQUEST` for a synchronized collection under a synchronized parent, unless it is flagged orphaned; custom collections inside a synchronized tree and synchronized roots can be deleted |
| `listOrphaned` | query | `userAdmin` | Collections flagged `orphanedAt`, newest first, with `orphanedReason` and `orphanedFromName` |
| `dismissOrphan` | mutation | `userAdmin` | Clears the orphan flag of a custom collection; `BAD_REQUEST` on a synchronized one, which is deleted or healed by moving its folder back |
| `getFiles` | mutation | `userApproved` | Resolves a selection (files and collections) into files, licenses and `allowDirectDownload` (total at most 2,000,000,000 bytes) |
| `invitation.create` | mutation | `userApproved` | Invites an email to a collection, creating a guest user when unknown; pushes `mailer/invitation` |
| `invitation.remove` | mutation | `userApproved` | Revokes an invitation |
| `invitation.getUserInvitations` | query | login | Invitations on collections the caller owns (admins: also public ones) |

### `asset`, `assetType`, `license`, `favorite`, `download`

| Procedure | Kind | Auth | Purpose |
|---|---|---|---|
| `asset.tree` | query | `userAdmin` | Asset folder tree |
| `asset.findById` | query | `userAdmin` | One folder with children, files and ancestors |
| `asset.update` | mutation | `userAdmin` | Sets `assetTypeId` and `licenseId` on a folder, its descendants and their files. When `assetTypeId` is given, also records `assetTypeSource` (`manual` on the folder, `inherited` on the descendants, `null` when the type is cleared) and clears `assetTypeRuleId` |
| `asset.listRecordViews` | query | `userApproved` | Distinct `recordView` values |
| `assetType.list` | query | `userApproved` | Asset types |
| `assetType.create`, `update`, `remove` | mutation | `userAdmin` | CRUD; removing a type deletes its folder rules |
| `assetTypeRule.list` | query | `userAdmin` | Every rule with its asset type, `enabled`, `lastError`, `createdById`, `folders` (folders it actually types), `keptByHand` (folders it wins but that keep a hand-set type), up to 10 example paths of typed folders and the ids of the rules it overlaps with, plus `folderCount` (folders with a stored path) and `roots` (the paths of the top folders, where every path starts) |
| `assetTypeRule.preview` | query | `userAdmin` | `pattern`, `assetTypeId`, `enabled`, optional `id`: resolves every folder as if the rule were saved and returns `matches` (folders whose path matches), `examples`, `applied` (folders that would take the type), `keptByHand`, `lostTo` (per other rule that keeps the folder: `rulePattern` and `count`) and `changes` (`folders`, `files`, and `groups` of what the changed folders currently hold, by type name, `source` and `rulePattern`) |
| `assetTypeRule.create`, `update` | mutation | `userAdmin` | Validates the pattern as a field error (compiles, at most 500 characters, under 50 ms on a sample path), refuses a duplicate pattern (`BAD_REQUEST`) and an unknown type (`NOT_FOUND`), saves, then re-applies the rule and returns `{ rule, applied: { folders, files } }` |
| `assetTypeRule.remove` | mutation | `userAdmin` | Deletes the rule; folders keep their type until the next pass |
| `assetTypeRule.reresolve` | mutation | `userAdmin` | Re-applies one rule: its folders, the folders it used to type and their inherited descendants; returns `{ folders, files }` |
| `license.list` | query | `userAdmin` | Licenses |
| `license.create`, `update`, `remove` | mutation | `userAdmin` | CRUD |
| `favorite.list` | query | `userApproved`, `userMember` | The caller's favourite collection files |
| `favorite.add`, `favorite.remove` | mutation | `userApproved`, `userMember` | Toggle a favourite |
| `favorite.listCollections` | query | `userApproved`, `userMember` | The caller's favourite collections, limited to those currently visible to them, ordered by name |
| `favorite.addCollection` | mutation | `userApproved`, `userMember` | Stars a collection; `NOT_FOUND` when the collection is not visible to the caller, idempotent when already starred. Unlike `favorite.add`, it records no activity event |
| `favorite.removeCollection` | mutation | `userApproved`, `userMember` | Unstars a collection; a no-op when it was not starred |
| `download.list` | query | `userApproved` | The caller's `ready`, `preparing` and `failed` downloads, plus those `expired` in the last month |
| `download.create` | mutation | `userApproved` | Creates a download (`FORBIDDEN` at or above 10,000,000,000 bytes); `email` type pushes `download/create-archive` |

### `record` and `recordAttribute`

Records were called products until the 2026-09-21 rename; the tables, columns, procedures and response fields all carry the record name now. The admin-chosen label (`enrichment_settings`) only changes what people read on screen.

| Procedure | Kind | Auth | Purpose |
|---|---|---|---|
| `record.list` | query | `userAdmin` | Records by `page` and `size` (at most 500), with optional `search` (the key or any value, `ILIKE`), `filters` (at most 10; `column` is `recordKey` or a field name, `op` is `contains`, `is`, `is_not`, `is_empty`, `is_not_empty` or `has_any` with `values`) and `sort` (`recordKey`, `createdAt`, `updatedAt`, `fileCount` or a field; numbers and dates sort by value, values that do not fit last). Each row carries `thumbnailURL` (a file at the thumbnail view first, else any linked file with a thumbnail), `fileCount`, `filledCount` and `updatedAt`; the result carries `total` and `keyColumnName`. An unknown column is `BAD_REQUEST` |
| `record.get` | query | `userAdmin` | One record as a list row, plus `files.direct` (links with strategy, status, `isPrimary`, source folder, step pattern, author and thumbnail; files whose `record_id` only the old job set come as `strategy: 'legacy'`) and `files.range` (files linked through a value the record has). 500 rows each at most |
| `record.create` | mutation | `userAdmin` | `recordKey` (trimmed, 1 to 200 characters) and optional `values`. `CONFLICT` when the key exists, `NOT_FOUND` for an unknown field, `BAD_REQUEST` for a value its type refuses. Re-runs the entity stage |
| `record.patch` | mutation | `userAdmin` | Sets 1 to 50 fields of one record (`values`) and leaves the others; `source` is `grid` or `panel`. The key column is `BAD_REQUEST`. Writes a history row only when a value changes. Re-runs the entity stage only when a changed field is used by a range link, a folder attachment or the CSV mapping |
| `record.bulkPatch` | mutation | `userAdmin` | Sets 1 to 10 fields on up to 500 records; one history row per changed record; returns `updated` |
| `record.remove` | mutation | `userAdmin` | Deletes up to 500 records, their last values kept in the history, then re-runs the entity stage so links to their keys turn dangling |
| `record.removeAll` | mutation | `userAdmin` | Same for every record |
| `record.history` | query | `userAdmin` | Changes of a record, newest first, including those made under the same key before it was deleted; `before` (the id of the last item) and `limit` (1 to 100) page through them |
| `record.exportRows` | mutation | `userAdmin` | `columns` (key first, then fields by position) and `rows` for the `ids` given, or for the `search`, `filters` and `sort`; more than 10,000 rows is `BAD_REQUEST` |
| `record.compareCsv` | mutation | `userAdmin` | `rows` with their `key`, a `status` `new`, `changed`, `unchanged`, `duplicate`, `missing_key` or `invalid`, the `differences` (old and new per column) and the `invalid` message per column, plus `newColumns` (created as text on import) and `newOptions` per select field. Writes nothing |
| `record.importCsv` | mutation | `userAdmin` | In one transaction: creates the new columns as text fields, adds the new options, creates and updates rows, skips a row with an invalid value whole, and writes one history row per record with the same `importBatchId`. Returns `newRecords`, `updatedRecords` and `skipped`. Missing columns are not written as empty strings on other records |
| `recordAttribute.listAvailable` | query | `userAdmin` | Distinct `hstore` keys found in records |
| `recordAttribute.list` | query | `userAdmin` | Fields in `position` order, with `valueType` and `options` |
| `recordAttribute.listFacets` | query | login | Facetable fields with their distinct values; each option of a multiple select is a value of its own |
| `recordAttribute.create` | mutation | `userAdmin` | `name` (1 to 100 characters, not the key column; `CONFLICT` when taken), `valueType`, `options`, switches. Placed last. A select without options takes them from the stored values. Returns `invalidCount` |
| `recordAttribute.update` | mutation | `userAdmin` | Any of display name, `valueType`, `options` (no `\|`, at most 200) and switches. Stored values are never rewritten; `invalidCount` says how many no longer fit |
| `recordAttribute.reorder` | mutation | `userAdmin` | `ids` in their new order |
| `recordAttribute.usage` | query | `userAdmin` | `filled` and `invalid` value counts of a field |
| `recordAttribute.remove` | mutation | `userAdmin` | Removes the field and its value from every record, with a history row per record that held one (`source: 'attribute'`); returns `cleared` |
| `settings.getEnrichment` | query | `userAdmin` | `recordLabelSingular` and `recordLabelPlural` |
| `settings.updateEnrichment` | mutation | `userAdmin` | Sets both labels (1 to 30 characters each); `env` returns them as `recordLabel` |

Values stay text in the `hstore`. A field's `valueType` fixes one stored form: `number` is `-?digits(.digits)` (a comma is read as the decimal point), `date` is `YYYY-MM-DD`, `url` is an `http` or `https` address, `single_select` is one option, and `multi_select` joins its options with `|` in option order. `server/src/services/record-values.ts` holds the rules and `client/src/utils/recordValues.ts` repeats them for instant feedback. Search filters and facets split a multiple select on `|`; the file details shown to readers join it with commas.

### `metadataField` and `entityCsv`

| Procedure | Kind | Auth | Purpose |
|---|---|---|---|
| `metadataField.list` | query | `userAdmin` | Every field with its switches, link meaning, `fileCount` and two example values |
| `metadataField.update` | mutation | `userAdmin` | Display name and switches. `canLink` needs `linkTarget` (`record_key` or `attribute`, with `linkAttributeName`); a GPS field cannot be facetable (`BAD_REQUEST`). Changing the link settings re-runs the entity stage |
| `metadataField.listFacets` | query | `userApproved` | Facetable fields: the 200 most used values of a text field with `truncated`, or the `min` and `max` of a date field |
| `entityCsv.summary` | query | `userAdmin` | Rows of the current mapping, when and by whom it was imported |
| `entityCsv.compare` | mutation | `userAdmin` | `rows` (at most 50,000: `fileName` with `recordKey`, or `attribute` and `value`): new, changed and removed rows against the current mapping, compared on the file name without extension; keys no record has; files of the library the rows name. Writes nothing |
| `entityCsv.replace` | mutation | `userAdmin` | Replaces the whole mapping in one transaction, then re-runs the entity stage |
| `entityCsv.clear` | mutation | `userAdmin` | Removes the mapping and re-runs the entity stage |

`resolverStep.save` also takes `metadata` steps (`config.metadataFieldId`), refused unless the field can link; `resolverStep.list` returns the fields that can link as `trustedFields`. `entityResolution.unmatchedFiles` returns, per file, a `suggestion`: the value of a field that can link as a record key, when a record has that key. `settings.getEnrichment` and `updateEnrichment` also carry `viewsEnabled`, `viewSeparator` (one character), `viewDigits` (1 to 4) and `thumbnailView`; changing the first three re-runs the entity stage. `env` returns `viewsEnabled`.

### `enrichment`

| Procedure | Kind | Auth | Purpose |
|---|---|---|---|
| `enrichment.overview` | query | `userAdmin` | `synced`, folder counts by origin of their type, file counts by resolution status, `assetTypes` (`total`, `relatedToRecords`, `withSteps` among them, `groupingVariants`), `records`, `metadataFields` (`total`, `shown`), `variantGroups`, `unnamedAxes` used by a group, `running` (the pass holding the lock, with its start and trigger) and `lastRun` (finished, with duration, per-stage `stats` or `error`) |
| `enrichment.run` | mutation | `userAdmin` | Starts a pass without waiting for it; `queued: true` when one is running, in which case it runs next |
| `enrichment.badges` | query | `userAdmin` | `unmatched` (unmatched and conflicts) and `unnamedAxes` used by a group, for the menu |

### `variantGroup` and `variantAxis`

| Procedure | Kind | Auth | Purpose |
|---|---|---|---|
| `variantGroup.findById` | query | `userApproved` | One group with the members the caller can see (each a collection file plus `assetFileId`, `status` and `axisValues`), its axes with their labels, its worst status and, for admins, the overrides that shaped it. `NOT_FOUND` when no member is visible |
| `variantGroup.setCover` | mutation | `userAdmin` | Pins a member as the cover, replacing an earlier cover override of the group |
| `variantGroup.forceGroup` | mutation | `userAdmin` | Two to 500 files of one folder and asset type form a group of their own (`BAD_REQUEST` across folders) |
| `variantGroup.exclude` | mutation | `userAdmin` | Files that are never grouped |
| `variantGroup.listOverrides`, `undoOverride` | query, mutation | `userAdmin` | The overrides with their file names and author; removing one re-runs grouping |
| `variantAxis.list` | query | `userAdmin` | Every axis with its label (`Variant n` when unnamed), values, recognizer, `ignored`, examples and group count |
| `variantAxis.rename`, `ignore` | mutation | `userAdmin` | Names an axis, or hides it from the search filters while keeping it |
| `variantAxis.merge` | mutation | `userAdmin` | Moves the groups of `fromId` to `intoId`, which takes the union of the values, and deletes `fromId` |
| `variantAxis.listFacets` | query | `userApproved` | The axes shown as search filters: not ignored and used by a group |
| `variantAxis.settings`, `updateSettings` | query, mutation | `userAdmin` | `minPrefixLength` (1 to 40) and `blockedTokens` (lower case, no space, dot, dash or underscore); saving re-runs grouping |

Every write re-runs the variant stage of the enrichment pass under its advisory lock and returns its counts.

### `resolverStep` and `entityResolution`

Every procedure requires `userAdmin`. Writes re-run the entity stage of the enrichment pass under its advisory lock and return its counts (`files`, `matched`, `unmatched`, `conflicts`, `linksAdded`, `linksRemoved`, `linksUpdated`, `filesUpdated`).

| Procedure | Kind | Purpose |
|---|---|---|
| `resolverStep.list` | query | Every asset type with `isRelatedToRecords`, its file count and its ordered steps (`strategy`, `config`, `enabled`, `lastError`), plus `legacyPattern` (`PRODUCT_MATCHING_REGEX`), `legacyEnabled`, the view settings, the generated view part and the attribute names of the records |
| `resolverStep.save` | mutation | Replaces the steps of one asset type, in order (`filename_regex`, `folder_regex`; at most 20). Each step is compiled first; a broken one is refused with `BAD_REQUEST` naming its position |
| `resolverStep.preview` | query | Runs unsaved steps on up to 40 files of a folder subtree and returns, per file, the key found, the view, the status and the links. Writes nothing |
| `resolverStep.rerun` | mutation | Re-runs the entity stage |
| `entityResolution.counts` | query | `unmatched`, `conflicts`, `dangling` and the number of folders holding unmatched files |
| `entityResolution.unmatchedFolders`, `unmatchedFiles`, `conflicts`, `dangling` | query | Four tabs of the To review screen; files paginated by 100 with `search` and `folderId`, the others capped at 500 |
| `entityResolution.findTargets` | query | Records whose key or searchable attribute contains `query` (20), or the values of `attributeName` containing it, with their record count |
| `entityResolution.manualLinks` | query | Every folder attachment and `manual_file` link, newest first, capped at 500, with `kind` (`folder` or `file`), name, path, target, author and the number of files covered |
| `entityResolution.attach` | mutation | `target` is `{ kind: 'record', key, create? }` or `{ kind: 'attribute', name, value }`; with `folderId` it attaches the folder, with `fileIds` (at most 500) it pins `manual_file` links. `create: true` creates a missing record with the key only; without it a missing key is `NOT_FOUND`. Returns `files`, `recordCreated` and the stage counts |
| `entityResolution.detach` | mutation | Removes a `manual_file` link (`linkId`) or a folder attachment (`attachmentId`); links made by steps are `NOT_FOUND` |
| `entityResolution.createRecord` | mutation | Creates a record with the key only, so dangling links to it become active; `BAD_REQUEST` when it exists |
| `entityResolution.fileLinks` | query | The links of one file |

### `menuItem`, `page`, `settings`

| Procedure | Kind | Auth | Purpose |
|---|---|---|---|
| `menuItem.list` | query | `userApproved` | Menu tree, built against the collection ids the user can see |
| `menuItem.create`, `update`, `remove` | mutation | `userAdmin` | CRUD |
| `menuItem.setHome` | mutation | `userAdmin` | Flags the home item |
| `menuItem.updatePositions` | mutation | `userAdmin` | Reorders and reparents |
| `page.list` | query | `userAdmin` | Pages |
| `page.findById` | query | `userApproved` | One standalone page with its blocks and the `assets` its blocks refer to, resolved for the caller |
| `page.create` | mutation | `userAdmin` | Standalone page |
| `page.createForCollection` | mutation | `userApproved` | Empty page bound to a collection the caller can edit, or the one it already has |
| `page.update` | mutation | `userAdmin` | Renames a page |
| `page.remove` | mutation | `userApproved` | Deletes a page the caller can edit |
| `page.save` | mutation | `userApproved` | Writes the whole block list in one transaction, checked with `page.canEdit(user)`: blocks are created, updated, reordered and deleted together, `data` is validated against the schema for its type, text is sanitised, and objects no longer referenced are removed afterwards |
| `page.collectionPreviews` | query | `userApproved` | Cards for the named collections, resolved for the caller, so the editor can preview a collection the moment it is chosen rather than after a save |
| `page.createUpload` | mutation | `userApproved` | Ten-minute presigned POST to `blocks/{pageId}/tmp/{uploadId}`, with a MIME allowlist and a size limit (20 MB images, 500 MB videos) |
| `page.finalizeUpload` | mutation | `userApproved` | Validates the staged upload, re-encodes images to WebP, and moves it to `blocks/{pageId}/{uuid}` |
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
