---
title: Data model
description: Every TypeORM entity with its table, key columns, relations and enums, the three materialized-path trees, the database triggers, and how to write a migration.
sidebar:
  order: 3
lastUpdated: 2026-09-16
---

This page maps the code in `server/src/entity/` and `server/src/migrations/` so you can add a column, a table or a trigger without surprises. What each object means for an administrator is in [Core concepts](../introduction/concepts.md).

## Conventions shared by every entity

- `dataSource` in `server/src/env.ts` uses `SnakeNamingStrategy` from `typeorm-naming-strategies`: a property `assetTypeId` is the column `asset_type_id`, the entity `CollectionFile` mapped with `@Entity('collection_files')` keeps that explicit table name.
- `synchronize: false` and `migrationsRun: true`: TypeORM never alters the schema from the entities; every schema change is a migration, applied at startup before Fastify listens.
- Every entity except `UserFavorite` has a `uuid` primary key `id` (declared with `@PrimaryColumn()` and `@PrimaryGeneratedColumn("uuid")`, defaulting to `uuid_generate_v4()` in SQL). All have a `createdAt`; all but `UserGroup` also have an `updatedAt`.
- Enums are TypeScript string enums stored as plain `character varying` columns (`@Column({ enum: ... })`), not Postgres enum types.
- Relations are declared with both the foreign-key column (`folderId`) and the object (`folder`), so a query can filter on the id without a join.

## The entities

| Entity (file) | Table | Key columns | Relations and notes |
|---|---|---|---|
| `AssetFolder` (`asset-folder.ts`) | `asset_folders` | `name`, `status`, `externalId` (unique), `parentId`, `assetTypeId`, `licenseId` | Tree. `files` (one-to-many `AssetFile`), `collections` (one-to-many `Collection`). Enum `AssetFolderStatus`: `up_to_date`, `pending_deletion` |
| `AssetFile` (`asset-file.ts`) | `asset_files` | `name`, `status`, `externalId` (unique), `externalChecksum`, `hasThumbnail`, `size` (`bigint`, read as a string), `width`, `height`, `mimeType`, `folderId`, `assetTypeId`, `licenseId`, `productId`, `productView` | `folder`, `assetType`, `license`, `product`, `collectionFiles`. Getters `originalStorageKey` (`asset-file/{id}`) and `thumbnailStorageKey` (`asset-file/{id}-thumbnail`). Enum `AssetFileStatus`: `creating`, `up_to_date`, `outdated`, `pending_deletion` |
| `AssetType` (`asset-type.ts`) | `asset_types` | `name`, `description`, `isRelatedToProducts`, `includeInSearchByDefault`, `defaultDisplay` (`grid` or `list`), `listDisplayItems` (`text[]`) | No relations declared |
| `License` (`license.ts`) | `licenses` | `name`, `details`, `usageFrom`, `usageTo` (`date`, nullable), `scopes` (`text[]`), `allowedRegionIds` (`uuid[]`) | Enum `LicenseScope`: `print`, `digital` |
| `Collection` (`collection.ts`) | `collections` | `name`, `description`, `public`, `draft`, `assetFolderId`, `parentId`, `ownerId`, `sampleFileIds` (`uuid[]`), `numberOfFiles`, `hasThumbnail`, `limitedToGroupIds` (`text[]`), `canEditLimitedToGroupIds` | Tree; unique `(parentId, name)` as `idx_parent_id_name`; indexes on `public`, `draft`, `assetFolderId`, `parentId`, `ownerId`. `assetFolder`, `owner`, `files`, `invitations`, `page` (one-to-one). `numberOfFiles` and `path` (`mpath`) are `insert: false, update: false`: only the database writes them. Getters `parentCollectionIds`, `synchronized`, `thumbnailStorageKey`; method `canEdit(user)` |
| `CollectionFile` (`collection-file.ts`) | `collection_files` | `assetFileId`, `collectionId` | Unique pair `idx_collection_id_asset_id`; `collection` cascades on delete; `favorites` |
| `CollectionInvitation` (`collection-invitation.ts`) | `collection_invitations` | `collectionId`, `email`, `userId`, `expiresAt` (`date`) | `collection` and `user` cascade on delete; getter `hasExpired` |
| `Page` (`page.ts`) | `pages` | `name`, `collectionId` | Partial unique index on `collectionId` where not null; `collection` one-to-one, cascade; `blocks`. Method `canEdit(user)` |
| `PageBlock` (`page-block.ts`) | `page_blocks` | `pageId`, `type`, `column`, `row`, `width` (integers), `data` (`simple-json`) | `page` cascades on delete. Enum `PageBlockType`: `collections`, `files`, `last_files`, `text`, `image`, `video` |
| `MenuItem` (`menu-item.ts`) | `menu_items` | `type`, `position`, `data` (`simple-json`), `collectionId`, `pageId`, `parentId`, `home` | Tree; `collection`, `page` and `parent` cascade on delete. Enum `MenuItemType`: `collection`, `page`, `text`, `divider` |
| `Product` (`product.ts`) | `products` | `productKey` (unique), `primaryKeyName`, `metaData` (`hstore`, mapped to an object) | `assetFiles` |
| `ProductAttribute` (`product-attribute.ts`) | `product_attributes` | `name` (unique), `displayName`, `facetable`, `searchable` (indexed), `viewable` | No relations declared |
| `Region` (`region.ts`) | `regions` | `name`, `defaultGroupId` | `defaultGroup`, `users` |
| `Group` (`group.ts`) | `groups` | `name`, `default` | `userGroups` |
| `User` (`user.ts`) | `users` | `name`, `company`, `email` (unique), `emailVerified`, `emailVerificationCode`, `password`, `resetPasswordToken` (hash), `resetPasswordExpiresAt` (`timestamptz`), `authVersion`, `role`, `approved`, `regionId` | `region`, `userGroups` (cascade insert), `favorites`, `invitations`. Enum `UserRole`: `admin`, `manager`, `member`, `guest` (default) |
| `UserGroup` (`user-group.ts`) | `user_groups` | `userId`, `groupId` | Join table; both sides cascade on delete |
| `UserFavorite` (`user-favorite.ts`) | `user_favorites` | Composite primary key `userId` + `collectionFileId` | Both sides cascade on delete |
| `AuthorizedDomain` (`authorized-domain.ts`) | `authorized_domains` | `domain`, `detail` | No relations declared |
| `Download` (`download.ts`) | `downloads` | `userId`, `collectionFileIds` (`uuid[]`), `status`, `type`, `imageFormat`, `imageResolution`, `videoFormat`, `videoResolution`, `expiresAt` | `user`. Getter `storageKey` (`downloads/{id}`). Enums `DownloadStatus` (`preparing`, `ready`, `expired`), `DownloadType` (`direct`, `email`), `DownloadImageFormat` (`original`, `png`, `jpg`, `webp`), `DownloadImageResolution` and `DownloadVideoResolution` (`high`, `medium`, `low`), `DownloadVideoFormat` (`original`, `mp4`, `webm`) |

