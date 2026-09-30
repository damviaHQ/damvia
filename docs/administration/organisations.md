---
title: Organisations
description: Record the company each user works for, so its members act as one team in the features that need it.
sidebar:
  order: 20
lastUpdated: 2026-09-30
---

An organisation is the company a user works for: a subsidiary, a distributor, a retailer or an agency. It answers a different question from regions and groups. A region decides who administers a user and which licences allow them. Groups decide which collection branches they can open. An organisation says which people form one team, so that what belongs to the team is shared by all of its members.

Organisations change no access rule on their own. They are used by features that need a team rather than a person, such as a module where a distributor sends one forecast, filled in by several of its people. See [Modules](../contributing/modules.md).

## Create organisations

Open **Organisations** under **User Management** (`/admin/organisations`). Only admins see it and change the list.

- **Add organisation** creates one. A name has 1 to 80 characters, and two organisations cannot share a name, whatever its case: `Brandfolio` and `BRANDFOLIO` are the same organisation.
- **Rename** changes the name everywhere it is shown.
- **Remove** deletes the organisation. Its users keep their account, their region and their groups, and belong to no organisation. Data a module kept for that organisation follows the rules of that module.

The list shows how many users belong to each organisation. A manager who reads it, to choose the organisation of a user, only counts the users of their region.

## Put users in an organisation

A user belongs to one organisation, or to none. Open the user from **Users**, choose it under **Organisation** and save. **No organisation** takes the user out of it.

Admins set the organisation of anyone. Managers set it for the members and guests of their region, as they set their groups: they choose among every organisation, and cannot create one. A manager does not change their own organisation, nor that of another manager or an admin.

The organisation is not the **Company** field. **Company** is the free text people type when they sign up, and they can change it from their account. The organisation is chosen from the list by an admin or a manager, so every member of a team points to the same record. The Users screen shows the organisation under the region, and its search box also finds users by organisation.

The organisation is also a column of the users CSV export and of the access review export. See [Users and approval](./users-and-approval.md).
