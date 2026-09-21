---
title: Administration
description: Choose the administrative guide for access, assets, collections, pages, records or workspace health.
sidebar:
  order: 1
lastUpdated: 2026-09-21
---

The administration area controls who can enter the library, how source files are classified, what readers see, and whether the instance is healthy. These guides describe administrative decisions and their consequences. Everyday reader workflows belong in the separate website knowledge base and onboarding.

## Start with access and a healthy source

After creating the [first admin](../getting-started/first-admin.md):

1. Add authorised email domains and decide who approves other accounts.
2. Create the regions and groups used by your organisation.
3. Confirm every configured source has completed a sync and its files leave the `creating` state.
4. Define asset types and licences, then assign them to source folders.
5. Build public collections, pages and menu entries.

The [Dashboard](./dashboard.md) is the first place to check storage, source synchronisation, pending assets and recent activity. The [Operations runbook](../deployment/operations.md) adds queue and database checks.

## Access and organisation

- [Users and approval](./users-and-approval.md): approve accounts, assign roles and remove access.
- [Groups and regions](./groups-and-regions.md): model teams and markets, and understand how group restrictions inherit through collection trees.
- [Roles and access](../introduction/roles-and-access.md): exact visibility and edit rules.
- [Accounts and links](./accounts-and-links.md): sessions, invitations, signed URLs and revocation limits.

Managers only receive the Users area and can act only on users in their own region. All other administration areas require an admin. The server enforces those permissions even if somebody opens an admin URL directly.

## Assets and rights

- [Assets tree](./assets-tree.md): inspect each source and assign a type and licence to folders.
- [Asset types](./asset-types.md): control default display, record linkage and search defaults, and type folders by rules on their path.
- [Licences](./licenses.md): restrict files by region and date and understand why a licence follows a file into every collection.

Source files are managed in the connected cloud storage. Damvia's asset tree is for inspection and classification; it does not upload or reorganise those files.

## Publishing and sharing

- [Collections and sharing](./collections-and-sharing.md): choose manual or synchronised collections, set visibility and invite guests.
- [Menu and pages](./menu-and-pages.md): arrange navigation and editorial pages.
- [Downloads](./downloads.md): formats, limits, expiry and operational consequences.

Collections organise references to assets. Copying a file into another collection does not copy the asset or change its type or licence. A page block also does not add a file to its collection.

## Data enrichment and reporting

- [Records](./records.md): import CSV data of products, events or anything files are about, choose the key column, name the records and configure searchable/filterable attributes.
- [Insights](./analytics.md): interpret recorded activity and retention.
- [Dashboard](./dashboard.md): storage usage, source state and items needing attention.

## Route map

| Area | Route | Role |
|---|---|---|
| Dashboard | `/admin` | admin |
| Insights | `/admin/analytics` | admin |
| Settings: branding and record label | `/admin/settings`, the last entry of the admin menu | admin |
| Menu, collections and pages | `/admin/menu-items`, `/admin/collections`, `/admin/pages` | admin |
| Assets, types and licences | `/admin/assets`, `/admin/asset-types`, `/admin/licenses` | admin |
| Folder rules | `/admin/folder-rules` | admin |
| Users | `/admin/users` | admin or manager for their region |
| Groups, regions and authorised domains | `/admin/groups`, `/admin/regions`, `/admin/authorized-domains` | admin |
| Records and attributes | `/admin/data-enrichment/records`, `/admin/data-enrichment/records/import`, `/admin/data-enrichment/records/attributes` | admin |

The labels and exact layout may evolve; the permission and data consequences documented on each linked page are the durable contract.
