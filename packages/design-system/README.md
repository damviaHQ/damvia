# @damvia/design-system

Shared Damvia foundations, proposal `0.1.0`, with Damvia and neutral client themes. This package is private and has not been published to npm. Its JSON tokens, CSS and font can be consumed by both the Vue admin and the Astro website.

## Contents

- `src/tokens.json`: source design tokens, using DTCG types, groups and aliases.
- `src/tokens.css`: generated variables, scoped to `.dv-theme`.
- `src/neutral.json`: neutral palette overrides; the compiler generates `.dv-theme.dv-neutral` from the same semantic roles.
- `src/components.css`: framework-independent button, input, badge, panel and table styles.
- `src/fonts.css`: optional self-hosted Mona Sans. Load once per application.
- `src/fonts/OFL.txt`: upstream font license.

The token builder intentionally supports the subset used here: sRGB colour, dimension, font family and token aliases. It is not a general DTCG transformer. Extend validation and adopt a maintained token compiler if the system grows to other platforms or complex theme resolution.

## Local development

From the repository root:

```sh
npm run build --prefix packages/design-system
npm run check --prefix packages/design-system
npm run design:dev --prefix client
```

Open `http://127.0.0.1:5174/design-system.html`. No server, authentication or database is needed. This single reference page has a theme switch and real production controls as well as foundations, component contracts, toast styling and usage guidance. Product layouts live only in the real admin and are not duplicated here.

```sh
npm run design:check --prefix client
npm run design:build --prefix client
```

The static reference is built to `client/dist/design-system/`. Its entry is `design-system.html`; serve this directory using any static host. Production client builds do not include this entry.

## Consumer API

For a local consumer, install this directory as a file dependency (or install a packed release archive). The existing proposal imports source files directly so it needs no dependency or lockfile changes.

```css
@import '@damvia/design-system/fonts.css';
@import '@damvia/design-system/tokens.css';
@import '@damvia/design-system/components.css';
```

```html
<section class="dv-theme">
  <button type="button" class="dv-button dv-button--primary">Save changes</button>
  <span class="dv-badge dv-badge--success">Approved</span>
</section>
```

Vue and Astro use identical class and variable names. Typography is optional: import the font only on branded surfaces. The stylesheet does not apply a global reset. Do not import the preview composition stylesheet into a product.

### Current component contracts

| Class | Variants / notes |
| --- | --- |
| `dv-button` | `--primary`, `--quiet`, `--small`, `--icon`; use native disabled/type attributes |
| `dv-input` | Use a persistent label; describe errors with `aria-describedby` |
| `dv-select` | Native select; always provide a label |
| `dv-badge` | Square data label; `--success`, `--warning`, `--danger`, `--blue`; include text |
| `dv-panel` | Rounded passive layout surface; semantic section/heading remains consumer-owned |
| `dv-toast` | Square midnight notification surface; status modifiers `--success`, `--danger`, `--warning`, `--info` tint the labelled icon; square action and close controls |
| `dv-breadcrumb` | Square navigation path with linked ancestors, a plain-text current page, truncated-label tooltips and an ellipsis menu for hidden ancestors |
| `dv-table` | Wrap in `dv-table-wrap`; use caption, headings and sort semantics |

The shape rule follows purpose. Interactive elements use `radius.control = 0`: buttons, fields, navigation, menus and interactive cards. Data and feedback elements use `radius.data = 0`: badges, charts, progress bars, tables and notifications. Passive layout surfaces use `radius.surface = 12px`, while purely visual colour and brand samples may use `radius.graphic = 8px`. Avatars and conventional radio controls may remain circular because their shape carries identity or interaction meaning.

The button and badge Vue wrappers in the reference demonstrate the class API. Blue-filled buttons always use white text on strong blue; disabled buttons use readable neutral colours at full opacity. Never pair dark-blue text with a light-blue button background. These wrappers are not a published Vue component library. Advanced controls should continue to use the product’s existing accessible primitives rather than duplicating their interaction logic.

All clickable actions and navigation elements inside `.dv-theme` use the pointer cursor. Disabled native controls and elements marked with `aria-disabled="true"` use the not-allowed cursor.

Text uses semantic roles instead of local grey shades. Light surfaces use `text.primary` and `text.secondary`; dark navigation surfaces use `text.on-dark`, `text.on-dark-secondary` and `text.on-dark-muted`. Status colours should only communicate status.

## Theming boundary

The `dv-` prefix avoids collisions with the current Tailwind/shadcn theme. Variables exist only under `.dv-theme`; there are no `:root` tokens. The client uses `.dv-theme.dv-neutral.dv-client`; the admin uses `.dv-theme.dv-admin`. These are two themes of one system, not separate component libraries. Shared production controls live in `client/src/styles/controls.css`; client layout styling lives in `client/src/styles/client.css`. Set tenant font and brand override variables on `:root` so body-teleported overlays can inherit them.

## Distribution

The existing website reads documentation through its Damvia submodule. The contributing guide can therefore become public without a new documentation stack. Publishing still requires merging the design work, updating the website submodule and deploying it. A package release and a component explorer are later, explicit release steps.

Use semantic versions once public. Token renames/removals or semantic changes need a migration note and a breaking release; deprecate aliases first. Add component stories and screenshot regression checks when production components are adopted.

Code inherits AGPL-3.0-or-later from Damvia. Mona Sans retains its separate OFL. The font was copied from the existing `damvia-website/public/fonts/Mona-Sans.woff2` asset; its upstream license is from `github/mona-sans`.

References: [DTCG format 2025.10](https://www.designtokens.org/tr/2025.10/format/), [Storybook sharing](https://storybook.js.org/docs/sharing), [Mona Sans](https://github.com/github/mona-sans).
