---
title: Data model
description: Every TypeORM entity with its table, key columns, relations and enums, the three materialized-path trees, the database triggers, and how to write a migration.
sidebar:
  order: 3
lastUpdated: 2026-09-21
---

This page maps the code in `server/src/entity/` and `server/src/migrations/` so you can add a column, a table or a trigger without surprises. What each object means for an administrator is in [Core concepts](../introduction/concepts.md).

## Conventions shared by every entity

- `dataSource` in `server/src/env.ts` uses the `SnakeNamingStrategy` vendored in `server/src/lib/snake-naming-strategy.ts` (from `typeorm-naming-strategies`, which does not declare TypeORM 1 as a peer): a property `assetTypeId` is the column `asset_type_id`, the entity `CollectionFile` mapped with `@Entity('collection_files')` keeps that explicit table name.
- `synchronize: false` and `migrationsRun: true`: TypeORM never alters the schema from the entities; every schema change is a migration, applied at startup before Fastify listens.
- TypeORM 1 rejects `undefined` or `null` values inside a `where` instead of silently matching every row, and refuses `update`/`delete` with empty criteria. Build the `where` conditionally, use `IsNull()`, or use a query builder for a whole-table statement.
- Every entity except `UserFavorite` and `StorageUsage` has a `uuid` primary key `id` (declared with `@PrimaryColumn()` and `@PrimaryGeneratedColumn("uuid")`, defaulting to `uuid_generate_v4()` in SQL). All but `StorageUsage` have a `createdAt`; all but `UserGroup`, `StorageUsage` and `ActivityEvent` also have an `updatedAt`.
- Enums are TypeScript string enums stored as plain `character varying` columns (`@Column({ enum: ... })`), not Postgres enum types.
- Relations are declared with both the foreign-key column (`folderId`) and the object (`folder`), so a query can filter on the id without a join.

## The entities

