---
title: Design system
description: Review the proposed Damvia design foundation and reuse its tokens across the admin and website.
sidebar:
  order: 7
lastUpdated: 2026-09-17
---

Damvia’s proposed design system shares the brand’s blue and midnight palette, typography, spacing and common control styles across the admin and website. The production admin uses this foundation. A single isolated reference page documents the tokens and shared component contracts. Customer portals keep their own branding.

## Open the proposal

Install the client dependencies as described in the [architecture guide](./architecture.md), then run these commands from the repository root:

```sh
npm run design:dev --prefix client
```

Open `http://127.0.0.1:5174/design-system.html`. The reference requires no backend or login. It contains foundations, component examples, toast styling and usage guidance. Product screen previews are intentionally excluded: the real admin is the only maintained implementation of dashboard and user-management layouts.

## Share foundations across frameworks

`packages/design-system/src/tokens.json` holds the design tokens. The package build generates scoped CSS variables from this file. Token names distinguish values such as `color.blue` from roles such as `action.primary` and `surface.nav`.

The token structure uses the [Design Tokens Community Group format](https://www.designtokens.org/tr/2025.10/format/). The small local compiler supports the types used by this proposal rather than implementing the complete specification.

The approved shape direction follows purpose. Interactive elements use `radius.control = 0`: buttons, fields, navigation, menus and interactive cards. Data and feedback elements use `radius.data = 0`: badges, charts, progress bars, tables and notifications. Passive layout surfaces use `radius.surface = 12px`; purely visual colour and brand samples may use `radius.graphic = 8px`. Avatars and conventional radio controls may remain circular because their shape carries identity or interaction meaning. The older `radius.button` and `radius.field` tokens remain aliases of `radius.control`.

Never use dark-blue text on a light-blue button background. Filled blue buttons use white text on strong blue; disabled buttons use a neutral surface and readable secondary text at full opacity.

Every interactive element that performs an action or navigation uses the pointer cursor. This includes links, buttons, selects, disclosure controls, clickable labels, action-like ARIA roles and pointer-operated form controls. Disabled native controls and elements with `aria-disabled="true"` use the not-allowed cursor.

Text colour follows semantic roles rather than page-specific grey values. Light admin surfaces use `text.primary` for headings and content, and `text.secondary` for metadata, descriptions, breadcrumbs and inactive navigation. Midnight surfaces use `text.on-dark`, `text.on-dark-secondary` and `text.on-dark-muted`. Status colours remain reserved for status meaning.

The package exposes tokens, optional font CSS and framework-independent component CSS. A consumer can install the local package directory or a release archive, then import:

```css
@import '@damvia/design-system/fonts.css';
@import '@damvia/design-system/tokens.css';
@import '@damvia/design-system/components.css';
```

Use `.dv-theme` around the adopting surface. The shared CSS does not set root variables or reset the existing application. The admin retains shadcn components styled with Damvia tokens and Radix accessibility primitives. Vue can wrap the classes in typed components; Astro can use them directly without adding a client runtime. The package is private while its API is under review and is not available from npm yet.

Mona Sans is self-hosted with its original font license. The code retains the repository’s AGPL license.

## Keep customer branding independent

The admin and marketing website may use the Damvia palette. A customer portal should adopt only neutral structure and accessible interaction patterns after review. Do not apply `.dv-theme` or replace tenant colour variables globally. The tenant portal layouts and authentication flow keep their existing styling. The production admin shell, dashboard and administration screens adopt the new theme.

## Validate and publish separately

Run from the repository root:

```sh
npm run check --prefix packages/design-system
npm run design:check --prefix client
npm run design:build --prefix client
```

The standalone static artifact is `client/dist/design-system/`, with `design-system.html` as its entry. Normal production builds use the existing client entry and do not bundle the preview.

This documentation follows the existing website submodule pipeline. Making it public requires merging the files, updating the website’s submodule revision and deploying the website. No package or website is published by the preview build.

The admin shell and dashboard use live data and preserve server permissions and maintenance actions. User management and the remaining admin screens use the shared foundation. The global Sonner notification adapter uses the shared `dv-toast` contract, including a square midnight surface, status icon colours and square actions; authentication screens use the same global adapter. Stabilise component APIs before creating a public component explorer; [Storybook’s sharing workflow](https://storybook.js.org/docs/sharing) is one supported option. Apply the shared foundation to the Astro website next, while treating tenant portal changes as a separate scope.

Collection paths, admin asset paths, the admin top bar and the file preview use `PathBreadcrumb.vue`. Its shared collapse function preserves the first and latest path items and moves hidden ancestors into an ellipsis menu. Ancestors are links; the current page is plain text marked with `aria-current="page"`. A keyboard-accessible tooltip exposes the full name only when a visible label is actually truncated. The client and admin share this behaviour while using light or dark presentation variants.

## Publication

Keep the shared design-system source in `packages/design-system` in the open-source repository so contributors and self-hosters can build the same UI. Publish brand guidelines and component documentation on the Damvia website through the existing documentation pipeline. The standalone reference is a development artifact, excluded from the normal application build. The package remains private until its API and release process are stable. No npm release or website deployment is required to use it locally.

## Shared admin patterns

`AdminList.vue` provides search over explicitly named fields, result counts, empty states and pagination at 20 rows for configuration lists. `client/src/styles/admin.css` scopes controls and tables to `.dv-admin`. `LayoutAdmin` provides `damvia-admin-theme`; shadcn portal components inject it to preserve the admin theme outside the page DOM, without applying it to tenant portal overlays. Existing server permissions and editing APIs remain authoritative.

## Admin dialogs

Dialog and AlertDialog headers and footers expose `data-dialog-header` and `data-dialog-footer` styling hooks. The admin theme defines compact (520 px), wide (960 px), and viewport-sized comparison dialogs; panels keep 12 px corners while controls stay square. Modal styles remain scoped to `.dv-admin`. Menu item editing uses the shared shadcn Dialog rather than its own Radix overlay. Footer actions stay visible when long forms scroll, and wide editors stack at 640 px.

The token compiler also generates an admin-only shadcn colour bridge under `.dv-admin`. Shared controls, including teleported dialogs, selects and dropdowns, receive the same foreground, muted, surface, border, focus and status values as the design-system tokens. Keep the bridge derived from tokens rather than copying colour values into individual controls. Client portal variables remain outside this scope.
