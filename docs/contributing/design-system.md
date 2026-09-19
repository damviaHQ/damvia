---
title: Design system
description: Review the proposed Damvia design foundation and reuse its tokens across the admin and website.
sidebar:
  order: 7
lastUpdated: 2026-09-19
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

Use `.dv-theme` around the adopting surface. The shared CSS does not set root variables or reset the existing application. The admin retains shadcn components styled with Damvia tokens and Reka UI accessibility primitives. Vue can wrap the classes in typed components; Astro can use them directly without adding a client runtime. The package is private while its API is under review and is not available from npm yet.

Mona Sans is self-hosted with its original font license. The code retains the repository’s AGPL license.

## Keep customer branding independent

Maintain one design system with two themes. The admin and website use `.dv-theme.dv-admin`; client and authentication surfaces use `.dv-theme.dv-neutral.dv-client`. Shared controls use the same spacing, square action/data shapes, 12px passive surfaces and interaction patterns. Neutral palette overrides live in `packages/design-system/src/neutral.json`; the compiler derives both shadcn colour bridges from the same semantic roles. Client typography defaults to Inter and supports `--tenant-font-family`. Customer logos and media retain their original colours.

## Validate and publish separately

Run from the repository root:

```sh
npm run check --prefix packages/design-system
npm run design:check --prefix client
npm run design:build --prefix client
```

The standalone static artifact is `client/dist/design-system/`, with `design-system.html` as its entry. Normal production builds use the existing client entry and do not bundle the preview.

This documentation follows the existing website submodule pipeline. Making it public requires merging the files, updating the website’s submodule revision and deploying the website. No package or website is published by the preview build.

