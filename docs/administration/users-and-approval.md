---
title: Users and approval
description: Approve accounts, assign roles, groups and regions, and remove access without confusing verification with approval.
sidebar:
  order: 3
lastUpdated: 2026-09-27
---

An account normally needs two independent conditions before it can use the library: its email must be verified and the account must be approved. Roles then decide what the person can administer; regions, groups, collection rules and file licences decide what content they can see.

## Verification and approval are separate

At sign-up, Damvia creates a member in the selected region and adds the region's default group. It sends a verification email. The new account is approved immediately only when its email domain is in the authorised-domain list; otherwise it waits for an admin or manager.

After verification, Damvia emails every admin and the managers of the user's region to request approval, with a link to the user's page in `/admin/users`. Only approved, verified and not suspended admins and managers receive it. Give every active region a manager, or rely on the admins.

The first account cannot approve itself. Promote it through the database as described in [First admin](../getting-started/first-admin.md), then add the organisation's authorised domains and regional approvers.

## Approve a user

Open `/admin/users`. A verified, unapproved account shows an **Approve** action. Approval enables normal access and sends the user-approved email, which carries a single-use sign-in link valid 7 days. An account that has not verified its email address cannot be approved; ask the user to follow the verification email, or resend it with `user.resendVerificationEmailFor`.

Managers see and change users only in their own region. They may approve members and guests, edit their name/company/groups, and remove eligible accounts. They cannot grant `admin` or `manager`, change anyone's region (their own included), change another user's email address, or change/remove another manager or admin.

Admins can manage every region and assign all roles. Only an admin changes another user's email address; the change ends that user's sessions, cancels their pending reset and email links, and sends a verification email to the new address. Before granting an administrative role, check whether the person also receives sensitive operational data or maintenance email. To require two-step verification for administrative roles, set `MFA_REQUIRED_ROLES=admin,manager`; see [Accounts and links](./accounts-and-links.md#two-step-verification).

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

With normal authentication, accounts use a password and receive verification/reset emails. Passwords are stored with scrypt and a separate random salt, and must be 12 to 128 characters.

With `ENABLE_PASSWORD_LESS_AUTH=true`, sign-up has no password and login emails a single-use link valid 15 minutes. Existing password hashes are not erased, and changing the flag should be tested with existing accounts before rollout. Invitation links can also trigger the email-login flow regardless of the global mode.

A password reset ends every session of that account. Session lifetimes, lockout and two-step verification are described in [Accounts and links](./accounts-and-links.md).

## Maintenance contacts

An admin can be designated to receive customer-facing storage and maintenance email. This is distinct from `SERVER_ALERT_EMAILS`, which identifies the people operating the host and controls server-disk alerts/visibility.

Ensure at least one active admin is a maintenance contact when storage alerts are enabled. Removing or demoting the last contact leaves customer-level alerts without a recipient.

## Act on an account without deleting it

Open a user from the Users screen (`/admin/users/{id}`). The **Account access** section of the details dialog holds these actions. It appears for accounts you may manage: admins see it on every account but their own, managers on members and guests of their region.

| Action | Procedure | Effect |
|---|---|---|
| Suspend access | `user.suspend` | Asks for confirmation, then blocks every sign-in and email, ends every session, cancels pending email links and stops the account's download links. Data is kept. Nobody can suspend their own account. The list shows a **Suspended** badge. |
| Restore access | `user.resume` | Lifts a suspension and clears a sign-in lockout. |
| Sign out everywhere | `user.revokeSessions` | Ends every session of the account. |
| Send password reset | `user.sendPasswordResetFor` | Sends the reset-password email. Refused for a suspended account. |
| Resend verification email | `user.resendVerificationEmailFor` | Shown while the email is unverified. Sends the verification email again. |
| Reset two-step verification | `user.resetMfa` | Admins only, shown when the account has two-step verification on. Removes the enrolment and ends every session. The user enrols again at next sign-in if their role requires it. |

Managers and admins can also approve and suspend from a phone; see [Phones](./phones.md).

Suspension is the reversible way to cut someone off, for example while an incident is investigated or when a person leaves but their collections must stay.

## Remove an account carefully

Before removal, inspect:

- private collections owned by the account;
- invitations sent to or created by the account;
- pending downloads;
- administrative or maintenance-contact responsibilities.

Removing a user deletes their personal (private) collections, the invitations addressed to their email and their downloads; prepared download objects are also removed. Common (public) collections they owned are kept without an owner. Move anything worth keeping out of their personal collections first. Deleting the invitation creator does not revoke invitations they sent when the invitation remains otherwise valid. If the account may be needed again, suspend it instead.

## Search and export

The Users screen supports text search, role/region/status filters and CSV export of the displayed administrative fields. For a periodic access review, **Export access review** in the Users screen header saves `access-review-YYYY-MM-DD.csv`: `user.accessReview` returns a CSV of every account the caller can list (a manager: every account of their region) with the columns `email`, `name`, `company`, `role`, `region`, `groups`, `approved`, `email_verified`, `mfa`, `mfa_required`, `suspended_at`, `last_login_at` and `created_at`. Cells starting with `=`, `+`, `-` or `@` are prefixed with `'` so a spreadsheet does not run them as formulas. Treat exports as personal data: store them temporarily, restrict access and delete them according to the organisation's retention policy.

When diagnosing why someone cannot enter, check in this order: suspension, sign-in lockout, email verification, approval, two-step verification, current session validity, role/region, group membership, collection rule, then file licence. Admin accounts are poor test subjects for the last step because they bypass licence checks.