| Entity (file) | Table | Key columns | Relations and notes |
|---|---|---|---|
| `AssetFolder` (`asset-folder.ts`) | `asset_folders` | `name`, `status`, `sourceKey`, `externalId` (unique per `sourceKey`), `parentId`, `assetTypeId`, `assetTypeSource` (`manual`, `rule`, `inherited` or null), `assetTypeRuleId`, `path` (`/Top/Sub`, indexed, refreshed by the enrichment pass), `licenseId` | Tree. `files` (one-to-many `AssetFile`), `collections` (one-to-many `Collection`). Enum `AssetFolderStatus`: `up_to_date`, `pending_deletion` |
| `AssetSource` (`asset-source.ts`) | `asset_sources` | `key` (primary), `provider`, `label`, `root`, `lastRunStartedAt`, `lastRunFinishedAt`, `lastSuccessAt`, `lastError` | One row per configured source, rewritten at startup from `ASSET_SOURCES`; the dashboard reads it |
| `AssetFile` (`asset-file.ts`) | `asset_files` | `name`, `status`, `sourceKey`, `externalId` (unique per `sourceKey`), `externalChecksum`, `hasThumbnail`, `size` (`bigint`, read as a string), `width`, `height`, `mimeType`, `folderId`, `assetTypeId`, `licenseId`, `recordId`, `recordView` | `folder`, `assetType`, `license`, `product`, `collectionFiles`. Getters `originalStorageKey` (`asset-file/{id}`) and `thumbnailStorageKey` (`asset-file/{id}-thumbnail`). Enum `AssetFileStatus`: `creating`, `up_to_date`, `outdated`, `pending_deletion` |
| `AssetTypeRule` (`asset-type-rule.ts`) | `asset_type_rules` | `pattern`, `assetTypeId`, `enabled`, `lastError`, `createdById` | `assetType` (cascade on delete), `createdBy` (set null on delete). Read by `services/asset-type-rules.ts` |
| `AssetType` (`asset-type.ts`) | `asset_types` | `name`, `description`, `isRelatedToRecords`, `groupVariants`, `includeInSearchByDefault`, `defaultDisplay` (`grid` or `list`), `listDisplayItems` (`text[]`) | No relations declared |
| `License` (`license.ts`) | `licenses` | `name`, `details`, `usageFrom`, `usageTo` (`date`, nullable), `scopes` (`text[]`), `allowedRegionIds` (`uuid[]`) | Enum `LicenseScope`: `print`, `digital` |
| `Collection` (`collection.ts`) | `collections` | `name`, `description`, `public`, `draft`, `assetFolderId`, `parentId`, `ownerId`, `sampleFileIds` (`uuid[]`), `numberOfFiles`, `hasThumbnail`, `limitedToGroupIds` (`text[]`), `canEditLimitedToGroupIds`, `orphanedAt`, `orphanedFromName`, `orphanedReason` | Tree; partial unique index `idx_collections_parent_asset_folder` on `(parentId, assetFolderId)` where the folder is set, so one folder is mirrored at most once under a given parent while siblings may share a name; indexes on `public`, `draft`, `assetFolderId`, `parentId`, `ownerId`, `orphanedAt` (partial) and `mpath` (`text_pattern_ops`). `assetFolder`, `owner`, `files`, `invitations`, `page` (one-to-one). `numberOfFiles` and `path` (`mpath`) are `insert: false, update: false`: only the database writes them. Getters `parentCollectionIds`, `synchronized`, `thumbnailStorageKey`; method `canEdit(user)` |
| `CollectionFile` (`collection-file.ts`) | `collection_files` | `assetFileId`, `collectionId` | Unique pair `idx_collection_id_asset_id`; `collection` cascades on delete; `favorites` |
| `CollectionInvitation` (`collection-invitation.ts`) | `collection_invitations` | `collectionId`, `email`, `userId`, `invitedById`, `expiresAt` (`date`) | `collection` and invited `user` cascade on delete; deleting the creator sets `invitedById` to null; getter `hasExpired` |
| `Page` (`page.ts`) | `pages` | `name`, `collectionId` | Partial unique index on `collectionId` where not null; `collection` one-to-one, cascade; `blocks`. Method `canEdit(user)` |
| `PageBlock` (`page-block.ts`) | `page_blocks` | `pageId`, `type`, `position` (integer), `size` (`full`, `half` or `third`), `data` (`jsonb`, not null) | `page` cascades on delete; index on (`pageId`, `position`). Enum `PageBlockType`: `hero`, `collections`, `files`, `last_files`, `text`, `image`, `video`. Each type's `data` is defined by a zod schema in `server/src/page-blocks/schema.ts`, which the client imports so both sides validate the same shape |
| `MenuItem` (`menu-item.ts`) | `menu_items` | `type`, `position`, `data` (`simple-json`), `collectionId`, `pageId`, `parentId`, `home` | Tree; `collection`, `page` and `parent` cascade on delete. Enum `MenuItemType`: `collection`, `page`, `text`, `divider` |
| `DataRecord` (`data-record.ts`) | `records` | `recordKey` (unique), `keyColumnName`, `metaData` (`hstore`, mapped to an object) | `assetFiles`. Named `DataRecord` because `Record` would shadow the TypeScript utility type |
| `EnrichmentSettings` (`enrichment-settings.ts`) | `enrichment_settings` | Single row, `id` = 1: `recordLabelSingular`, `recordLabelPlural`, `viewsEnabled`, `viewSeparator`, `viewDigits`, `thumbnailView` | No relations; the label is read by the public `env` query, the view settings by `services/entity-resolution.ts` and the record list |
| `AssetTypeResolverStep` (`asset-type-resolver-step.ts`) | `asset_type_resolver_steps` | `assetTypeId`, `position`, `strategy` (`filename_regex`, `folder_regex`, later `metadata`), `config` (`jsonb`: `pattern`, `keyGroup`, `viewGroup`, `target`, `attributeName`, `valueGroup`), `enabled`, `lastError` | `assetType` (cascade on delete) |
| `AssetEntityLink` (`asset-entity-link.ts`) | `asset_entity_links` | `assetFileId`, `targetKind` (`record` or `attribute`), `recordId` (set null when the record goes), `recordKey` (kept, so a re-import re-attaches), `attributeName`, `attributeValue`, `strategy` (`filename_regex`, `folder_regex`, `manual_folder`, `manual_file`, later `csv`, `metadata`), `resolverStepId`, `sourceFolderId`, `isPrimary`, `status` (`active` or `dangling`), `createdById` | Unique on (file, kind, key, attribute, value, strategy). Written by the entity stage, except `manual_file` rows, which only the admin creates and removes. `asset_files.record_id` and `record_view` are derived from the primary link |
| `AssetFileResolution` (`asset-file-resolution.ts`) | `asset_file_resolutions` | `assetFileId` (primary), `status` (`matched`, `unmatched`, `conflict`, `not_applicable`), `candidates` (`jsonb`), `reason`, `resolvedAt` | The Unmatched queue reads it |
| `EnrichmentRun` (`enrichment-run.ts`) | `enrichment_runs` | `trigger` (`sync` or `admin`), `startedById`, `startedAt`, `finishedAt`, `stats` (`jsonb`, per stage), `error` | Written by `runEnrichmentPass`, which keeps the last 50 |
| `VariantGroup` (`variant-group.ts`) | `variant_groups` | `assetFolderId`, `assetTypeId`, `prefixKey` (the lower-case shared start, or `override:<id>`), `displayName`, `coverAssetFileId`, `memberCount` | Unique on (folder, type, prefix) so ids survive passes; status is computed at read time |
| `VariantGroupMember` (`variant-group-member.ts`) | `variant_group_members` | `assetFileId` (primary), `variantGroupId`, `axisValues` (`text[]`, one per axis position, `''` when the name is shorter) | Cascades with the file and the group |
| `VariantAxis` (`variant-axis.ts`) | `variant_axes` | `name` (null reads "Variant n"), `values` (`text[]`), `recognizer`, `ignored`, `exampleFileNames` | Unnamed axes no group uses are deleted by the pass; named or ignored ones stay |
| `VariantGroupAxis` (`variant-group-axis.ts`) | `variant_group_axes` | Primary key (`variantGroupId`, `position`), `variantAxisId` | Rebuilt by the pass where it changes |
| `VariantGroupOverride` (`variant-group-override.ts`) | `variant_group_overrides` | `kind` (`force_group`, `exclude`, `cover`), `assetFileIds` (`uuid[]`), `createdById` | Kept by file id, so they survive syncs |
| `VariantGroupingSettings` (`variant-grouping-settings.ts`) | `variant_grouping_settings` | Single row: `minPrefixLength`, `blockedTokens` | |
| `MetadataField` (`metadata-field.ts`) | `metadata_fields` | `name` (unique, such as `exif.Model` or `iptc.Keywords`), `displayName`, `valueType` (`text`, `date`, `number`, `gps`), `searchable`, `facetable`, `viewable`, `canLink`, `linkTarget` (`record_key` or `attribute`), `linkAttributeName`, `fileCount` (refreshed by the enrichment pass) | Created switched off by `services/file-metadata.ts` the first time a file carries the tag |
| `AssetFileMetadataValue` (`asset-file-metadata-value.ts`) | `asset_file_metadata_values` | Primary key (`assetFileId`, `metadataFieldId`, `valueText`); `valueDate`, `valueNumber` | One row per value, so keywords give several rows; both foreign keys cascade on delete. Indexed on (field, text) and (field, date) |
| `AssetEntityCsvMapping` (`asset-entity-csv-mapping.ts`) | `asset_entity_csv_mappings` | `importBatchId`, `fileName` (indexed on `lower(file_name)`), `targetKind`, `recordKey`, `attributeName`, `attributeValue`, `createdById` | Replaced whole by each import |
| `AssetFolderEntityAttachment` (`asset-folder-entity-attachment.ts`) | `asset_folder_entity_attachments` | `assetFolderId`, `targetKind`, `recordId`, `recordKey`, `attributeName`, `attributeValue`, `createdById` | The nearest folder carrying attachments gives them to every file below it |
| `RecordAttribute` (`record-attribute.ts`) | `record_attributes` | `name` (unique), `displayName`, `valueType` (`text`, `long_text`, `number`, `date`, `single_select`, `multi_select`, `url`; default `text`), `options` (`text[]`), `position`, `facetable`, `searchable` (indexed), `viewable` | No relations declared. Since `1790985600000-record-fields` every `hstore` key but the key column has a row; values stay text and are checked against `valueType` on write |
| `RecordChange` (`record-change.ts`) | `record_changes` | `recordId` (`SET NULL` on delete), `recordKey`, `action` (`create`, `update`, `delete`), `source` (`grid`, `panel`, `bulk`, `csv`, `unmatched`, `attribute`), `changes` (`jsonb`, `{ field: { old, new } }`), `changedById` (`SET NULL`), `importBatchId`, `createdAt` | One row per record per operation, never pruned. Indexed on `(record_id, created_at DESC)` and on `import_batch_id` |
| `Region` (`region.ts`) | `regions` | `name`, `defaultGroupId` | `defaultGroup`, `users` |
| `Group` (`group.ts`) | `groups` | `name`, `default` | `userGroups` |
| `User` (`user.ts`) | `users` | `name`, `company`, `email` (unique), `emailVerified`, `emailVerificationCode`, `password`, `resetPasswordToken` (hash), `resetPasswordExpiresAt` (`timestamptz`), `authVersion`, `role`, `approved`, `maintenanceContact`, `lastLoginAt` (`timestamptz`, written by `user.me`), `regionId` | `region`, `userGroups` (cascade insert), `favorites`, `invitations`. Enum `UserRole`: `admin`, `manager`, `member`, `guest` (default) |
| `UserGroup` (`user-group.ts`) | `user_groups` | `userId`, `groupId` | Join table; both sides cascade on delete |
| `UserFavorite` (`user-favorite.ts`) | `user_favorites` | Composite primary key `userId` + `collectionFileId` | Both sides cascade on delete. A favourite therefore names a file **as seen in one collection**, not the file itself: deleting that `collection_files` row destroys the favourite, which is what happens to every favourite of a file whenever the sync moves it to another folder |
| `UserCollectionFavorite` (`user-collection-favorite.ts`) | `user_collection_favorites` | Composite primary key `userId` + `collectionId`, `createdAt` (`timestamptz`) | `user`, `collection`, both cascade on delete; index `idx_user_collection_favorites_collection` on `collection_id` |
| `AuthorizedDomain` (`authorized-domain.ts`) | `authorized_domains` | `domain`, `detail` | No relations declared |
| `StorageUsage` (`storage-usage.ts`) | `storage_usage` | Single row, `id` = 1: `usedBytes`, `reservedBytes` (`bigint`, read as strings), `measuredAt`, `alertLevel`, `diskAlertLevel`, `quotaReachedAt`, `orphanObjects`, `orphanBytes`, `orphansRemovedAt` | No relations. Written by `services/storage.ts` only: the measure job rewrites `usedBytes` and clears `reservedBytes` only when `pgboss.job` has no active `asset/update-content` job (pg-boss must therefore share `DATABASE_URL`), `asset/update-content` reserves and commits sizes with conditional `UPDATE` statements |
| `ActivityEvent` (`activity-event.ts`) | `activity_events` | `userId`, `type`, `assetFileId`, `collectionId` (all three nullable), `metadata` (`jsonb`: `downloadId` and `downloadType` for downloads, `query` and `total` for searches, `invitationId` for shares), `createdAt` (`timestamptz`) | `user`, `assetFile`, `collection`, each `ON DELETE SET NULL` so an event outlives what it names. Enum `ActivityEventType`: `login`, `asset_view`, `asset_download`, `search`, `collection_share`, `favorite`. Append-only: inserted by the routers where the action happens, read with raw SQL by `trpc/router/analytics.ts`, deleted by `services/analytics.ts` |
| `Download` (`download.ts`) | `downloads` | `userId`, `collectionFileIds` (`uuid[]`), `status`, `type`, `imageFormat`, `imageResolution`, `videoFormat`, `videoResolution`, `expiresAt` | `user`. Getter `storageKey` (`downloads/{id}`). Enums `DownloadStatus` (`preparing`, `ready`, `failed`, `expired`), `DownloadType` (`direct`, `email`), `DownloadImageFormat` (`original`, `png`, `jpg`, `webp`), `DownloadImageResolution` and `DownloadVideoResolution` (`high`, `medium`, `low`), `DownloadVideoFormat` (`original`, `mp4`, `webm`) |

