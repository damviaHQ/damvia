---
title: Modules
description: Add screens, tables, procedures, jobs and event hooks to Damvia from a separate package, without changing the core, and build it into an instance.
sidebar:
  order: 8
lastUpdated: 2026-09-30
---

A module is a package, kept in its own repository, that adds a feature to Damvia: its own tables, procedures, background jobs and screens. It is built into the instances that list it, and it looks and behaves like the rest of the application. The core does not change for a module. The core only exposes the extension points described on this page, and a module uses nothing else.

This page is the contract between the two. It is written for developers of a module and for whoever builds an instance that runs one.

## What a module can do

| Side | Extension point | Result |
|---|---|---|
| Server | `entities`, `migrations` | Its own tables, created and upgraded with the core's |
| Server | `router` | Its procedures, served at `modules.<name>.*` behind the core's roles and sessions |
| Server | `createQueue` | Background jobs and crons, run by the core's worker |
| Server | `hooks` | Code run after an event of the core, such as a record change |
| Client | `routes` | Screens in the main layout, the administration or any other layout |
| Client | `nav`, `adminNav` | Entries in the main menu and in a section of the administration menu |
| Client | `slots` | A component shown inside a core screen, such as a product page |

A need that none of these covers is a change to the core: see [Adding an extension point](#adding-an-extension-point).

## A module is one package with two entries

```
damvia-forecast/
  package.json        "main": "dist/server/index.js"
  src/server/         compiled to dist/server, loaded by the server
  client/index.ts     loaded by the client build, from its sources
  client/*.vue
```

- The **server entry** is the package's `main`, compiled to CommonJS. The server loads it with `require`.
- The **client entry** is the `client` subpath (`damvia-forecast/client`). It is shipped as TypeScript and `.vue` sources: the client build compiles it with the core, so it uses the same Vue, the same components and the same styles.
- `typeorm`, `zod`, `@trpc/server`, `@trpc/client`, `vue`, `vue-router` and `@tanstack/vue-query` are **peer dependencies**. The module must use the core's copies: an entity registered on another copy of TypeORM is not seen.

The module's name is written in camelCase (`forecast`, `workbook`). The name is the router key, the prefix of its queues and tables, and must be the same on both sides.

Working examples are the fixtures the test suites load: `server/test/fixtures/module-hello.cjs` for the server, and `client/test/fixtures/module-hello/` for the client.

## The server part

The server entry exports a name and a `setup` function. `setup` receives the core's API and returns what the module adds:

```ts
import type { DamviaModule } from "server/src/modules"
import { Forecast } from "./entity/forecast"
import { Forecasts1893456000000 } from "./migrations/1893456000000-forecasts"

const forecast: DamviaModule = {
	name: 'forecast',
	setup(damvia) {
		const reminders = damvia.createQueue<{ roundId: string }>({ name: 'reminders', processor: sendReminders })
		return {
			entities: [Forecast],
			migrations: [Forecasts1893456000000],
			router: damvia.router({
				mine: damvia.publicProcedure
					.use(damvia.authMiddleware(damvia.userApproved))
					.query(({ ctx }) => damvia.dataSource.getRepository(Forecast).findBy({ organisationId: ctx.user.organisationId })),
			}),
			hooks: {
				'records.changed': ({ changes }) => linkNewColourways(changes),
			},
		}
	},
}

export default forecast
```

The types come from the core's build: the module's `tsconfig.json` maps `server/src/*` to a checkout of Damvia's `server/dist/*`, the way the client does.

### What `setup` receives

`setup` receives the `ModuleApi` object. It is the whole server API a module may use:

| Member | Use |
|---|---|
| `dataSource` | The TypeORM data source: repositories, queries, transactions. Core tables are read with it too, such as `users.organisation_id` |
| `logger` | The core's logger, with `module: <name>` on every line |
| `router`, `publicProcedure`, `authMiddleware` | Build the router exactly as the core's routers are built. See [tRPC API](./api.md) |
| `userAdmin`, `userManagerOrAdmin`, `userMember`, `userApproved` | The core's role predicates, for `authMiddleware` |
| `recordAudit` | Writes an [audit log](../administration/audit-log.md) entry. Admin and manager mutations are already recorded by `authMiddleware` |
| `createQueue` | Declares a queue as described in [Writing a background job](./background-jobs.md). The name is prefixed with the module's: `reminders` becomes `forecast/reminders` |

A module does not import any other file of the core. What is not in `ModuleApi` can change in any release.

### Tables and migrations

Entities and migrations are written as in the core: see [Data model](./data-model.md#writing-a-migration). Name the tables after the module (`forecast_rounds`, `forecast_entries`), so they never meet a core table. A module table may reference a core table (`REFERENCES users(id) ON DELETE CASCADE`); the core never references a module's.

Migrations of every module run with the core's at startup, in timestamp order, and are recorded in the same `migrations` table. Removing a module from `DAMVIA_MODULES` leaves its tables in place.

### Events

A hook runs after an event of the core:

| Event | When | Payload |
|---|---|---|
| `assets.synced` | A sync pass over every source has finished, about every 5 minutes | `{}` |
| `records.changed` | Records were created, edited, moved or deleted: in the grid, the card, an import, a bulk action or a link review | `{ changes: [{ recordId, recordKey, action }], changedById }`. `action` is `create`, `update`, `delete` or `move`; `recordId` is null for a deleted record |

Hooks do not run in the request. Each event gives each module that has a hook for it one `modules/event` job, run by the worker. A hook that throws is retried by pg-boss, alone: the change that caused the event is already saved, and the other modules have their own jobs. An event raised inside a transaction is only delivered once the transaction commits. A hook must therefore accept being run more than once for the same event.

### Loading and errors

The server reads `DAMVIA_MODULES` when it starts: package names, or paths starting with `.` or `/` read from the server folder, separated by commas. It refuses to start when a module cannot be loaded, has no camelCase name or no `setup` function, or when two modules share a name. The log shows `module loaded` for each module.

## The client part

The client entry exports a `ClientModule` by default:

```ts
import type { ClientModule } from "@/modules"
import { ChartColumn } from "@lucide/vue"
import ProductForecast from "./ProductForecast.vue"

export default {
	name: 'forecast',
	routes: [
		{ name: 'forecast', path: '/forecast', component: () => import('./MyForecast.vue'), meta: { layout: 'main', title: 'Forecast', roles: ['admin', 'manager', 'member'] } },
		{ name: 'admin-forecast', path: '/admin/forecast', component: () => import('./Consolidation.vue'), meta: { layout: 'admin', title: 'Forecast', roles: ['admin'] } },
	],
	nav: [{ label: 'Forecast', to: { name: 'forecast' }, icon: ChartColumn }],
	adminNav: [{ section: 'database', label: 'Forecast', to: { name: 'admin-forecast' }, icon: ChartColumn }],
	slots: { 'product.details': ProductForecast },
} satisfies ClientModule
```

The files of the client part import the core with `@/`, like the core's own files: its components (`@/components/ui/button`), composables and styles. Tailwind classes work as in the core: the build scans the module's folder.

### Routes and menus

- `routes` are ordinary Vue Router routes, added after the core's. `meta.layout` picks the layout, `meta.roles` the roles allowed, `meta.title` the page title, and `meta.mobile` the phone screen, as for the core's. A route without `meta.mobile` shows "use a computer" on a phone. See [Phones](../administration/phones.md).
- `nav` entries show in the main menu, under **Favorites**, for signed-in users other than guests.
- `adminNav` entries show at the end of a section of the administration menu: `overview` (Dashboard, Insights), `content`, `users`, `assets`, `database`, `enrichment` or `settings` (Emails, Newsletters, Settings).

A menu entry shows only to the roles its route allows. The server checks the role again on every procedure.

### Slots

A slot is a place in a core screen where a module's component is shown, with props given by the core:

| Slot | Where | Props |
|---|---|---|
| `product.details` | Under the fields of a product, on its page, on a computer and on a phone | `product`: the product as `catalogue.get` returns it |

Components of several modules in the same slot show one under the other, in the order of `DAMVIA_MODULES`.

### Calling the module's procedures

`moduleClient` gives a client of the module's router, typed by it:

```ts
import { moduleClient } from "@/modules"
import type { ForecastRouter } from "../src/server/router"

const forecast = moduleClient<ForecastRouter>('forecast')
const mine = await forecast.mine.query()
```

The router type comes from the module's server part (`export type ForecastRouter = ReturnType<typeof forecastRouter>`). Only the type is imported: no server code reaches the client.

## Building an instance with modules

The same list goes to the server and to the client, and each side installs the packages:

1. Install the modules in `server/` and in `client/` (`npm install @acme/damvia-forecast`, from a private registry or a Git URL).
2. Set `DAMVIA_MODULES=@acme/damvia-forecast` for the server, and the same value for the client build, in the environment or in `client/.env`. See [Environment variables](../reference/environment-variables.md).
3. Build the client, and start the server. Its migrations run at startup.

For the server image, a small Dockerfile on top of the image built from Damvia's `server/Dockerfile` is enough. That image installs as `root` and runs as `node`:

```dockerfile
FROM damvia-server:2.1
USER root
RUN npm install --omit=dev @acme/damvia-forecast
USER node
ENV DAMVIA_MODULES=@acme/damvia-forecast
```

Upgrading Damvia is then a change of version in the image and the client checkout. The modules keep working as long as the contract on this page holds. Build and test them against each release before deploying it, as for any upgrade: see [Upgrading](../deployment/upgrading.md).

## The contract changes like a public API

What this page lists is the contract: `ModuleApi`, the events and their payloads, `ClientModule`, the admin menu sections, the slots and their props, and `moduleClient`. Adding one of them, or a field to a payload, is a minor change. Renaming or removing one, or changing what it receives, is a breaking change: it is announced in the release notes, with the version from which it applies.

## Adding an extension point

A module needs a place the contract does not offer: another slot, event or admin section. The place is added to the core, in the open, for every module:

- Name it after where it is or what happened (`collection.header`, `downloads.created`), never after the module that needs it.
- Give it the smallest props or payload that make sense without that module.
- Add it to the tables of this page, and cover it with a test in `server/test/modules.cjs` or `client/test/ui/modules.spec.ts`.

A behaviour of one customer never goes into the core. The core gets the point where that behaviour can plug in, and the behaviour stays in the module.
