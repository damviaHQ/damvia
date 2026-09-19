---
title: Core concepts
description: The objects an administrator manipulates in Damvia, where each one comes from, and how they relate.
sidebar:
  order: 2
lastUpdated: 2026-09-19
---

This page describes the domain model behind the admin screens: what an asset, a collection, a page or a product is, and which of them you control versus which are mirrored. Access rules are in [Roles and access](./roles-and-access.md).

## Who owns what

| Object | Where it comes from | Who manages it |
| --- | --- | --- |
| Asset folders, asset files | Mirrored from the cloud storage every 5 minutes | Nobody edits them in Damvia; admins assign asset types and licenses |
| Asset types | Created in the admin | Admin |
| Licenses | Created in the admin | Admin |
| Collections | Created by admins (public) or by any approved user (private), or generated from an asset folder | Owner or admin |
| Collection files | Inserted by synchronisation or by "add to collection" | Owner or admin (only on non-synchronised collections) |
| Pages and page blocks | Created in the admin | Admin, or the owner of the linked collection |
| Menu items | Created in the admin, plus one per public root collection automatically | Admin |
| Products, product attributes | CSV import in the admin; links to files computed by `PRODUCT_MATCHING_REGEX` | Admin |
| Regions, groups, authorized domains | Created in the admin | Admin |
| Users, invitations | Sign-up, or automatically by an invitation (there is no admin "create user" action) | Admin, manager (own region), collection owner for invitations |
| Downloads | Created by users when they download a selection | Expire automatically after 7 days |

## Asset folders and asset files mirror the storage

An asset folder or asset file is one entry of the cloud storage, identified by its `externalId` (the Dropbox, OneDrive or Google Drive item id). Folders form a tree using a materialized path.

File `status` values are `creating` (just discovered, content not fetched yet), `up_to_date`, `outdated` (flagged for re-fetch, today only by the daily integrity check) and `pending_deletion`. Folder `status` values are `up_to_date` and `pending_deletion`. The `asset/process-deletion` job deletes `pending_deletion` rows, their S3 objects and any collection bound to the folder.

Both folders and files can carry an asset type (`assetTypeId`) and a license (`licenseId`). A new folder, or a folder that moved, inherits both from its parent; a file inherits both from its folder on every sync. Files also store `hasThumbnail`, `width`, `height`, `mimeType` and `size`, and may link to a product (`productId`) with a `productView`.

## Collections are the unit of publication

A collection is a named tree node (materialized path, unique `name` under a `parentId`) with:

- `public`: `true` for the shared catalogue, `false` for a user's own collection. Public collections have no owner; private ones belong to `ownerId`. The flag cannot be changed after creation.
- `draft`: hides a public collection from members while it is being prepared.
- `assetFolderId`: when set, the collection is synchronised. Its name follows the folder name, its files are the folder's files, and its children are generated from the sub-folders by the `collection/synchronization` queue. Files cannot be added to or removed from a synchronised collection.
- `limitedToGroupIds` and `canEditLimitedToGroupIds`: restrict visibility to members of the listed groups; see [Roles and access](./roles-and-access.md).
- `sampleFileIds`: up to four collection file ids refreshed by database triggers and the integrity check (deletion alone can leave stale ids), used to draw the thumbnail mosaic when no custom thumbnail is uploaded (`hasThumbnail`).
- `numberOfFiles`: maintained by insert and delete triggers on `collection_files`; the application never writes it.

## Collection files are join rows

A collection file links one asset file to one collection; the pair is unique. Favorites, downloads and search results all point at collection files, not at asset files, which is why the same asset can appear in several collections and be favourited in each.

## Pages and menu items shape the navigation

A page is an editorial layout attached to at most one collection (`collectionId` is unique). It is made of blocks of type `collections`, `files`, `last_files`, `text`, `image` or `video`, each placed on a grid by `column`, `row` and `width`. Image and video blocks upload their media to the main bucket under `blocks/{pageId}/{uuid}`.

Menu items build the sidebar. Their `type` is `collection`, `page`, `text` or `divider`; they nest via a materialized path and are ordered by `position`. At most one item is selected as `home` through `menuItem.setHome` and becomes the landing view. A menu entry is created automatically for every public root collection.

## Products and attributes drive search facets

A product has a unique `productKey`, the name of the column it came from (`primaryKeyName`), and a `metaData` key/value store (Postgres `hstore`) holding every other CSV column. Each column is declared as a product attribute with three flags: `facetable` (shown as a filter), `searchable` (matched by the search bar) and `viewable` (displayed on the file). Every 5 minutes, the `asset/assign-products-to-asset-files` job applies `PRODUCT_MATCHING_REGEX` to every file name; capture group 1 is matched against `productKey` and capture group 2 becomes `productView`.

## Asset types and licenses classify files

An asset type (`name`, `description`) says what kind of content a folder holds and how to display it: `isRelatedToProducts` enables product views, `includeInSearchByDefault` preselects it in search, `defaultDisplay` is `grid` or `list`, and `listDisplayItems` lists the fields shown in list view.

A license (`name`, `details`) limits usage: `scopes` is any of `print` and `digital`, `usageFrom` and `usageTo` bound the validity period, and `allowedRegionIds` lists the regions that may see licensed files. Both are assigned to asset folders in the admin and inherited by files.

## Regions, groups, users and invitations

A user belongs to exactly one region and to any number of groups. Each region names a default group for members who sign up. Guests created by invitations start with no groups. An invitation grants one email address access to one collection until `expiresAt`, creating a guest account if the address is unknown. Details are in [Roles and access](./roles-and-access.md).

## Downloads are prepared archives

A download records the `collectionFileIds` requested, the chosen `imageFormat` (`original`, `png`, `jpg`, `webp`), `imageResolution`, `videoFormat` (`original`, `mp4`, `webm`) and `videoResolution` (`high`, `medium`, `low`), and a `type` of `direct` or `email`. Its `status` moves from `preparing` to `ready` when the `download/create-archive` job has built the archive, then to `expired` 7 days after creation, when `download/process-expired` deletes the object.

## Two S3 buckets

The main bucket (`MAIN_S3_URL`) holds what users upload in the app: collection thumbnails at `collections/{id}-thumbnail`, page block media at `blocks/{pageId}/{uuid}` and the login background at `settings/auth-background.webp`. The assets bucket (`ASSETS_S3_URL`) is a cache of the cloud storage: originals at `asset-file/{id}`, WebP thumbnails at `asset-file/{id}-thumbnail` and download archives at `downloads/{id}`. The worker keeps the total size of both buckets in the single-row `storage_usage` table for the admin [dashboard](../administration/dashboard.md) and the `STORAGE_QUOTA` plan.
