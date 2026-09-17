---
title: Collections and sharing
description: How collections are built, synchronized with folders, kept up to date by triggers, and shared with guests.
sidebar:
  order: 8
lastUpdated: 2026-09-17
---

A collection is the unit users browse: a named node in a tree that holds files and child collections. Public collections make up the catalogue and are managed by admins; private collections belong to one user. Either kind can be synchronized with a folder of the assets tree, or assembled by hand.

## The collection model

Collections live in `collections`, a materialized-path tree (`mpath`) with a unique `(parent_id, name)` pair.

| Column | Meaning |
| --- | --- |
| `public` | Part of the catalogue; public collections have no owner |
| `draft` | Visible only to admins and the owner |
| `owner_id` | The user who owns a private collection; null for public ones |
| `asset_folder_id` | When set, the collection mirrors that folder and is "synchronized" |
| `limited_to_group_ids`, `can_edit_limited_to_group_ids` | Group restriction; see [Groups and regions](./groups-and-regions.md) |
| `sample_file_ids` | Up to 4 file ids used as the folder preview, maintained by triggers |
| `number_of_files` | Count of files in the collection and its descendants, maintained by triggers |
| `has_thumbnail` | A custom thumbnail exists under `collections/{id}-thumbnail` in the main bucket |

Files are rows of `collection_files` (`collection_id`, `asset_file_id`, unique together).

## The admin screen

`/admin/collections` (admin only) shows the public tree returned by `collection.treeAdmin`, with a `page`, `draft` or `thumbnail` badge per node and `Edit` / `Delete` actions. `Add new collection` opens the creation dialog. The delete confirmation explains that no file is removed from cloud storage.

## Create a collection

| Procedure | Who | Result |
| --- | --- | --- |
| `collection.create` | approved users | Manual collection. Non-admins always get `public = false`, `draft = false`, owner = themselves. Admins can pass `public`/`draft`; a child inherits both from its parent. |
| `collection.createFromAsset` | admin | Synchronized collection named after the folder; pushes `collection/synchronization` |
| `collection.createUserCollection` | approved users | Private collection (owner = the user), optionally under one of their own collections |
| `collection.addItems` | owner or admin | Copies files or whole collections into a manual collection; refused on synchronized ones (`Synchronized folders cannot be changed.`) |

## Synchronization mirrors a folder

The `collection/synchronization` queue (one job at a time) runs `synchronizeCollection` in `server/src/services/collection.ts` inside a transaction:

1. Renames the collection to the folder's name and refreshes its menu items.
2. Upserts one `collection_files` row per file of the folder and deletes rows that no longer match.
3. Upserts one child collection per subfolder (matching on `parent_id` and `name`), copying `public`, `draft` and `owner_id` from the parent, and deletes children that no longer have a subfolder.
4. Pushes one synchronization job per child, so the same process copies the folder structure all the way down the tree.

Jobs are triggered by `createFromAsset` and by the asset updater whenever a folder is created, renamed or moved (`upsertFolder`). Independently, `server/src/index.ts` runs this after every sync pass:

```sql
INSERT INTO collection_files (asset_file_id, collection_id)
SELECT asset_files.id, collections.id FROM asset_files
INNER JOIN collections ON collections.asset_folder_id = asset_files.folder_id
ON CONFLICT DO NOTHING
```

It back-fills any file that reached a linked folder between two synchronizations.

## Triggers keep counts and previews fresh

- `number_of_files` is incremented or decremented on every insert or delete in `collection_files`, for the collection and all its ancestors read from `mpath` (initial migration).
- `sample_file_ids` is recomputed by the function `refresh_collection_sample_files_from_asset_files`, fired after insert and update on `asset_files` (migrations `1751012487660-add-trigger-to-sample-files.ts` and `1751187976556-update-asset-file-trigger.ts`). For the affected collection and its ancestors it selects up to 4 `collection_files` whose asset has a thumbnail, prioritising files in the collection itself, then descendant files by creation date (not every descendant depth). The daily `system/integrity-check` job recomputes the same field for every collection.

