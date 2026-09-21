---
title: Groups and regions
description: Model organisational access with one region per user, multiple groups and inherited collection restrictions.
sidebar:
  order: 4
lastUpdated: 2026-09-20
---

Regions and groups answer different questions. A region determines who administers a user and which file licences allow them. Groups determine which restricted collection branches they can open.

## Regions define administrative and licence scope

Every account belongs to exactly one region. Managers can administer users only in their own region, and each file licence lists the regions allowed to use that file.

Each region also has a default group. New members who select that region at sign-up join its default group. Guests created through an invitation use the inviter's region for licence checks but start with no groups.

The initial database contains a `Global` region and `Default` group. Replace or extend them to match the organisation before inviting a large number of users.

Before removing a region:

1. Review the number of users and licences attached to it.
2. Move its users to the intended replacement region.
3. Update licences that should include the replacement.
4. Confirm each affected region still has an approver.

Removing a region strips it from licence rules, which can hide files from moved users until the replacement region is explicitly allowed.

## Groups restrict collection branches

A user may belong to several groups. A collection with no group restriction follows its ordinary public/owner/invitation rules. A restricted collection is visible through that rule only to users who belong to at least one allowed group.

Group restrictions inherit down the collection tree. New manual, copied and synchronised children take the parent's restriction, and later changes propagate to descendants. A moved synchronised branch takes the restriction of its new parent.

Only the collection owner or an admin can edit its allowed groups. Public collections have no owner, so admins control their restrictions.

## Groups and licences do not replace each other

| Rule | Attached to | Result |
|---|---|---|
| Group restriction | Collection | Narrows access through that collection branch. |
| Licence region/date | File | Narrows access everywhere the file appears. |

A group can let someone open a collection while a file licence still hides some files inside it. Copying an unrestricted file into a restricted collection does not licence that file; it may remain visible through another collection. See [Licences](./licenses.md).

## Change membership deliberately

Adding someone to a group can expose every permitted non-draft descendant in each branch restricted to that group. Removing the membership can remove those branches immediately, except where public, ownership or invitation rules provide another access path.

When merging or deleting a group, move its users and any regional default-group references first. Then update collection restrictions that name it. Test with a non-admin account from each affected region; admins bypass file licences and can see public drafts.

For the full combination of roles, invitations, drafts, groups and licences, see [Roles and access](../introduction/roles-and-access.md).