## Three trees use a materialized path

`AssetFolder`, `Collection` and `MenuItem` are declared with `@Tree('materialized-path')`, `@TreeParent()` and `@TreeChildren()`. TypeORM stores the ancestry in an `mpath` column as the dot-separated list of ancestor ids ending with a dot, and `dataSource.getTreeRepository(Entity)` loads trees, ancestors and descendants (`findTrees`, `findAncestorsTree`, `findDescendants` in `trpc/router/asset.ts`). `Collection` and `MenuItem` also expose the column read-only as `path`; the code filters descendants with `ILike('%<id>.%')` on it and the triggers below split it with `string_to_array(mpath, '.')`. `AssetFolder` does not map `mpath` to a property.

Deleting a parent `Collection` or `MenuItem` cascades to its children (`@TreeParent({ onDelete: 'CASCADE' })`); `AssetFolder` has no cascade: `deleteFolder` in `services/asset.ts` loads the folder subtree, deletes its files, hands the folder ids to `destroySynchronizedCollections` and removes the folder rows in one transaction.

TypeORM's `save()` is never used to move a node: it does not rewrite the paths of the subtree, and an item saved together with its new parent gets a root-like path. Every move goes through `reparentSubtree` in `services/collection.ts`, which rewrites `mpath` and `parent_id` of the node and its descendants in one SQL statement, refuses a move inside the node's own subtree, and works for the three trees. Menu items are created one at a time with their `parent` relation set, so the path is derived from a stored parent. The three `mpath` columns have a `text_pattern_ops` index for the prefix matches this needs.

