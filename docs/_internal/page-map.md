# Page map

Contributor reference, kept in the repository and not published on the documentation site. It lists which documentation page covers which part of the code: when you change the code on the left, update the page on the right in the same pull request.

| Code | Page(s) |
|---|---|
| `server/test/`, `client/test/unit/`, `client/vitest.config.ts`, `.github/workflows/ci.yml` | `contributing/index.md`, `reference/validation-status.md`, `getting-started/local-setup.md` |
| `client/src/mobile/`, `client/src/composables/useIsPhone.ts`, `client/src/layouts/LayoutRouter.vue`, `meta.mobile` / `meta.roles` in `client/src/router/` | `administration/phones.md`, `contributing/architecture.md` |
| `server/src/services/download.ts` (`DOWNLOAD_LIMITS`, `downloadDelivery`), `client/src/utils/downloadDelivery.ts`, the `/v1/downloads` route in `server/src/server.ts` | `administration/downloads.md`, `administration/phones.md`, `administration/accounts-and-links.md` |
| `server/src/env.ts` | `reference/environment-variables.md`, `configuration/server-env.md` |
| `server/.env.template`, `client/.env.template` | `reference/environment-variables.md`, `configuration/client-env.md` |
| `server/src/worker.ts` | `reference/background-jobs.md`, `deployment/worker-and-scaling.md` |
| `server/src/index.ts` (startup, 5-minute sync loop) | `integrations/index.md`, `deployment/worker-and-scaling.md` |
| `server/src/server.ts` (Fastify, cookie, helmet, CORS and origin check, request log, body limit, `/v1/downloads/:id`, `/v1/branding/email-logo.png`, `/v1/newsletter-images/`, `/v1/unsubscribe/`, `/v1/email-events/`) | `deployment/reverse-proxy.md`, `administration/downloads.md`, `contributing/architecture.md`, `integrations/smtp.md` |
| `server/src/cli.ts`, `server/src/services/system.ts` | `reference/cli.md`, `deployment/integrity-check.md` |
| `server/src/asset-updater/sources.ts` (`ASSET_SOURCES`, overlap rules), `server/src/env.ts` (`assetUpdaters`), `server/src/entity/asset-source.ts` (run status) | `integrations/sources.md`, `reference/environment-variables.md`, `administration/dashboard.md` |
| `server/src/asset-updater/dropbox.ts` | `integrations/dropbox.md` |
| `server/src/asset-updater/one-drive.ts` | `integrations/onedrive.md` |
| `server/src/asset-updater/google-drive.ts` | `integrations/google-drive.md` |
| `server/src/asset-updater/base.ts`, `services/asset.ts` (upsert, deletion, thumbnails, record assignment, source adoption) | `administration/assets-tree.md`, `administration/records.md`, `integrations/sources.md` |
| `server/src/services/image-processor.ts` | `administration/assets-tree.md`, `getting-started/index.md` (system packages) |
| `server/src/services/mailer.ts`, `server/src/mail/` (catalogue, renderer, layout) | `configuration/email-templates.md`, `integrations/smtp.md` |
| `client/src/views/admin/admin-emails.vue`, `admin-email-edit.vue`, `server/src/trpc/router/email-template.ts` | `administration/emails.md` |
| `server/src/trpc/router/newsletter.ts`, `services/newsletter.ts`, `services/audience.ts`, `services/newsletter-image.ts`, `services/email-domain.ts`, `services/email-events.ts`, `mail/newsletter-sanitize.ts`, `client/src/views/admin/admin-newsletters.vue`, `admin-newsletter-edit.vue`, `components/newsletter/`, `views/public/public-unsubscribe.vue`, `components/account/AccountNewsletters.vue` | `administration/newsletters.md`, `integrations/smtp.md`, `reference/background-jobs.md`, `contributing/api.md` |
| `server/src/services/email-domain.ts` (sender domain check) | `administration/emails.md`, `integrations/smtp.md` |
| `server/src/services/privacy.ts` (export and anonymisation) | `configuration/privacy.md` |
| `server/src/services/branding.ts` (logo, email logo, `brandName`) | `configuration/branding.md`, `configuration/email-templates.md` |
| Accent colour (`brand_settings`, `client/src/lib/brand-color.ts`) | `configuration/branding.md` |
| `server/src/services/user.ts`, `trpc/router/user.ts`, `trpc/router/authorized-domain.ts` | `administration/users-and-approval.md`, `introduction/roles-and-access.md`, `getting-started/first-admin.md` |
| `server/src/trpc/index.ts` (auth predicates, MFA enrolment gate) | `introduction/roles-and-access.md`, `contributing/api.md` |
| `server/src/trpc/router/audit.ts`, `services/audit.ts`, `entity/audit-log.ts`, `trpc/index.ts` (`EXPLICITLY_AUDITED`), `client/src/views/admin/admin-audit-log.vue` | `administration/audit-log.md`, `contributing/api.md`, `contributing/data-model.md`, `reference/background-jobs.md` |
| `server/src/services/oidc.ts`, `server/src/oidc-routes.ts` | `integrations/single-sign-on.md`, `reference/environment-variables.md` |
| `server/src/services/security-checks.ts`, `server/src/load-env.ts` | `configuration/server-env.md`, `reference/environment-variables.md`, `deployment/server-docker.md` |
| `server/src/trpc/router/auth.ts`, `services/session.ts`, `services/sign-in.ts`, `services/login-token.ts`, `services/rate-limit.ts`, `services/mfa.ts`, `services/password-policy.ts`, `entity/user-session.ts`, `entity/login-token.ts` | `administration/accounts-and-links.md`, `configuration/server-env.md`, `contributing/api.md`, `contributing/data-model.md`, `reference/troubleshooting.md` |
| `server/src/services/security-checks.ts` (`security.configuration` warnings) | `configuration/server-env.md`, `deployment/server-docker.md` |
| `server/src/load-env.ts` (`loadFileVariables`, `*_FILE`) | `reference/environment-variables.md`, `deployment/server-docker.md` |
| `client/src/views/account.vue`, `client/src/components/account/`, `client/src/components/layout-main/MainTopbarDownloadNotification.vue` | `administration/downloads.md`, `administration/collections-and-sharing.md`, `contributing/architecture.md` |
| `client/src/views/auth/auth-login.vue` (link and invitation exchange, MFA step), `client/src/components/auth/MfaSetup.vue`, `client/src/components/account/AccountSecurity.vue` (Account > Security) | `administration/accounts-and-links.md`, `contributing/architecture.md` |
| `server/src/services/collection.ts`, `trpc/router/collection.ts`, `trpc/router/collection/invitation.ts`, `entity/collection.ts` | `administration/collections-and-sharing.md`, `introduction/roles-and-access.md` |
| `client/src/utils/pageFilter.ts`, `composables/usePageFilter.ts`, `components/PageFilterBar.vue`, `PageFilterToggle.vue`, `FilterChipList.vue`, `TableSortHeader.vue`, `components/collection/CollectionRender*.vue`, `CollectionDisplayList*.vue` | `administration/collections-and-sharing.md`, `administration/menu-and-pages.md` |
| `server/src/trpc/router/region.ts`, `group.ts`, `entity/region.ts`, `entity/group.ts` | `administration/groups-and-regions.md` |
| `server/src/trpc/router/organisation.ts`, `entity/organisation.ts`, `users.organisation_id`, `client/src/views/admin/admin-organisations.vue`, the organisation field of `client/src/components/admin/AdminUserEdit.vue` | `administration/organisations.md`, `administration/users-and-approval.md`, `contributing/api.md`, `contributing/data-model.md` |
| `server/src/modules/`, `moduleEventQueue` in `server/src/worker.ts`, `emitModuleEvent` calls (`services/record-history.ts`, `index.ts`), `client/src/modules.ts`, `client/src/components/ModuleSlot.vue` and its places, `damviaModules()` in `client/vite.config.ts`, `server/test/fixtures/module-*.cjs`, `client/test/fixtures/module-hello/` | `contributing/modules.md`, `reference/environment-variables.md`, `reference/background-jobs.md`, `contributing/api.md` |
| `server/src/trpc/router/license.ts`, `entity/license.ts` | `administration/licenses.md` |
| `server/src/trpc/router/asset-type.ts`, `entity/asset-type.ts` | `administration/asset-types.md` |
| `server/src/trpc/router/enrichment.ts`, `entity/enrichment-run.ts`, `client/src/components/admin/EnrichmentPass.vue`, `client/src/views/admin/admin-variants.vue` | `administration/records.md`, `administration/variants.md`, `integrations/index.md`, `contributing/api.md` |
| `server/src/services/variant-grouping.ts`, `variant-axes.ts`, `trpc/router/variant-group.ts`, `variant-axis.ts`, `entity/variant-*.ts`, `client/src/components/collection/CollectionVariantBand.vue`, `client/src/composables/useVariantGroups.ts`, the stacked card in `CollectionDisplayGridFiles.vue` and `CollectionDisplayListFiles.vue` | `administration/variants.md`, `administration/asset-types.md`, `administration/collections-and-sharing.md`, `contributing/api.md`, `contributing/data-model.md` |
| `server/src/services/file-metadata.ts`, `trpc/router/metadata-field.ts`, `trpc/router/entity-csv.ts`, `entity/metadata-field.ts`, `asset-file-metadata-value.ts`, `asset-entity-csv-mapping.ts`, `client/src/views/admin/admin-file-metadata.vue`, the metadata filters in `client/src/utils/searchQuery.ts` and `client/src/components/search/SearchPanel.vue` | `administration/records.md`, `reference/cli.md`, `reference/background-jobs.md`, `contributing/api.md`, `contributing/data-model.md` |
| `server/src/services/entity-resolution.ts`, `trpc/router/resolver-step.ts`, `trpc/router/entity-resolution.ts`, `entity/asset-entity-link.ts`, `asset-file-resolution.ts`, `asset-type-resolver-step.ts`, `asset-folder-entity-attachment.ts`, `client/src/views/admin/admin-matching.vue`, `client/src/components/admin/LinkReview.vue`, `LinkFolderDialog.vue`, `RecordPicker.vue`, `RecordTargetPicker.vue` | `administration/records.md`, `administration/assets-tree.md`, `reference/background-jobs.md`, `reference/environment-variables.md`, `contributing/api.md`, `contributing/data-model.md` |
| `server/src/trpc/router/asset-type-rule.ts`, `services/asset-type-rules.ts`, `services/enrichment.ts`, `entity/asset-type-rule.ts`, `client/src/views/admin/admin-folder-rules.vue` | `administration/asset-types.md`, `administration/assets-tree.md`, `integrations/index.md`, `contributing/api.md` |
| `server/src/trpc/router/asset.ts`, `entity/asset-file.ts`, `entity/asset-folder.ts` | `administration/assets-tree.md` |
| `server/src/trpc/router/menu-item.ts`, `page.ts`, `services/page.ts`, `services/page-storage.ts`, `page-blocks/schema.ts`, `page-blocks/sanitize.ts`, `entity/menu-item.ts`, `page.ts`, `page-block.ts`, `client/src/components/page-renderer/`, `client/src/components/page-editor/` | `administration/menu-and-pages.md` |
| `server/src/trpc/router/record.ts`, `record-attribute.ts`, `record-table.ts`, `entity/data-record.ts`, `record-attribute.ts`, `record-change.ts`, `record-table.ts`, `record-table-attribute.ts`, `services/record-tables.ts`, `enrichment-settings.ts`, `services/records.ts`, `record-values.ts`, `record-history.ts`, `record-files.ts`, `trpc/router/settings.ts` (`getEnrichment`, `updateEnrichment`), `client/src/views/admin/records/`, `client/src/components/records/` (including `RecordFieldsSheet.vue`), `client/src/utils/recordValues.ts`, `recordFilters.ts`, `recordImport.ts`, `gridRange.ts`, `client/src/views/admin/admin-settings.vue` (record label section), `client/src/composables/useRecordLabel.ts`, `useGridNavigation.ts`, `useRecordsGridPreferences.ts` | `administration/records.md`, `contributing/api.md`, `contributing/data-model.md` |
| `server/src/services/catalogue.ts`, `product-collections.ts`, `record-readiness.ts`, `record-families.ts`, `trpc/router/catalogue.ts`, `entity/collection-record.ts`, `readiness-definition.ts`, the product parts of `trpc/router/collection.ts` (`setRecordRules`, `removeRecords`, `addItems` with a record), `client/src/components/catalogue/`, `client/src/views/catalogue.vue`, `product.vue`, `client/src/components/collection/CollectionProductSettings.vue`, `client/src/components/collection/CollectionRenderProducts.vue`, `client/src/components/page-renderer/blocks/BlockProducts.vue`, `client/src/views/admin/admin-collection-products.vue`, `client/src/views/admin/admin-product-collections.vue`, `client/src/components/admin/AdminDialogCreateProductCollection.vue`, `client/src/utils/familyKey.ts` | `administration/catalogue.md`, `contributing/api.md`, `contributing/data-model.md`, `reference/background-jobs.md` |
| `server/src/services/search.ts`, `trpc/router/collection.ts` (`search`, `searchNotFound`), `client/src/components/search/*`, `client/src/components/layout-main/MainSearchBar.vue`, `client/src/views/search.vue`, `client/src/composables/useSearchState.ts` | `administration/records.md`, `administration/asset-types.md`, `contributing/api.md`, `contributing/design-system.md` |
| `server/src/trpc/router/favorite.ts`, `entity/user-favorite.ts`, `entity/user-collection-favorite.ts`, `client/src/composables/useCollectionFavorites.ts`, `client/src/views/favorites.vue`, `client/src/views/my-collections.vue` | `contributing/api.md`, `contributing/data-model.md`, `introduction/roles-and-access.md` |
| `server/src/trpc/router/download.ts`, `services/download.ts`, `entity/download.ts` | `administration/downloads.md` |
| `server/src/trpc/router/settings.ts` | `configuration/branding.md` |
| `server/src/services/storage.ts`, `trpc/router/dashboard.ts`, `entity/storage-usage.ts` | `administration/dashboard.md`, `deployment/operations.md`, `configuration/server-env.md`, `deployment/integrity-check.md` |
| `client/src/views/admin/admin-dashboard.vue`, `client/src/layouts/LayoutAdmin.vue` | `administration/dashboard.md`, `administration/index.md` |
| `server/src/trpc/router/analytics.ts`, `services/analytics.ts`, `entity/activity-event.ts`, `client/src/views/admin/admin-analytics.vue`, the activity inserts in `trpc/router/user.ts` (`me`), `download.ts`, `collection.ts` (`search`), `collection/invitation.ts`, `favorite.ts`, the view report in `client/src/components/collection/CollectionModalDownloadUnique.vue` | `administration/analytics.md`, `contributing/api.md`, `contributing/data-model.md` |
| Reader-visible meaning or lifecycle of a domain object | `introduction/concepts.md` or the relevant administration page; do not mirror entity fields there |
| `server/src/migrations/*` | `deployment/upgrading.md` |
| `server/Dockerfile` | `deployment/server-docker.md`, `getting-started/index.md` |
| `server/docker-compose.yml` | `getting-started/local-setup.md`, `reference/ports-and-services.md` |
| `client/tailwind.config.js` (brand colours), `client/index.html`, `client/public/` | `configuration/client-env.md`, `configuration/branding.md` |
| `client/src/services/server.ts`, `client/src/stores/globalStore.ts` (credentials, `whenReady`, legacy token exchange) | `deployment/client-build.md`, `deployment/reverse-proxy.md`, `configuration/client-env.md` |
| `client/src/router/index.ts` (admin routes) | `administration/index.md` |
| `client/vite.config.ts`, `client/package.json` scripts | `deployment/client-build.md` |
| `server/src/trpc/router/*` (procedure list) | `contributing/api.md` |
| `server/src/entity/*`, `server/src/migrations/*` (structure) | `contributing/data-model.md` |
| `server/src/worker.ts` (`createQueue` helper) | `contributing/background-jobs.md` |
| `server/src/asset-updater/base.ts`, `services/asset.ts` (`upsertFolder`, `upsertFile`) | `contributing/storage-drivers.md` |
| Folder layout of `server/src` and `client/src` | `contributing/architecture.md` |
| Package scripts, AGPL header, PR process | `contributing/index.md` |

## Cross-cutting operator references

| Concern | Pages |
|---|---|
| Sessions, email links, lockout, two-step verification, suspension, invitation expiry and signed storage links | `administration/accounts-and-links.md` |
| Worker failures, provider credentials, temporary storage and monitoring | `deployment/operations.md` |
| Release, installation and restore qualification | `deployment/acceptance-checklist.md`, `reference/validation-status.md` |
| Unresolved implementation defects | `reference/known-limitations.md` (remove or update entries when fixed) |
| Documentation rendering and validation | `docs/README.md`, `scripts/`, `.github/workflows/docs.yml`; matching renderer and build checks in the website repository |

End-user instructions are maintained as a separate how-to knowledge base and onboarding on the public website. This repository documents the product model, installation, configuration, administration, operation and contribution contracts. Do not duplicate the website walkthroughs here.

## Relevance test for documentation updates

Update a public page when a code change alters a reader's action, visible result, configuration, supported capability, permission, limit, compatibility, failure mode or recovery procedure. Keep implementation-only changes in code, tests or pull request descriptions. Rewrite the existing explanation instead of appending a chronological account of the change.
