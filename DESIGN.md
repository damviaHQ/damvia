# Damvia design system — proposal 0.1

The approved direction is being implemented on `2609-design-system`. The production admin shell and dashboard now adopt it; the tenant portal retains its branding. The interactive reference is `client/design-system.html`; the shared foundation is `packages/design-system`.

## Direction

A bright, focused working surface anchored by Damvia’s midnight blue. Preserve the existing logo and brand colours `#0044F4` and `#00052F`. Use blue for decisions and navigation, pale blue for selection and attention, and cool neutral surfaces for everyday work. The recognisable pairing should carry from the admin into the website without imposing Damvia branding on a customer’s portal.

Mona Sans, already present in the website repository, unifies the typography. Use its more expressive scale and restrained width variation on the website; use its regular width in the admin. Self-host the font; keep system and Inter fallbacks. The font and its upstream OFL license ship in the shared package.

## Confirmed button rules

Buttons, inputs and selects have 0 px radius so paired controls align. Sidebar menu items also have square active and hover backgrounds. Retain rounded panels, modals, badges and other components where useful. This shape direction is approved, not a temporary comparison.

Never use dark-blue text on a light-blue button background. Filled blue buttons use white text on strong Damvia blue, with a deeper blue on hover. This applies to anchor links styled as buttons as well as native buttons. Disabled buttons use a readable neutral surface and secondary text at full opacity; do not fade a blue button into a pale-blue state. Button hover and selected states follow the same contrast rule. Pale-blue panels and noninteractive badges remain available.

## Foundation

`packages/design-system/src/tokens.json` is the source of truth. It uses DTCG token types, groups and aliases. Run the package build to generate the scoped CSS custom properties; never edit `tokens.css` independently.

| Decision | Token | Value |
| --- | --- | --- |
| Primary action | `--dv-action-primary` | `#0044F4` |
| Action hover | `--dv-action-hover` | `#0036C4` |
| Navigation and brand structure | `--dv-surface-nav` | `#00052F` |
| Selected and soft emphasis | `--dv-action-soft` | `#DFE9FF` |
| Working canvas | `--dv-surface-canvas` | `#F6F8FC` |
| Main text | `--dv-text-primary` | `#172343` |
| Supporting text | `--dv-text-secondary` | `#64718A` |
| Panel surface | `--dv-surface-panel` | `#FFFFFF` |
| Button / field / panel radius | `--dv-radius-button` / `--dv-radius-field` / `--dv-radius-lg` | 0 / 0 / 12 px |
| Spacing | `--dv-space-*` | 4, 8, 12, 16, 20, 24, 32, 40, 48, 64 px |
| Type | `--dv-size-*` | Caption 12, body 14, section 17, heading 32, display 56 px |

The prototype also contains surface-specific composition and decorative tones. They are not all stable public tokens. Promote a value into the shared foundation when repeated use establishes its purpose; do not turn every layout measurement into a token.

## Surfaces

**Admin — operate.** A midnight navigation rail, restrained white panels, purposeful summaries, legible user tables and one clear primary action per task. Dashboard content should answer “what needs attention?” before becoming a reporting surface. User management needs named search, role/region/group filters, approval views, sorting, pagination, selection, export, and protected role changes.

**Website — persuade.** Reuse the palette, logo and type, with larger display typography, more open composition and campaign artwork. The Brand in use page is an expression study, not a new website or a claim about available product features.

**Client portal — browse and share.** Retain tenant branding, logo, assets, configurable colours and existing simplicity. Only opt in to neutral layout, accessible controls and useful interactions after separate review. Never wrap the existing portal in `.dv-theme` as part of the admin migration.

## Interaction and accessibility

- Native buttons, labels, selects and checkboxes; visible keyboard focus.
- User details open in a centred modal with a labelled title, focus trapping, Escape dismissal and return focus to the opening control. Keep role changes and approvals in this immediately accessible view.
- Selection states, sortable table headers and textual status indicators.
- Status changes announce through a live region. Search has an explicit empty state.
- Approval and email verification are separate states. Unverified users are not approvable.
- Clear active filters on request. Reset pagination and selection when filters change.
- Export the selected records, or all matching records if nothing is selected; never only the visible page without saying so.
- Encode CSV fields and neutralise formula-leading cells.
- Responsive navigation, wide-table scrolling and larger touch controls on mobile.
- The mobile navigation hides its inactive content from focus. The production shell uses an in-flow disclosure and closes it on navigation; overlay navigation must trap focus and support Escape.
- Respect reduced motion. Animation communicates a loading state, not decoration.

## Reuse and release

Share design tokens, fonts and component CSS across Vue and Astro. Keep complex product behaviour in Vue, using the existing Reka/Radix accessibility primitives during the real admin rebuild. Do not force a Vue runtime onto static marketing pages just to share styles. Keep shadcn as the product component foundation and apply Damvia tokens to its styles. The preview dialog reuses the existing shadcn Dialog root and Radix content, overlay, title and close primitives; it avoids loading production Tailwind styles into the standalone preview. Do not replace the production shadcn components in this proposal.

The package is private during design review. Publish a versioned release only after the API, naming, license and maintenance policy are settled. Keep the existing AGPL license; no new permissive license is implied. Open-source contributors can already inspect the files. Documentation is prepared in `docs/contributing/design-system.md`, which follows the existing website’s Starlight pipeline.

Migration sequence: agree on the direction, stabilise foundational components, rebuild the admin shell and users page with real permissions and data, migrate remaining admin workflows, apply the system to the Astro website, then evaluate selective neutral portal improvements. Add public component stories and visual regression coverage as production components stabilise.

## Admin copy

Use direct page titles and factual labels. Omit decorative dates, welcome slogans and brand taglines from working screens. Supporting text should explain a state, consequence or next action.
