---
title: Client accessibility review
description: Accessibility audit of the client on 2609-v2 with axe-core results, keyboard and focus checks, and the recommended changes in priority order.
sidebar:
  order: 10
lastUpdated: 2026-09-19
draft: true
---

Reviewed 19 September 2026 on 2609-v2. Read-only audit; no UI changes made.

## Scope and evidence

Reviewed shared typography, breadcrumb, fields, selection controls and client
source. Ran axe-core 4.10.3 with WCAG 2 A/AA and 2.1 AA rules against isolated
fixtures in Chromium at 1440 × 1000: collection, search page, login, search
modal, display preferences, edit collection, share collection and create
collection. Fixtures intercepted API calls; no real records were changed.

Measured rendered breadcrumb and placeholder styles. Tested 20 successive Tab
presses and Escape/focus return in each of the five dialogs. Inspected the
search dialog at 720 × 500 and measured collection overflow at that size.

## Findings, ordered by priority

| Priority | Finding | Evidence | Recommended change |
| --- | --- | --- | --- |
| Resolved 2026-09-19 (search filters are now labelled `ui/checkbox` rows in the search panel) | Search filters lack programmatically associated labels (1.3.1 / 3.3.2 / 4.1.2) | Axe flags four inputs: asset type, search scope, product view and file type. Actual inputs have no id or accessible name. `input-id` lands on the tree-select wrapper, so the visible Label `for` does not reach the input. | Correct this in a shared tree-select adapter, including generated facets and other uses. Verify accessible name, expanded state, option selection and keyboard operation. |
| Resolved 2026-09-19 (placeholders use `--dv-text-secondary`) | Search placeholder contrast fails 1.4.3 | Rendered search-terms placeholder is 13px, neutral-400 (OKLCH lightness .708), approximately 2.5:1 against white. Required normal-text contrast is 4.5:1. This was measured separately; axe did not flag it. | Use the shared secondary-text token instead of the pale local placeholder override. |
| Medium | Breadcrumb feels light despite passing colour contrast | Actual ancestors render at 14px / weight 400 / #626262, around 6.10:1 against white. Current item is 14px / 600 / #262626. Shared CSS still declares 12px, while the component utility currently wins. | Remove the competing size rule; consume the body-size token. Use weight 500 for ancestors and 600 for the current item. A readability improvement, not a confirmed contrast failure. |
| Medium | Small text bypasses shared typography | Collection/file table headings use 11px, cells 13px, file metadata 12px; search placeholder is 13px. | Define primary text, labels/navigation and secondary metadata roles once. Use the body token for interactive text and table values; reserve smaller text for supplementary information. WCAG does not prescribe a universal minimum font size. |
| Advisory | Small pointer targets | Breadcrumb ellipsis is 20 × 28px; sidebar add button 28px; some card actions are 24px. | Increase invisible hit areas where possible without increasing icon size or visual padding. Review overlap/spacing and touch behaviour separately. 44 × 44px is WCAG 2.1 AAA (2.5.5), not an AA requirement. |

## Checks that passed within this sample

- No automated A/AA violations in collection, login or the five scanned dialogs.
- All five dialogs retained focus during the 20-Tab checks and returned focus
  to their trigger on Escape. This is a sampled keyboard check, not exhaustive
  coverage of every interaction or nested dialog.
- Breadcrumb grey: approximately 6.10:1 on white. Secondary neutral-500 text:
  approximately 4.74:1 on white and 4.54:1 on #fafafa, so it has little margin
  for lighter rendering or a darker background.
- The shared #8f8f8f control border has approximately 3.23:1 contrast on white
  and 3.10:1 on #fafafa. Decorative separators do not need the same treatment.
- At a 720px viewport, collection main content measured 720px with no horizontal
  overflow; the search dialog measured 686px with no internal horizontal overflow.

## Limits and remaining verification

This is not a conformance certification. Automated tools miss issues, including
this placeholder contrast failure. Axe marked background focus handling for
manual review while dialogs were open; the sampled keyboard checks stayed inside.

The 720 × 500 test is a half-size viewport proxy for a 1440 × 1000 display at
200% zoom, not actual browser zoom. Real 200% zoom, 400%/320px reflow, text-only
resize, text-spacing overrides, VoiceOver/NVDA output and a full keyboard pass
through tree-select choices remain unverified. Media captions and audio
alternatives require real content review. Auth error states, all nested account
panels, asset preview/download variants and tenant-specific colours also need
coverage before claiming whole-app AA compliance.

The working checkout received concurrent changes during the audit; results
reflect the rendered sample at review time. Re-run checks after remediation.

## Suggested design-system decisions

1. Keep the neutral palette, but use shared text roles rather than local grey
   and pixel-size exceptions.
2. Set breadcrumb ancestors to medium weight and keep the current item semibold.
3. Repair the shared tree-select semantics and placeholder colour first.
4. Add label and contrast regression coverage, followed by assistive-technology
   and real browser-zoom validation. Keep the sentence-style search controls.

## Standards

- [W3C: Contrast minimum, WCAG 2.1 AA](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html)
- [W3C: Target size, WCAG 2.1 AAA](https://www.w3.org/WAI/WCAG21/Understanding/target-size.html)
