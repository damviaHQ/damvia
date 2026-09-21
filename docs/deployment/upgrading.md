---
title: Upgrading
description: Pull, build, restart; migrations run on their own at startup.
sidebar:
  order: 6
lastUpdated: 2026-09-21
---

To upgrade an instance, rebuild the server image and client files, then deploy them together. There is no migrate command: TypeORM is configured with `migrationsRun: true` and applies every pending migration from `server/src/migrations/` before the HTTP server starts listening.

## Procedure

1. Take a consistent database/main-bucket/configuration backup as described in [Backups](./backups.md). Record the running image id and preserve it under a rollback tag before rebuilding `latest`: `docker image tag "$(docker inspect --format='{{.Image}}' damvia-server)" damvia-server:rollback-before-upgrade`. Also retain the old client bundle. Migrations have `down` methods, but the recovery plan is a matching-version restore.
2. Pull the new version:
   ```bash
   git pull
   ```
3. Rebuild and restart the server:
   ```bash
   docker build -t damvia-server:latest server/
   docker stop damvia-server && docker rm damvia-server
   docker run -d --name damvia-server --env-file /srv/damvia/server.env -e ENABLE_WORKER=true --restart unless-stopped -p 127.0.0.1:3000:3000 damvia-server:latest
   ```
   Watch the logs: migrations run first; a migration error exits the process before it listens, and the previous image can be started again after a restore.
4. Rebuild and redeploy the client:
   ```bash
   cd client && npm install && npm run build
   ```
   then copy `client/dist/` to the static host. Deploy the client **after** the server, since the client is built against the server's tRPC types and may call procedures the old server does not have.
5. Check `docs/reference/environment-variables.md` of the new version (or the diff of `server/.env.template`) for new variables.

## pg-boss 12 in this upgrade

- The server needs **Node 22.12 or newer**: `node:22-bookworm` already resolves to a newer 22.x, but check a host that runs the server outside Docker.
- pg-boss 11 dropped the migration path from the pg-boss 10 tables. At its first start this version detects a `pgboss` schema older than version 25, renames it to `pgboss_legacy_v10`, lets pg-boss 12 create a fresh `pgboss` schema, and re-enqueues the jobs that were still `created` or `retry` (emails, content processing, collection synchronisation, archives). Cron jobs are registered again on their own. The log shows `pg-boss schema retired` and `pg-boss legacy jobs replayed` with the count per queue.
- Nothing is dropped. Once the instance runs correctly, free the space with `DROP SCHEMA pgboss_legacy_v10 CASCADE;`. If a schema of that name already exists from an earlier attempt, the server refuses to start and says so; drop or rename it, then start again.
- Completed jobs are now deleted after seven days instead of being archived; `pgboss.job` keeps the same `name` and `state` columns, so the queries in [Operations](./operations.md) still work.
- To roll back to the previous release after this migration ran, restore the old tables before starting the old image: `ALTER SCHEMA pgboss RENAME TO pgboss_v12; ALTER SCHEMA pgboss_legacy_v10 RENAME TO pgboss;`. Jobs queued while the new version ran stay in `pgboss_v12`.

## Insights in this upgrade

- The migration creates an empty `activity_events` table. [Insights](../administration/analytics.md) and the Last Login column of Users fill from the first request after the restart; nothing is rebuilt from earlier downloads.
- Events older than `ANALYTICS_RETENTION_DAYS` (365 by default) are deleted every night. Set the variable before the upgrade if the instance's privacy policy requires a shorter period.
- The client must be rebuilt with the server: it is the client that reports file views.

## Sources in this upgrade

