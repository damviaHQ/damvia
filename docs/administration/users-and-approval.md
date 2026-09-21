---
title: Users and approval
description: Approve accounts, assign roles, groups and regions, and remove access without confusing verification with approval.
sidebar:
  order: 3
lastUpdated: 2026-09-20
---

An account normally needs two independent conditions before it can use the library: its email must be verified and the account must be approved. Roles then decide what the person can administer; regions, groups, collection rules and file licences decide what content they can see.

## Verification and approval are separate

At sign-up, Damvia creates a member in the selected region and adds the region's default group. It sends a verification email. The new account is approved immediately only when its email domain is in the authorised-domain list; otherwise it waits for an admin or manager.

After verification, Damvia emails the admins and managers in the same region to request approval. If that region has no admin or manager, no approval request can be delivered. Give every active region at least one responsible approver.

The first account cannot approve itself. Promote it through the database as described in [First admin](../getting-started/first-admin.md), then add the organisation's authorised domains and regional approvers.

## Approve a user

Open `/admin/users`. A verified, unapproved account shows an **Approve** action. Approval enables normal access and sends the user-approved email.

Managers see and change users only in their own region. They may approve members and guests, edit their name/company/groups, and remove eligible accounts. They cannot grant `admin` or `manager`, change their own role or region, or change/remove another manager or admin.

Admins can manage every region and assign all roles. Before granting an administrative role, check whether the person also receives sensitive operational data or maintenance email.

## Choose the role

| Role | Administrative scope |
|---|---|
| `admin` | All settings, content, assets, products, people, storage and reporting. Admins are exempt from file-licence restrictions. |
| `manager` | Users in their own region only. Content access is otherwise like a member. |
| `member` | No admin area; may maintain their private collections and invitations for collections they own. |
| `guest` | Created for sharing. Reads invited/otherwise permitted collections; the client hides collection editing and favourites. |

Changing a role does not replace collection, group or licence checks. See [Roles and access](../introduction/roles-and-access.md).

## Assign region and groups

Every user has one region and may have several groups. The selected region controls which managers can administer the account and which licences permit the user to see a file. Groups grant access to restricted collection branches.

Changing a region does not automatically remove manually assigned groups. Review both when moving someone between markets or business units. Guests created from an invitation start with no groups and use the inviter's region for licence checks.

## Authorise a domain

An authorised email domain makes future sign-ups from that domain approved immediately; users still need to verify their address. Use exact organisational domains and review the list after acquisitions, rebrands or contractor changes.

Removing a domain affects only future sign-ups. It does not revoke existing accounts.

## Password and passwordless modes

With normal authentication, accounts use a password and receive verification/reset emails. Passwords are stored with scrypt and a separate random salt; older supported hashes are upgraded on successful login.

With `ENABLE_PASSWORD_LESS_AUTH=true`, sign-up has no password and login emails a time-limited link. Existing password hashes are not erased, and changing the flag should be tested with existing accounts before rollout. Invitation links can also trigger the email-login flow regardless of the global mode.

Changing `APP_SECRET` invalidates every current session and signed login/invitation JWT. Password resets also invalidate earlier sessions for that account. See [Accounts and links](./accounts-and-links.md).

## Maintenance contacts

An admin can be designated to receive customer-facing storage and maintenance email. This is distinct from `SERVER_ALERT_EMAILS`, which identifies the people operating the host and controls server-disk alerts/visibility.

Ensure at least one active admin is a maintenance contact when storage alerts are enabled. Removing or demoting the last contact leaves customer-level alerts without a recipient.

## Remove an account carefully

Before removal, inspect:

- private collections owned by the account;
- invitations sent to or created by the account;
- pending downloads;
- administrative or maintenance-contact responsibilities.

Deletion can fail while private collections still reference the owner. Reassign or delete those collections first. Removing a user deletes their invitations and downloads; prepared download objects are also removed. Deleting the invitation creator does not revoke invitations they sent when the invitation remains otherwise valid.

## Search and export

The Users screen supports text search, role/region/status filters and CSV export of the displayed administrative fields. Treat exports as personal data: store them temporarily, restrict access and delete them according to the organisation's retention policy.

When diagnosing why someone cannot enter, check in this order: email verification, approval, current session validity, role/region, group membership, collection rule, then file licence. Admin accounts are poor test subjects for the last step because they bypass licence checks.
