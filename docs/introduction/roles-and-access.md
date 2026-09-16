---
title: Roles and access
description: The four user roles, email verification and account approval, and the exact rule that decides which collections and files a user can see or edit.
sidebar:
  order: 3
lastUpdated: 2026-09-16
---

This page gives you the access model as the server enforces it: roles, account approval, regions and groups, the collection visibility rule, edit rights and guest invitations.

## Four roles

| Role | How you get it | What you can see | What you can manage |
| --- | --- | --- | --- |
| `admin` | Set by another admin | Every public collection, including drafts, plus own collections | Everything: settings, menu, collections, pages, assets, asset types, licenses, users, groups, regions, authorized domains, products, attributes |
| `manager` | Set by an admin | Same as a member | Users of their own region: list, approve, edit, delete, assign groups. Cannot grant `admin` or `manager`, cannot edit, approve or delete an admin or another manager, cannot change their own role or region |
| `member` | Default role at sign-up | Public non-draft collections allowed by their region and groups, own collections, invited collections | Their own private collections, favorites, downloads, invitations on collections they own |
| `guest` | Created automatically by an invitation | Only invited collections, collections limited to a group they belong to, and their own | Client exposes downloads and hides collection editing/menu; API also permits creation and management of own collections. Favorites are refused server-side |

The admin area (`Back to the DAM` sidebar) shows all sections to admins and only the Users section to managers.

## Accounts need email verification and approval

Every account carries two flags, and most procedures require both to be `true` (`userApproved` in `server/src/trpc/index.ts`):

- `emailVerified`: set when the user follows the link sent by the `mailer/email-verification` job. While it is `false` the client shows "An email has been sent with a link to confirm your account" with a resend button.
- `approved`: set at sign-up if the email domain is in the authorized domains list, otherwise by an admin or a manager of the user's region. While it is `false` (and the email is verified) the client shows "Please wait until your account is approved". Once the email is verified, the `email/request-approval` job notifies approvers; approval sends `email/user-approved`.

An invitation creates guest accounts with `approved` and `emailVerified` already set to `true`. See [Users and approval](../administration/users-and-approval.md).

## Regions and groups

A user belongs to exactly one region (`regionId`). Regions matter in two places: managers only see and edit users of their own region, and licenses list the regions allowed to use licensed content. Each region has a `defaultGroupId`; members join that group at sign-up. Guests created by an invitation start with no groups.

Groups are plain sets of users. A collection with a non-empty `limitedToGroupIds` is visible only to members of those groups (and to its owner, admins and invitees). See [Groups and regions](../administration/groups-and-regions.md).

## The collection visibility rule

`userCollectionsQuery` in `server/src/services/collection.ts` first checks whether any of these grants access:

1. The user is the collection's `ownerId`.
2. The user is an `admin` and the collection is `public` (drafts included).
3. The user is a `member` or `manager`, and the collection is `public`, not `draft`, has an empty `limitedToGroupIds`.
4. The user belongs to at least one group in `limitedToGroupIds`.
5. The user holds an invitation, not yet expired (`expiresAt > now()`), on the collection itself or on any of its ancestors.

After those checks, every non-admin user must meet the licence’s region and date conditions, including owners, group members and invitees. A draft is visible only to its owner or an admin. `userCollectionFilesQuery` applies the same access rules to files and checks each file’s licence instead of the folder’s.

Search, the sidebar tree, the menu and downloads all go through these two queries, so a collection you cannot see cannot be reached by id either.

## Edit rights

`Collection.canEdit(user)` is `true` when the user is an `admin` or is the collection's `ownerId`. Nothing else grants edit rights: groups and invitations give read access only. Pages inherit the rule from their collection, and pages without a collection are admin-only.

`canEditLimitedToGroupIds` is not part of `canEdit`. It controls whether the group restriction of this particular collection may be changed. When a collection is saved, its whole subtree receives the same `limitedToGroupIds`, and each descendant gets `canEditLimitedToGroupIds = true` only if that list is empty. Database triggers enforce inheritance for existing descendants and new children, including copies and synchronised collections.

Non-admins can only create private collections (`public = false`) owned by themselves; admins can create public ones, which have no owner. The `public` flag cannot be changed after creation.

See [Collections and sharing](../administration/collections-and-sharing.md) and [Licenses](../administration/licenses.md).

## Guests and invitations

Any approved user who can edit a collection can invite an email address to it with an expiry date and optionally send the `mailer/invitation` email. If the address matches an existing user, that user gains access through rule 5 with their current role. If not, a guest account is created with `name` and `company` set to `NA`, the inviter's region, no groups, and both `emailVerified` and `approved` set to `true`.

A newly created guest has no password. Invitation JWT links and the magic-link flow provide the initial login, including when passwordless mode is off. In the client, a guest sees the collections they can access (other than their own) instead of the menu, lands on the first of them, and can select and download files. The favorites endpoints reject guests server-side (`userMember`), and the "add to collection" action is hidden. Removing the invitation, or letting it expire, removes that invitation access path; other group/owner grants and already issued S3 links remain independent; deleting a user also deletes every invitation addressed to their email.

## Authorized domains

Admins maintain a list of email domains. At sign-up, if the new user's domain is in the list, `approved` is set to `true` immediately and no approval request is sent. The user still has to verify their email address. See [Users and approval](../administration/users-and-approval.md).

## Dates

Licence dates are inclusive: a licence ending today remains valid throughout the PostgreSQL session’s current date. Invitations expire at the start of their selected end date. See [Licenses](../administration/licenses.md) and [Accounts and links](../administration/accounts-and-links.md).