- The migration adds `source_key` to `asset_folders` and `asset_files` and replaces the unique constraint on `external_id` by a unique index on (`source_key`, `external_id`). It rewrites no rows.
- At the first start, the rows of an instance with one configured source are stamped with that source's key (`onedrive`, `dropbox` or `googledrive` without `ASSET_SOURCES`), logged as `asset source adopted existing assets`. Ids, collections and downloaded copies are kept; the first run changes nothing.
- `ASSET_SOURCES` can then declare more folders and accounts, see [Sources](../integrations/sources.md). Keep the provider name as the key of the existing source, and never let two sources on one account overlap. A later change of key or removal of a source stops the server until `rename-source` or `remove-source` has dealt with the old rows.
- Once the storage plan is reached, downloads now pause for every source, including files that would still fit, until a measurement finds room; before, smaller files kept trickling in. See [Dashboard](../administration/dashboard.md).
- Adding sources raises the sync memory by about 1 MB per 1,000 items in the largest source, see [Worker and scaling](./worker-and-scaling.md#memory-and-disk).

## OneDrive in this upgrade

- The OneDrive driver keeps the same tree and the same `eTag` checksum as before, so the upgrade re-parents, re-downloads and deletes nothing. Before upgrading, note the top-level rows with `SELECT name, external_id FROM asset_folders WHERE parent_id IS NULL;` and check after the first run that they are unchanged.
- The driver now reads all delta pages before writing, upserts parents before children, stops on an empty listing, and skips the deletion pass when any item failed. A run that used to abort on a OneNote notebook or another non-file item now skips that item.
- Startup logs a `OneDrive drive` check; a Graph error there no longer stops the server. See [OneDrive](../integrations/onedrive.md).
- A Google Drive driver is available (`ASSET_UPDATER=googledrive`), see [Google Drive](../integrations/google-drive.md). Nothing changes for existing instances.
- The Dropbox driver was rebuilt on the same model. Without `DROPBOX_ROOT_PATH` the library now hangs under one folder named `Dropbox`, so the first run re-parents every top-level folder under it (their mirrored collections are queued for synchronisation, nothing is deleted), empty folders are no longer stored, placeholder folders (`generated_/...`) are no longer created and are marked for deletion on the first run, and a changed `content_hash` now re-downloads the file. See [Dropbox](../integrations/dropbox.md).

## Storage plan in this upgrade

- The migration creates the `storage_usage` table with its single row. The first measurement runs at the next half hour; open the [dashboard](../administration/dashboard.md) and click "Measure now" to fill it right away.
- Set `STORAGE_QUOTA` to the customer's plan, below the disk size, to enable the alerts and the pause of the cloud sync. See [Server configuration](../configuration/server-env.md).
- Click "Measure now" on the dashboard as soon as the upgraded server is running with `STORAGE_QUOTA`. Until the first measurement the stored usage is 0, so up to one plan's worth of files can still download on top of what the buckets already hold.
- Files stored before the upgrade stay. If they already exceed the plan, the dashboard shows more than 100 % and new downloads wait until space is freed or the plan is raised.
- Add the `storage-alert` and `disk-alert` templates to `mailconfig.json` or to the `MAILCONFIG` variable; the samples are in `server/mailconfig.json`. Until they are added, the alerts are skipped, the worker logs `storage.alert-template-missing` or `storage.disk-alert-template-missing` every 30 minutes, and the alert is sent at the first measurement after the template is added and the server restarted.
- Designate at least one admin for the `storage-alert` emails: tick "Receives storage and maintenance emails" on their profile in Users. Nobody receives them until then.
- Set `SERVER_ALERT_EMAILS` to the hosting contact to receive disk alerts and see the server disk on the dashboard. Customer admins never see it.
- The daily integrity check now deletes orphan objects older than 24 hours. Objects left behind by earlier crashes disappear at the next 05:00 UTC run or with `npm run cli -- check-integrity`.

Downtime includes maintenance, migrations and verification. Measure it on a restored copy; no duration is guaranteed.

## Account and access changes in this upgrade

Before restarting, set a randomly generated `APP_SECRET` of at least 32 bytes. The server and CLI validate it at startup; `openssl rand -hex 32` generates a suitable value.

- Users must sign in again. Existing session and email login links are replaced by newly issued links; pending password resets must be requested again.
- Passwords continue to work. Their stored hashes are upgraded on successful login; new and reset passwords use scrypt.
- Collection descendants inherit their parent’s group restrictions. The migration updates existing descendants as well as enforcing inheritance for future children.
- Guests start with no groups. The migration removes existing guests from their region’s default group. Review guests who intentionally need that group and explicitly reassign it after the upgrade; other memberships are preserved.
- Licence dates and allowed regions apply to every non-admin user, including owners and invitees. Start and end dates are inclusive. Drafts are visible only to admins and their owner.

Back up first and apply the migration with application writers stopped. Validate a restricted collection, an invited guest and an administrator before reopening access.

## Variants in this upgrade

- No asset type groups its variants until an admin ticks **Group variants** on it; nothing changes for readers before that.
- Search now asks for grouped results, so on a type that groups its variants a search shows one card per creative and totals count a group once.

## File metadata in this upgrade

- Images are read for EXIF and IPTC metadata as they are downloaded. For the images already in the library, run `npm run cli -- metadata:backfill` once after the restart, off-peak on a large library: it queues one `asset/extract-metadata` job per image, which reads the copy in the assets bucket without asking the cloud source.
- Fields appear switched off on **Data enrichment → Fields**, tab **File metadata**; nothing changes for readers until an admin switches one on. The Attributes screen moved to the first tab of Fields; its old address redirects.
- The server has a new dependency, `exif-reader`, installed by `npm ci`; no system package is added.

## Matching in this upgrade

- Keep `PRODUCT_MATCHING_REGEX` and `PIM_PRODUCT_VIEW` set for the first start: the migration copies the regex into a File name step of every asset type marked Related to records, and the view into Settings. Types that are not marked get no step; mark them in Asset types, then add a step on the Matching screen, or use its **Use PRODUCT_MATCHING_REGEX** button.
- The first pass after the restart finds the existing links in place and changes no `record_id` on files the step agrees with. Files of record-related types that no step can match appear in the new Unmatched queue.
- The old every-5-minutes job keeps linking the files no step owns. Set `ENABLE_LEGACY_PRODUCT_MATCHING=false` once every record-related type has steps; the two variables can then be removed.
- Search lists each file once even when it sits in several collections, and facet counts count files rather than collection entries: totals can drop on instances where the same folder is mirrored by more than one collection.

## Records in this upgrade

- Products are called records in the code, the database, the API and the documentation. What people see keeps the word "Products" until an administrator changes the record label in **Settings** (`/admin/settings`). Settings is now the last entry of the admin menu.
- The admin routes `/admin/products`, `/admin/products/import` and `/admin/products/attributes` redirect to their new addresses under `/admin/data-enrichment/`.
- The tRPC procedures moved: `pim.listProducts` is `record.list`, `pim.removeAllProducts` is `record.removeAll`, `pim.updateProduct` is `record.update`, `productAttribute.*` is `recordAttribute.*`, `asset.listProductViews` is `asset.listRecordViews`, and the search input and facets say `recordViews`. Deploy the client with the server.
- `PRODUCT_MATCHING_REGEX` and `PIM_PRODUCT_VIEW` keep their names for now.
- Readers who had chosen the "Product view" column in their saved display preferences pick it again, as its id changed.

## Folder rules in this upgrade

- The migration stores the path of every folder and marks every typed folder as set by hand when its type differs from its parent's. Nothing is re-typed: the first enrichment pass after the restart writes only the `inherited` mark on the other folders, which is why it can report thousands of folders updated on a large library while no file changes type.
- Rules start empty. Until an administrator adds one on `/admin/folder-rules`, typing by hand and inheritance behave as before, with one change: a folder typed by hand now keeps its type when it is moved in the cloud storage.
- The pass runs after each sync in the API process and holds an advisory lock for its duration; on a library of 100,000 folders it takes a few seconds.

## Collection nesting in this upgrade

- Synchronized collections are now identified by the folder they mirror (`asset_folder_id`), no longer by their name. The unique `(parent_id, name)` constraint is dropped; the migration first retires rows that mirrored the same folder twice under one parent (an artefact of the old rename race), keeping the oldest and moving custom collections found under the others to it (those that were more than one level down are flagged `duplicate_mirror` so an admin can put them back where they belong), then adds a unique index on `(parent_id, asset_folder_id)`.
- `mpath` of `collections` and `menu_items` is rebuilt from `parent_id`, and `number_of_files` is recounted for every collection. On a large library this is a full scan of `collection_files`; run the upgrade off-peak.
- Three nullable columns are added to `collections`: `orphaned_at`, `orphaned_from_name`, `orphaned_reason`. They mark custom collections re-homed after their synchronized parent disappeared, and synchronized collections whose folder moved somewhere ambiguous. See [Collections and sharing](../administration/collections-and-sharing.md#custom-collections-inside-a-synchronized-tree).
- A synchronization no longer deletes child collections. Removal happens only when a folder leaves the cloud storage and the `asset/process-deletion` job runs. If you relied on a synchronization to prune collections whose folder still exists, delete them from the admin screen.
- Rolling this migration back re-adds the name constraint; siblings sharing a name are renamed with a ` (2)`, ` (3)` suffix first.

## Migrations that exist

| Migration | What it did |
|---|---|
| `1726844037002-initial-migration` | Full schema, triggers for `number_of_files` and `sample_file_ids`, seeds the `Default` group and the `Global` region |
| `1727629957517-add-searchable-to-product-attributes` | `searchable` flag on product attributes |
| `1744549674740-add-details-to-licenses` | `details` text and nullable start/end dates on licenses |
| `1750670845530-add-limited-to-group-ids-to-collections` | Group restriction on collections |
| `1750683595547-create-user-groups` | Many-to-many user groups, migrating the previous single `group_id` |
| `1750687616986-add-edit-to-limited-groups` | `can_edit_limited_to_group_ids` on collections |
| `1751012487660-add-trigger-to-sample-files` | Trigger refreshing collection sample thumbnails |
| `1751187976556-update-asset-file-trigger` | Same trigger, also fired on `asset_files` updates |
| `1789516800000-secure-access` | Reset deadlines, account session versions, collection group inheritance and guest membership updates |
| `1789603200000-storage-usage` | `storage_usage` table: measured and reserved bytes, plan and disk alert levels, sync pause and orphan cleanup timestamps; `maintenance_contact` flag on `users` |
| `1789689600000-admin-branding` | `admin_branding` single-row table choosing the logo of the admin area |
| `1789776000000-host-controlled-branding` | Drops `admin_branding`: the host decides with `ADMIN_CLIENT_LOGO` instead |
| `1789862400000-track-invitation-creator` | `invited_by_id` on `collection_invitations`, filled with the collection owner for existing invitations |
| `1789948800000-activity-events` | `activity_events` table with its four indexes, feeding Insights; `last_login_at` on `users` |
| `1790035200000-collection-favorites` | `user_collection_favorites` table (each user's starred collections) with its index on `collection_id`; starts empty |
| `1790208000000-page-block-layout` | Rewrites `page_blocks` for the new page editor: adds `position` and `size`, converts `data` from text to `jsonb` with one shape per block type, and drops `row`, `column` and `width`. Reading order is preserved; a row that held two blocks becomes two `half` blocks, three becomes `third`, anything else becomes `full`. Text alignment chosen in the old editor is dropped, since the new editor has no alignment control. Rolling this migration back puts every block on a row of its own and deletes `hero` blocks, which the old schema cannot represent |
| `1790121600000-asset-sources` | `source_key` on `asset_folders` and `asset_files` (empty for existing rows, adopted at the next start), unique index on (`source_key`, `external_id`) replacing the unique `external_id`, and the `asset_sources` table holding each configured source's last run |
| `1790899200000-enrichment-runs` | `enrichment_runs`, empty; filled by each pass. Rolling back drops it |
| `1790812800000-variant-groups` | `group_variants` on `asset_types` (false), `variant_groups`, `variant_group_members`, `variant_axes`, `variant_group_axes`, `variant_group_overrides` and the single-row `variant_grouping_settings`. Rolling back drops them and the column |
| `1790726400000-file-metadata` | `metadata_fields`, `asset_file_metadata_values` and `asset_entity_csv_mappings`, empty. Rolling back drops them |
| `1790640000000-entity-links` | `asset_type_resolver_steps`, `asset_entity_links`, `asset_file_resolutions`, `asset_folder_entity_attachments`; the view columns of `enrichment_settings`. Backfills one `filename_regex` link per file of a record-related type that has a `record_id`, seeds a first `filename_regex` step from `PRODUCT_MATCHING_REGEX` for every record-related type, and copies `PIM_PRODUCT_VIEW` into the thumbnail view. Rolling back drops the four tables and the view columns; `asset_files.record_id` is untouched |
| `1790553600000-records` | Renames `products` to `records` (`product_key` to `record_key`, `primary_key_name` to `key_column_name`), `product_attributes` to `record_attributes`, `asset_files.product_id` and `product_view` to `record_id` and `record_view`, `asset_types.is_related_to_products` to `is_related_to_records`; rewrites the `product_attribute.` prefix of `list_display_items` to `record_attribute.`; creates the single-row `enrichment_settings` table holding the record label. Renames only; rolling back reverses them |
| `1790380800000-asset-folder-paths` | `path` on `asset_folders`, backfilled from the tree, with `idx_asset_folders_path` |
| `1790467200000-asset-type-rules` | `asset_type_rules` table; `asset_type_source` and `asset_type_rule_id` on `asset_folders`. Existing typed folders whose type differs from their parent's, and typed roots, are marked `manual`; the others `inherited`. Rolling back drops the table and the three columns and loses nothing the previous version reads |
| `1790294400000-collection-nesting` | `orphaned_at`, `orphaned_from_name` and `orphaned_reason` on `collections`; retires duplicate mirrors of one folder under one parent; rebuilds `mpath` of `collections` and `menu_items` from `parent_id`; recounts `number_of_files`; drops the unique `(parent_id, name)` constraint and adds the partial unique index `idx_collections_parent_asset_folder` on `(parent_id, asset_folder_id)` plus `text_pattern_ops` indexes on the `mpath` of `collections`, `menu_items` and `asset_folders` |

TypeORM records applied migrations in the `migrations` table; the same migration never runs twice.

## Database permissions

Migrations create tables, functions and triggers, and pg-boss creates the `pgboss` schema on first start. The `DATABASE_URL` user needs ownership of the database or `CREATE` on it. The `uuid-ossp` extension supplies UUID defaults and `hstore` stores product metadata; on managed Postgres where extensions need a superuser, create it once by hand:

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS hstore;
```

## Rolling back

Stop all application writers, restore the coordinated recovery point and restart the saved image with its matching client and configuration. Inspect storage-related migration changes; stable object ids alone do not guarantee cross-version compatibility. Follow [Backups](./backups.md) and verify jobs and media before reopening access.

## Version drift between client and server

The client is built against the server package in the same checkout (`"server": "file:../server"`). Always build both from the same commit. A client from a newer commit can call a procedure the running server does not define and gets a `NOT_FOUND` error from tRPC.
