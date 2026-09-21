---
title: UI stack audit
description: Neutral client theme, dependency migration and validation on 2609-v2.
sidebar:
  order: 9
lastUpdated: 2026-09-19
draft: true
---

# One design system, two themes

The dashboard and customer DAM share the same components and semantic roles. The Damvia theme uses brand blue, midnight and Mona Sans. The neutral client theme uses charcoal actions, achromatic surfaces and Inter (or `--tenant-font-family`). Spacing, sizes, square controls, feedback states and 12px passive surfaces remain shared. Status colours retain their meaning; uploaded customer logos and assets are not recoloured.

`packages/design-system/src/tokens.json` is the foundation. `neutral.json` contains palette overrides; the compiler emits both shadcn bridges. `client/src/styles/controls.css` contains shared production control styling, while `client.css` and `admin.css` contain surface-specific composition. Do not fork the Vue components or maintain a second library.

The app selects the neutral theme outside admin routes. Dialogs, scroll dialogs, alert dialogs, selects, dropdowns, submenus, popovers and tooltips receive their originating theme when teleported. Global Sonner notifications follow the current route. The search popup now uses the shared Reka dialog, including Escape dismissal and focus management. The client has collapsible mobile navigation and a favorites empty state.

The reference at `/design-system.html` provides a theme switch and real production controls. Shared primitive examples cover buttons, inputs, checkboxes, badges, loading skeletons, dialogs, dropdowns, selects, tooltips, tabs, a slider and the range calendar.

## Dependency changes

Versions below are installed lockfile versions, verified against npm on 19 September 2026.

| Package | Before | After |
| --- | --- | --- |
| Vue | 3.5.13 | 3.5.43 |
| Tailwind CSS | 3.4.9 | 4.3.3 |
| Vite | 5.4.8 | 8.3.0 |
| Vue Vite plugin | 5.0.5 | 6.0.9 |
| Vue JSX plugin | 4.0.0 | 5.1.6 |
| vue-tsc | 2.1.6 | 3.3.11 |
| TypeScript | 5.5.3 | 5.9.3 |
| UI primitives | Radix Vue 1.9.3 + Reka 2.2.0 | Reka UI 2.10.4 only |
| tailwind-merge | 2.6.0 | 3.7.0 |
| Notifications | vue-sonner 1.1.4 | 2.0.9 |
| Client tRPC | 10.45.0 | 11.19.0 |
| Server tRPC | 11.1.0 | 11.19.0 |

shadcn-vue components are owned source files, not a runtime package that can simply be upgraded. The existing customised wrappers were migrated to Reka, their controlled checkbox bindings and CSS variable names updated, and the entire shared UI folder checked. No registry overwrite was used.

Tailwind now runs through `@tailwindcss/vite`. Its CSS entry imports Tailwind and `tw-animate-css`, and explicitly loads the existing custom configuration so tenant build-time brand settings continue to work. Scoped `@apply` blocks reference the shared CSS entry. The 12 Sass blocks used nesting only and were compiled to plain CSS; Sass, autoprefixer and tailwindcss-animate are removed. The invalid negative radius and the input's hard-coded blue focus ring were fixed. Slider tracks and thumbs, badges and alerts follow the square shape contract.

Modern-browser support was explicitly approved: Safari 16.4+, Chrome 111+, Firefox 128+. Node must satisfy `>=22.12.0`; use a current Node 22 or 24 in development and builds. The existing Node 22 Docker base was not rebuilt in this task.

Tenant colour defaults are neutral, with existing `VITE_BRAND_COLOR`, `VITE_BRAND_COLOR_HOVER` and `VITE_BRAND_COLOR_STRONG` settings preserved. Runtime equivalents are `--tenant-brand-color`, `--tenant-brand-hover`, `--tenant-brand-strong`, plus the derived `--tenant-brand-text` and `--tenant-brand-foreground`. Put runtime overrides on the document root so teleported content sees the same values. Semantic neutral action roles remain neutral by default; adding a fully branded tenant action theme requires coordinated foreground/hover/focus overrides and contrast checks, not merely changing one background.

## Validation

- Production client build: passed.
- Design token freshness and design-reference build: passed.
- Design-reference type check and **all shared UI component types** (`npm run ui:check`): passed.
- Twelve repeatable Playwright regressions (`npm run test:ui`): passed. They verify both palettes, keyboard checkbox updates, select state, dialog theme and Escape/focus return, dropdown theme, tabs, notification position/colour, mobile width and reduced-motion mode.
- Browser checks of the actual login and favorites layouts with isolated API fixtures: passed with no page exceptions, at 1440px and 390px. Fixtures do not verify real backend behaviour.
- Server TypeScript build after tRPC alignment: passed. No server application logic changed.
- Client npm audit: **0 vulnerabilities**, down from 28 before the changes. Compatible patches were applied within declared ranges.
- Server npm audit after the tRPC-only update still reports **28 vulnerabilities** (4 critical, 13 high, 10 moderate, 1 low) elsewhere in its dependency tree. This frontend migration does not claim to resolve the backend security backlog.

## Outstanding validation

The full `npm run typecheck` remains failing. It now gets past the old search-template parser failure and the incompatible tRPC router types, exposing existing application errors and server source checked under the client's strict compiler settings. Examples include untyped template refs, optional download-format fields, product import indexing and backend decorator/nullability diagnostics. Do not hide these using `any`, disabling strictness, or treating the bundler as a type checker. The component-only check intentionally has a narrower scope and does not replace the full application check.

A separate application type-cleanup should establish a declaration boundary for server router types, then fix client errors. Before deployment, exercise authenticated collection navigation, uploads, permissions, downloads/licence acceptance, user management, search facets, date filters and resizable asset panels against a disposable or staging backend with representative data. No real customer account, storage provider, mail transport, or production data was used here. The previous database security suite was not rerun; the server build was rerun.

## Reproduce

From `client/`:

```sh
npm ci
npm run build
npm run design:check
npm run design:build
npm run ui:check
npx playwright install chromium
npm run test:ui
npm audit
npm run typecheck # currently fails; keep the output visible
```

The browser suite starts its own application server on port 5176 and checks both the reference and actual client screens. To inspect visually, use `npm run design:dev` and open `http://127.0.0.1:5174/design-system.html`. The reference is excluded from the production entry.

Sources: [Tailwind upgrade guide](https://tailwindcss.com/docs/upgrade-guide), [Tailwind compatibility](https://tailwindcss.com/docs/compatibility), [Reka migration guide](https://reka-ui.com/docs/guides/migration), [shadcn-vue changelog](https://www.shadcn-vue.com/docs/changelog). Package versions and audit counts come from the npm registry, not the manifest ranges alone.