## Triggers keep two collection columns up to date

The triggers below maintain `collections.number_of_files` and `collections.sample_file_ids` on file changes. They do not follow path rewrites, so `recomputeCollectionRollups` in `services/collection.ts` recounts both columns from `collection_files` for a given set of collections after every move or rescue (the old and new ancestor chains), and for every collection in the nightly integrity check. Migrations create these PL/pgSQL functions and triggers:

| Function | Trigger | Fires on | Effect |
|---|---|---|---|
| `refresh_collection_number_of_files_on_insert()` | `refresh_collection_number_of_files_on_insert` | `after insert on collection_files` | Adds 1 to `number_of_files` of the collection and every ancestor found in its `mpath` |
| `refresh_collection_number_of_files_on_delete()` | `refresh_collection_number_of_files_on_delete` | `after delete on collection_files` | Subtracts 1 on the same set |
| `refresh_collection_sample_files()` | `refresh_collection_sample_files_on_insert`, `refresh_collection_sample_files_on_update` | `after insert` / `after update on collection_files` | Recomputes `sample_file_ids`: up to 4 collection file ids whose asset file `has_thumbnail`, for the collection and its ancestors |
| `refresh_collection_sample_files_from_asset_files()` | `refresh_collection_sample_files_from_asset_files_on_insert`, `..._on_update` | `after insert` / `after update on asset_files` | Same recomputation, triggered when a file gains or loses its thumbnail. Created by `1751012487660-add-trigger-to-sample-files`, rewritten by `1751187976556-update-asset-file-trigger` with `create or replace function` |
| `inherit_collection_groups()` | `inherit_collection_groups` | Before collection insert or changes to parent/group fields | Locks the parent row and copies its group restriction to the child; inherited restrictions cannot be changed on the child |
| `propagate_collection_groups()` | `propagate_collection_groups` | After a collection’s group list changes | Updates direct children; their triggers carry the change down the tree |