## Edit and delete

`collection.update` requires `canEdit` (admin or owner) and changes `name`, `description`, `draft`, `hasThumbnail` and, when allowed, `limitedToGroupIds`. The public flag cannot change (`Cannot change the public status of a collection.`). Draft, owner and group limits are copied to every descendant, menu items are re-synced, and the thumbnail object is removed when `hasThumbnail` is false. `collection.presignedThumbnailUploadUrl` returns a 24-hour PUT URL for `collections/{id}-thumbnail` in the main bucket.

`collection.removeFiles` refuses files of synchronized collections; `collection.remove` refuses a collection whose parent is synchronized (`Synchronized collections cannot be deleted.`). Deleting a collection removes its thumbnail object and cascades to children, files, invitations, menu items and its page.

## Private collections

`collection.ListPrivateCollections` returns the tree of collections where `public` is false and `owner_id` is the caller. This is the "my collections" area where members copy files with `addItems`.

## How collection invitations work

The sharing dialog (`CollectionDialogShare.vue`) is available to the collection owner or an admin. It asks for the guest's email address and an expiry date, initially set to 30 days ahead. The date must be in the future. The two buttons create the invitation in different ways:

- `Send Invite` creates the invitation with `sendEmail: true`. A job on `mailer/invitation` sends a link to `/collections/{id}?dam_token=<jwt>`; the client stores that token in the `dam_token` cookie, so the guest is logged in on arrival.
- `Copy Link` creates the invitation silently and copies a URL carrying `auth_params` (base64 of the email, `magicLink: true` and the collection). Opening it pre-fills the login form and sends a login email.

On the server, `collection.invitation.create` looks up a user with that email. If none exists, `createGuestUser` creates one with `name` and `company` set to `NA`, role `guest`, `approved` and `emailVerified` true, the inviter's region and no group memberships. The invitation stores `collection_id`, `email`, `user_id`, `invited_by_id` and `expires_at`. The creator is retained for the admin activity feed; deleting that account sets `invited_by_id` to null without revoking the guest's invitation.

For revocation, `collection.invitation.remove` deletes the row. `collection.invitation.getUserInvitations` feeds the member links dialog with invitations on the caller's collections (and, for admins, on all public ones). Deleting a user deletes the invitations sent to their email.

## Who can see a collection

`userCollectionsQuery` grants access when any of these holds:

| Rule | Condition |
| --- | --- |
| Owner | `owner_id` is the user |
| Admin | user is `admin` and the collection is public (drafts included) |
| Public | user is `member` or `manager`, collection is public and not draft, has no group limit, and the folder license allows the user's region today |
| Group | one of the user's groups is in `limited_to_group_ids` |
| Invitation | an unexpired invitation for the user exists on the collection or on any ancestor in `mpath` |

Every non-admin user must also meet the licence’s region and date conditions, regardless of which access rule applies. Only admins and owners can see drafts. Files follow the same rules through `userCollectionFilesQuery`, with the licence read from the file. Copying a collection includes only the descendants and files the caller can currently access. See [Licenses](./licenses.md) for the license clause and [Menu and pages](./menu-and-pages.md) for how public collections appear in the navigation.

## Operational limits

New children and copies inherit their destination parent’s group restrictions. See [Groups and regions](./groups-and-regions.md). Preview triggers do not cover `collection_files` deletions; the integrity check repairs stale mosaics. Invitation expiry is the start of the selected date in PostgreSQL's session timezone; it does not include the entire day. Already issued storage URLs are independent of invitation revocation.

## Admin interface

The Collections screen uses the shared admin controls and a full-width tree with square row backgrounds. An empty library offers an explicit empty state. Editing refreshes the same collection tree query used by this screen.

Collection creation uses keyboard-operable buttons for Custom and Synchronized choices. The collection editor groups its heading, wraps thumbnail controls on small screens and uses the shared action footer.