The admin shell and dashboard use live data and preserve server permissions and maintenance actions. User management and the remaining admin screens use the shared foundation. The global Sonner notification adapter uses the shared `dv-toast` contract, including a square midnight surface, status icon colours and square actions; authentication screens use the same global adapter. Stabilise component APIs before creating a public component explorer; [Storybook’s sharing workflow](https://storybook.js.org/docs/sharing) is one supported option. The client now adopts the neutral theme. Website adoption remains separate.

Collection paths, admin asset paths, the admin top bar and the file preview use `PathBreadcrumb.vue`. Its shared collapse function preserves the first and latest path items and moves hidden ancestors into an ellipsis menu. Ancestors are links; the current page is plain text marked with `aria-current="page"`. A keyboard-accessible tooltip exposes the full name only when a visible label is actually truncated. The client and admin share this behaviour while using light or dark presentation variants.

## Publication

Keep the shared design-system source in `packages/design-system` in the open-source repository so contributors and self-hosters can build the same UI. Publish brand guidelines and component documentation on the Damvia website through the existing documentation pipeline. The standalone reference is a development artifact, excluded from the normal application build. The package remains private until its API and release process are stable. No npm release or website deployment is required to use it locally.

## Shared admin patterns

`AdminList.vue` provides search over explicitly named fields, result counts, empty states and pagination at 20 rows for configuration lists. Shared Vue controls use semantic Tailwind utilities; `client/src/styles/controls.css` contains only the tree-select integration and reduced-motion fallback; admin-specific layouts remain in `client/src/styles/admin.css`. `LayoutAdmin` provides `damvia-admin-theme`; shadcn portal components inject it to preserve the admin theme outside the page DOM, while tenant overlays explicitly receive `.dv-theme.dv-neutral.dv-client`. Existing server permissions and editing APIs remain authoritative.

## Admin dialogs

Dialog and AlertDialog headers and footers expose `data-dialog-header` and `data-dialog-footer` styling hooks. The admin theme defines compact (520 px), wide (960 px), and viewport-sized comparison dialogs; panels keep 12 px corners while controls stay square. Modal styles remain scoped to `.dv-admin`. Menu item editing uses the shared shadcn Dialog rather than its own raw overlay. Footer actions stay visible when long forms scroll, and wide editors stack at 640 px.

The token compiler generates shadcn colour bridges for both `.dv-admin` and `.dv-theme.dv-neutral`. Shared controls, including teleported dialogs, selects and dropdowns, receive the same foreground, muted, surface, border, focus and status values as the design-system tokens. Keep the bridge derived from tokens rather than copying colour values into individual controls. Do not hard-code blue utilities into shared controls; use semantic primary, ring, surface and text roles.

## Neutral desktop client

The client shares the dashboard's component language: square controls and asset frames, restrained borders, consistent spacing and 12px dialog corners. Its default palette is grey and charcoal. Brand colour is reserved for tenant configuration; supplied logos and asset colours are preserved. This is one design system with two themes, not two component libraries.

The desktop shell uses a compact header, resizable navigation, compact collection breadcrumbs, uniform thumbnail grids, readable list rows and a light preview/download panel. Search, favorites, account dialogs, collection actions and authentication use the same controls. No new product features were added. A dedicated mobile redesign remains a separate pass.

Use Tailwind in Vue templates for layout, dimensions, spacing, states and component styling. Shared framework-neutral defaults load once in the components cascade layer so Tailwind utilities can override them. Do not import `components.css` again from individual Vue components. The former `styles/client.css` override layer has been removed, and client-facing Vue components no longer contain style blocks.

Keep CSS for generated semantic tokens, font declarations, base theme variables, the framework-neutral package contract, third-party tree-select internals and the reduced-motion fallback. Admin-specific CSS remains outside this client cleanup. Runtime widths, editor configuration and user-supplied content styles remain dynamic where needed.

`npm run test:ui --prefix client` checks the two themes plus the actual client collection with isolated sample data: selection, search menus, preview format options, Escape, list preferences and profile access. These checks do not exercise backend downloads or send messages. Production build and shared UI type checks pass; full application type checking still has pre-existing errors tracked in the UI stack audit.

### Client presentation constraints

Use the original client browsing layout as the reference. Keep collection selection and breadcrumbs in a single compact toolbar; do not add a duplicate collection title. Breadcrumbs use consistent 8px gaps, 16px separators and a shared text baseline. File cards use a 196px-high preview with 8px image padding and 24px gaps. Primary icon-only actions use 24px icons; do not globally shrink all button icons. Dialogs and popovers open and close immediately, without fade, zoom or slide effects. Avoid adding decorative motion or extra framing during modernization.

### Shared form contract

Shadcn-vue remains the foundation. `ui/field/styles.ts` owns the common classes used by `Label`, `Input`, `SelectTrigger`, `FormItem` and `FormDescription`. Use `FieldGroup` for plain forms and `FormItem` for validated forms; both use the same gap token. Use `FieldDescription` for supporting text. Do not nest a Label inside FormLabel, or put multiple children inside FormControl.

Edit `field.*` and `control.*` in `packages/design-system/src/tokens.json`, then run the token build. The defaults are a 13px label, 20px line height, 8px label-to-control gap, 40px control height and 12px helper text. Vue fields, search filters, tree-select adapters and the framework-neutral field classes consume these same variables. Avoid screen-specific typography and spacing overrides for ordinary fields. Keep checkbox/radio choices as horizontal choice rows rather than applying a vertical field wrapper.

Client collection dialogs share title/description headers and aligned footers. The edit dialog groups Details, Visibility and Appearance; helper text is separate from labels. Local dialog content should compose shared controls rather than restyle them. Browser coverage verifies both default geometry and propagation of token changes across edit and share dialogs.

### Dialogs and confirmations

Use the shared dialog surface, heading and description classes in `client/src/components/ui/dialog/styles.ts` for both Dialog and AlertDialog. Keep neutral client dialogs static, use shared field components for forms, and keep action footers distinct from content. See `docs/_internal/client-modal-review.md` for the desktop client review coverage.

Client modal hierarchy uses headings, grouping and whitespace. Do not add decorative horizontal rules between sections, preference rows or above action footers. Field borders and data-table boundaries remain functional. Dialog and confirmation footers share `dialogFooterClasses`.

### Client navigation typography

Sidebar navigation and selection status use `text-body`, which resolves to the shared `--dv-size-body` token (14px). `text-caption` resolves to `--dv-size-caption` (12px) and is reserved for secondary metadata, not primary navigation or selection counts. Selection toolbar action icons are 24px. Avoid local numeric text-size overrides for these roles.

Client menus use Lucide, matching the dashboard menu: 16px icons, default 2px strokes, 20px icon slots and an 8px label gap for primary rows. Shared client menu geometry lives in `client/src/components/layout-main/navigationStyles.ts`; recursive tree rows keep their compact geometry and 16px nesting so location guides stay aligned. Toolbar action icons remain a separate 24px role.

### Checkboxes

Use `ui/checkbox/Checkbox.vue` for checked, unchecked, disabled and indeterminate states (`modelValue: true | false | "indeterminate"`). CollectionCheckbox only maps legacy selection states to that component; it must not define its own visuals. Search asset-type options use the same component. The `checkbox-surface` Tailwind utility owns size, border, background and shape; the tree-select adapter consumes it because that dependency owns its internal checkbox markup. Partial selection uses a minus, and Space toggles the focused control.

Search modal options form a readable sentence ("I … in …"). Preserve this interaction when changing shared styles; technical labels remain accessible names rather than visible form headings.