The first three come from `1726844037002-initial-migration`, which also creates every table with `uuid_generate_v4()` defaults (extension `uuid-ossp`), the `hstore` column of `products` (now `records`), and seeds one group and the `Global` region.

## Writing a migration

Migrations are hand-written TypeORM classes in `server/src/migrations/`, named `<unix-ms-timestamp>-<kebab-slug>.ts`, with raw SQL in `up` and the reverse in `down`. The `migrations` glob in `env.ts` picks up any file there; TypeORM runs them in timestamp order and records them in the `migrations` table.

```ts
import { MigrationInterface, QueryRunner } from "typeorm";

export class AddDetailsToLicenses1744549674740 implements MigrationInterface {
    name = 'AddDetailsToLicenses1744549674740'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "licenses" ADD "details" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "licenses" DROP COLUMN "details"`);
    }
}
```

Steps for a schema change:

1. Edit or add the entity class; use snake_case in SQL and camelCase in TypeScript, and let the naming strategy match them.
2. Add the migration file. The class name is the slug in PascalCase followed by the timestamp; the optional `name` property must equal it when present.
3. Start the server (`npm run dev`): the migration runs before the server listens, and a failure exits the process.
4. Add a row to the migrations table in [Upgrading](../deployment/upgrading.md) and update this page.

`npm run typeorm` is `typeorm-ts-node-commonjs`, the TypeORM CLI over the TypeScript sources. The existing migrations have the shape `migration:generate` produces, but no generate command is recorded in the repository and generation against `src/env.ts` has not been verified; hand-writing the file as above is the known path. `down` methods exist, but the documented rollback in [Upgrading](../deployment/upgrading.md) is a database restore.

Mosaic selection prioritises files directly in the current collection, then descendant files by creation date; it does not sort all descendant levels by depth. There is no sample-file trigger for `collection_files` deletion, so the integrity check may be needed to remove stale ids.

## Client branding

Admin logo policy is environment-controlled and has no mutable database setting. Migration `1789776000000-host-controlled-branding` removes the earlier preview `admin_branding` table. Client logo bytes are stored at `settings/client-logo.webp` in the main bucket; staged uploads use `settings/client-logo-temp/{userId}/{uploadId}`. Replacement and removal use the `branding/client-logo` transaction advisory lock to prevent races.
