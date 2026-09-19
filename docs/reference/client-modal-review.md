# Client modal review — 2609-v2

Desktop review with isolated sample data at 1440 × 1000. The client uses the neutral theme and shared shadcn/Reka components; no decorative modal animation is introduced.

| Surface | Reviewed content |
| --- | --- |
| Account | Display preferences with five aligned rows; profile; populated downloads and links; account-deletion confirmation |
| Search | Filter labels, controls, search terms and actions |
| Collection settings | Details, visibility, appearance, thumbnail and actions |
| Sharing | Guest email, expiry date, invitations empty state and actions |
| Create collection | Private collection and nested public collection with no available parents |
| Add selection | Private/public tabs, empty selection tree and nested creation |
| Asset preview | Image preview, formats, download options and nested license terms |
| Selected downloads | Eight sample files, download options and nested license terms |
| Page editor | Initial selector plus collections, files, latest files, text, image and video panels |

`client/test/ui/modals.spec.ts` exercises these routes and checks browser errors, dialog bounds, account navigation highlights, aligned display controls and populated link-table bounds. Existing client tests verify shared field tokens, breadcrumb alignment, folder-tree navigation and preview interactions.

Visual foundation for regular dialogs and confirmations: `client/src/components/ui/dialog/styles.ts`. Form spacing and controls remain defined in `client/src/components/ui/field/styles.ts` and the design-system tokens. Account panel titles and descriptions are defined once in `LayoutDialogMember.vue`.

Review fixes include public collection creation crashing on an empty parent list, link actions overflowing the account panel, active account navigation losing its highlight on hover, profile validation appearing before editing, and page-editor layout depending on dashboard-only styles.

Limits: tests intercept API calls and do not send invitations, delete accounts, upload files or perform real downloads. Dedicated mobile layout and the separate dashboard modal inventory are outside this desktop client review. Full application type checking still reports the existing diagnostics; this pass introduced no new diagnostic messages compared with the preceding field-system check.
