---
title: Groups and regions
description: What regions and groups are for, how users get them, and how groups restrict collections.
sidebar:
  order: 3
lastUpdated: 2026-09-16
---

Regions and groups are the two axes Damvia uses to segment users. A region is chosen at sign-up and drives manager scope and license visibility; groups are memberships that can lock a collection to a subset of users. Both screens are admin only.

## Regions

A region is a row of `regions` with a `name` and a mandatory `default_group_id`. The `/admin/regions` table shows `Name`, `Default Group`, `Licenses` (number of licenses whose `allowed_region_ids` contains the region) and `Users` (number of users in the region).

| Field | Rule |
| --- | --- |
| `name` | 1 to 80 characters, required |
| `defaultGroupId` | Required; the group every new user of this region joins |

The initial migration creates one region named `Global` whose default group is the first group in the table.

### Remove a region

`region.remove` refuses to delete the last region (`Cannot remove the last region.`) and refuses while users are attached (`Region has users. Please move them first.`). The screen opens a `Move Users` dialog that calls `region.moveUsers`, which sets `region_id` on every user of the source region to the target region. This move does not replace the users' group memberships. Once empty, deletion also removes the region id from `allowed_region_ids` of every license that referenced it, inside one transaction.

### What a region scopes

- **Sign-up**: the form's `Region *` select lists every region; the value is required.
- **Managers**: a manager only lists, approves, edits and removes users of their own region, and approval request emails go to managers and admins of the requester's region. See [Users and approval](./users-and-approval.md).
- **Licenses**: a licensed folder or file is only visible to a member whose `region_id` is in the license's `allowed_region_ids`. See [Licenses](./licenses.md).
- **Guests**: a guest created by an invitation is placed in the inviter's region.

## Groups

A group is a row of `groups` with a `name` and a `default` boolean. Membership is stored in `user_groups` (`user_id`, `group_id`), which cascades on group deletion.

| Procedure | Role | Effect |
| --- | --- | --- |
| `group.list` | admin, manager | Used by the user edit form to fill the `Groups` field |
| `group.create`, `group.update` | admin | Name only, 1 to 80 characters |
| `group.setDefault` | admin | Clears the flag on the current default group and sets it on the chosen one |
| `group.remove` | admin | Refuses the default group (`Cannot remove default group.`) and any group still referenced by users or as a region default |
| `group.moveUsersAndRegions` | admin | Moves every `user_groups` row and every `regions.default_group_id` from one group to another |

When a removal is blocked, the screen opens `Move Users and Regions` and asks for a target group before deleting.

:::note
The `default` flag on a group and the `default_group_id` on a region are two separate things. New users are placed in their region's default group by `createUser`; the group-level flag is only what `setDefault` toggles and what the list marks as `(Default)`.
:::

## How a user gets their groups

- At sign-up and when a guest is created for an invitation, the user joins `regions.default_group_id` of their region (`createUser` and `createGuestUser` in `server/src/services/user.ts`).
- An admin can replace the full list of groups of any user from the Edit User dialog. A manager can do the same for other users of their region, but not for themselves.
- Group changes are applied by deleting the user's `user_groups` rows and inserting the new list in one transaction.

## Groups restrict collections

Every collection carries `limited_to_group_ids` (an array of group ids, empty by default) and `can_edit_limited_to_group_ids` (true by default). The visibility query in `server/src/services/collection.ts` combines them with the other rules:

| Clause | Who it applies to | Condition |
| --- | --- | --- |
| Public | members and managers | `public` is true, `draft` is false, `limited_to_group_ids` is empty, and the license check passes |
| Group | every role, including guests | The set of the user's group ids overlaps `limited_to_group_ids` |
| Admin | admins | Every public collection, whatever the groups |
| Owner and invitation | every role | Unchanged by groups |

Two consequences follow directly from the SQL:

- As soon as a collection has at least one group, it disappears from the generic public clause. Only members of those groups (or admins, the owner, or invited guests) still see it.
- The group clause has no draft or license condition. A user in one of the allowed groups sees the collection even when it is a draft or its license does not cover their region.

### Saving group restrictions updates existing sub-collections

When `collection.update` saves `limitedToGroupIds`, it copies the same array to every descendant collection and sets their `can_edit_limited_to_group_ids` to true only if the array is empty. An existing descendant updated this way cannot loosen or change the restriction: `update` ignores `limitedToGroupIds` on a collection whose flag is false. Clearing the groups on the parent re-enables editing on the children.

Only the collection owner or an admin can call `update` (`Collection.canEdit` in `server/src/entity/collection.ts`). Public collections have no owner, so in practice only admins set group limits on them. Details on the rest of the collection model are in [Collections and sharing](./collections-and-sharing.md).

New child collections created manually, through synchronisation or duplication do not consistently inherit group restrictions. Visibility is checked per collection, so a restricted parent does not protect an unrestricted child. Reapply the parent restriction and verify every descendant after creation; This manual check is needed each time; the parent's restriction alone does not protect a new child.

`group.moveUsersAndRegions` does not rewrite collections' `limited_to_group_ids`. Before removing or merging a group, inventory those arrays and explicitly review the affected collection permissions.
