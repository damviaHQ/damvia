---
title: Administration
description: Map of every admin screen, what it manages, and which role can open it.
sidebar:
  order: 1
lastUpdated: 2026-09-15
---

The administration area lives under `/admin/...` in the client and is reached from the main layout. It groups everything a self-hoster or an administrator changes after the instance is running: who can log in, how assets are typed and licensed, what the menu and pages look like, and how the product catalogue is wired to files.

## Every admin route

The routes below are declared in `client/src/router/index.ts`. The sidebar labels and sections come from `client/src/layouts/LayoutAdmin.vue`.

| Route | Sidebar label | Section | What it manages | Who sees it |
| --- | --- | --- | --- | --- |
| `/admin/settings` | Global Settings | (top level) | Instance-wide settings screen | admin |
| `/admin/menu-items` | Menu | Content Management | The navigation tree shown to users: collections, pages, text links, dividers, home item | admin |
| `/admin/collections` | Collections | Content Management | The public collection tree: create, edit, delete | admin |
| `/admin/pages` and `/admin/pages/:id` | Pages | Content Management | Standalone pages and their block layout | admin |
| `/admin/assets/:id?` | Assets | Asset Management | The folder tree synced from cloud storage; assign asset type and license per folder | admin |
| `/admin/asset-types` | Asset Types | Asset Management | Categories of files with display and search defaults | admin |
| `/admin/licenses` | Licenses | Asset Management | Usage licenses with dates, scopes and allowed regions | admin |
| `/admin/users` | Users | User Management | Sign-ups, approval, roles, groups, removal | admin, manager |
| `/admin/groups` | Groups | User Management | Groups used to restrict collections | admin |
| `/admin/regions` | Regions | User Management | Regions with a default group each | admin |
| `/admin/authorized-domains` | Authorized Domains | User Management | Email domains whose sign-ups are approved automatically | admin |
| `/admin/products` and `/admin/products/import` | Products | PIM | Product rows imported from CSV | admin |
| `/admin/products/attributes` | Attributes | PIM | Which product columns are searchable, facetable or displayed | admin |

Each screen is documented on its own page:

- [Users and approval](./users-and-approval.md)
- [Groups and regions](./groups-and-regions.md)
- [Licenses](./licenses.md)
- [Asset types](./asset-types.md)
- [Assets tree](./assets-tree.md)
- [Collections and sharing](./collections-and-sharing.md)
- [Menu and pages](./menu-and-pages.md)
- [Products and PIM](./products-and-pim.md)
- [Downloads](./downloads.md)

## Managers only see the Users screen

The sidebar renders the whole User Management section for the roles `admin` and `manager`, but inside it only the Users link is shown to managers. Groups, Regions and Authorized Domains are wrapped in an `admin` check. Every other section (Global Settings, Content Management, Asset Management, PIM) is rendered only for `admin`.

A manager who opens `/admin/users` is further limited to the users of their own region. The rules are detailed in [Users and approval](./users-and-approval.md).

## The router does not enforce roles

`client/src/router/index.ts` only checks that a visitor is authenticated: an unauthenticated visitor is redirected to `/login`, and an authenticated one is kept away from the auth pages. Nothing in the router compares the route to the user's role.

Role enforcement happens on the server. Every tRPC procedure behind an admin screen is wrapped in `authMiddleware(...)` with one of the predicates defined in `server/src/trpc/index.ts`:

| Predicate | Passes when |
| --- | --- |
| `userApproved` | `approved` and `emailVerified` are both true |
| `userAdmin` | role is `admin` |
| `userManagerOrAdmin` | role is `admin` or `manager` |
| `userMember` | role is `admin`, `manager` or `member` (excludes `guest`) |

A member who types an admin URL by hand gets the screen shell, and the data calls fail with `UNAUTHORIZED`. See [Roles and access](../introduction/roles-and-access.md) for the role model.

:::note
A user who is authenticated but not yet verified and approved never reaches the router views at all: `client/src/App.vue` replaces the whole layout with a waiting screen until both flags are true.
:::

## Where the data lives

All admin screens talk to the tRPC API under `server/src/trpc/router/`. Most of the work described in these pages is done synchronously in the request, but a few actions push jobs to pg-boss queues (collection synchronization, archive creation, emails). Those queues and their crons are listed in [Background jobs](../reference/background-jobs.md), and the variables that shape them in [Environment variables](../reference/environment-variables.md).