## Three trees use a materialized path

`AssetFolder`, `Collection` and `MenuItem` are declared with `@Tree('materialized-path')`, `@TreeParent()` and `@TreeChildren()`. TypeORM stores the ancestry in an `mpath` column as the dot-separated list of ancestor ids ending with a dot, and `dataSource.getTreeRepository(Entity)` loads trees, ancestors and descendants (`findTrees`, `findAncestorsTree`, `findDescendants` in `trpc/router/asset.ts`). `Collection` and `MenuItem` also expose the column read-only as `path`; the code filters descendants with `ILike('%<id>.%')` on it and the triggers below split it with `string_to_array(mpath, '.')`. `AssetFolder` does not map `mpath` to a property.

Deleting a parent `Collection` or `MenuItem` cascades to its children (`@TreeParent({ onDelete: 'CASCADE' })`); `AssetFolder` has no cascade: `deleteFolder` in `services/asset.ts` recurses into children and files itself and deletes the collections bound to the folder.

## Triggers keep two collection columns up to date

The application never writes `collections.number_of_files`, and rewrites `collections.sample_file_ids` only in the integrity check (`services/system.ts`). Migrations create these PL/pgSQL functions and triggers:

| Function | Trigger | Fires on | Effect |
|---|---|---|---|
| `refresh_collection_number_of_files_on_insert()` | `refresh_collection_number_of_files_on_insert` | `after insert on collection_files` | Adds 1 to `number_of_files` of the collection and every ancestor found in its `mpath` |
| `refresh_collection_number_of_files_on_delete()` | `refresh_collection_number_of_files_on_delete` | `after delete on collection_files` | Subtracts 1 on the same set |
| `refresh_collection_sample_files()` | `refresh_collection_sample_files_on_insert`, `refresh_collection_sample_files_on_update` | `after insert` / `after update on collection_files` | Recomputes `sample_file_ids`: up to 4 collection file ids whose asset file `has_thumbnail`, for the collection and its ancestors |
| `refresh_collection_sample_files_from_asset_files()` | `refresh_collection_sample_files_from_asset_files_on_insert`, `..._on_update` | `after insert` / `after update on asset_files` | Same recomputation, triggered when a file gains or loses its thumbnail. Created by `1751012487660-add-trigger-to-sample-files`, rewritten by `1751187976556-update-asset-file-trigger` with `create or replace function` |
| `inherit_collection_groups()` | `inherit_collection_groups` | Before collection insert or changes to parent/group fields | Locks the parent row and copies its group restriction to the child; inherited restrictions cannot be changed on the child |
| `propagate_collection_groups()` | `propagate_collection_groups` | After a collection’s group list changes | Updates direct children; their triggers carry the change down the tree |

The first three come from `1726844037002-initial-migration`, which also creates every table with `uuid_generate_v4()` defaults (extension `uuid-ossp`), the `hstore` column of `products`, and seeds one group and the `Global` region.

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
