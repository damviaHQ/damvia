# Page map

Repo-only. Which documentation page covers which part of the code. Update the page on the right when you touch the code on the left.

| Code | Page(s) |
|---|---|
| `server/test/`, `client/test/unit/`, `client/vitest.config.ts`, `.github/workflows/ci.yml` | `contributing/index.md`, `reference/validation-status.md`, `getting-started/local-setup.md` |
| `server/src/env.ts` | `reference/environment-variables.md`, `configuration/server-env.md` |
| `server/.env.template`, `client/.env.template` | `reference/environment-variables.md`, `configuration/client-env.md` |
| `server/src/worker.ts` | `reference/background-jobs.md`, `deployment/worker-and-scaling.md` |
| `server/src/index.ts` (startup, 5-minute sync loop) | `integrations/index.md`, `deployment/worker-and-scaling.md` |
| `server/src/server.ts` (Fastify, CORS, body limit, `/v1/downloads/:id`) | `deployment/reverse-proxy.md`, `administration/downloads.md` |
| `server/src/cli.ts`, `server/src/services/system.ts` | `reference/cli.md`, `deployment/integrity-check.md` |
| `server/src/asset-updater/sources.ts` (`ASSET_SOURCES`, overlap rules), `server/src/env.ts` (`assetUpdaters`), `server/src/entity/asset-source.ts` (run status) | `integrations/sources.md`, `reference/environment-variables.md`, `administration/dashboard.md` |
| `server/src/asset-updater/dropbox.ts` | `integrations/dropbox.md` |
| `server/src/asset-updater/one-drive.ts` | `integrations/onedrive.md` |
| `server/src/asset-updater/google-drive.ts` | `integrations/google-drive.md` |
| `server/src/asset-updater/base.ts`, `services/asset.ts` (upsert, deletion, thumbnails, record assignment, source adoption) | `administration/assets-tree.md`, `administration/records.md`, `integrations/sources.md` |
| `server/src/services/image-processor.ts` | `administration/assets-tree.md`, `getting-started/index.md` (system packages) |
| `server/src/services/mailer.ts`, `server/mailconfig.json` | `configuration/email-templates.md`, `integrations/smtp.md` |
| `server/src/services/user.ts`, `trpc/router/user.ts`, `trpc/router/authorized-domain.ts` | `administration/users-and-approval.md`, `introduction/roles-and-access.md`, `getting-started/first-admin.md` |
| `server/src/trpc/index.ts` (auth predicates) | `introduction/roles-and-access.md` |
| `server/src/services/collection.ts`, `trpc/router/collection.ts`, `trpc/router/collection/invitation.ts`, `entity/collection.ts` | `administration/collections-and-sharing.md`, `introduction/roles-and-access.md` |
| `client/src/utils/pageFilter.ts`, `composables/usePageFilter.ts`, `components/PageFilterBar.vue`, `PageFilterToggle.vue`, `FilterChipList.vue`, `TableSortHeader.vue`, `components/collection/CollectionRender*.vue`, `CollectionDisplayList*.vue` | `administration/collections-and-sharing.md`, `administration/menu-and-pages.md` |
| `server/src/trpc/router/region.ts`, `group.ts`, `entity/region.ts`, `entity/group.ts` | `administration/groups-and-regions.md` |
| `server/src/trpc/router/license.ts`, `entity/license.ts` | `administration/licenses.md` |
| `server/src/trpc/router/asset-type.ts`, `entity/asset-type.ts` | `administration/asset-types.md` |
| `server/src/trpc/router/enrichment.ts`, `entity/enrichment-run.ts`, `client/src/views/admin/admin-enrichment-overview.vue`, `admin-variants.vue` | `administration/records.md`, `administration/variants.md`, `integrations/index.md`, `contributing/api.md` |
| `server/src/services/variant-grouping.ts`, `variant-axes.ts`, `trpc/router/variant-group.ts`, `variant-axis.ts`, `entity/variant-*.ts`, `client/src/components/collection/CollectionVariantGroupPanel.vue`, the stacked card in `CollectionDisplayGridFiles.vue` | `administration/variants.md`, `administration/asset-types.md`, `administration/collections-and-sharing.md`, `contributing/api.md`, `contributing/data-model.md` |
| `server/src/services/file-metadata.ts`, `trpc/router/metadata-field.ts`, `trpc/router/entity-csv.ts`, `entity/metadata-field.ts`, `asset-file-metadata-value.ts`, `asset-entity-csv-mapping.ts`, `client/src/views/admin/admin-fields.vue`, the metadata filters in `client/src/utils/searchQuery.ts` and `client/src/components/search/SearchPanel.vue` | `administration/records.md`, `reference/cli.md`, `reference/background-jobs.md`, `contributing/api.md`, `contributing/data-model.md` |
| `server/src/services/entity-resolution.ts`, `trpc/router/resolver-step.ts`, `trpc/router/entity-resolution.ts`, `entity/asset-entity-link.ts`, `asset-file-resolution.ts`, `asset-type-resolver-step.ts`, `asset-folder-entity-attachment.ts`, `client/src/views/admin/admin-matching.vue`, `admin-unmatched.vue`, `client/src/components/admin/RecordPicker.vue` | `administration/records.md`, `administration/assets-tree.md`, `reference/background-jobs.md`, `reference/environment-variables.md`, `contributing/api.md`, `contributing/data-model.md` |
| `server/src/trpc/router/asset-type-rule.ts`, `services/asset-type-rules.ts`, `services/enrichment.ts`, `entity/asset-type-rule.ts`, `client/src/views/admin/admin-folder-rules.vue` | `administration/asset-types.md`, `administration/assets-tree.md`, `integrations/index.md`, `contributing/api.md` |
| `server/src/trpc/router/asset.ts`, `entity/asset-file.ts`, `entity/asset-folder.ts` | `administration/assets-tree.md` |
| `server/src/trpc/router/menu-item.ts`, `page.ts`, `services/page.ts`, `services/page-storage.ts`, `page-blocks/schema.ts`, `page-blocks/sanitize.ts`, `entity/menu-item.ts`, `page.ts`, `page-block.ts`, `client/src/components/page-renderer/`, `client/src/components/page-editor/` | `administration/menu-and-pages.md` |
| `server/src/trpc/router/record.ts`, `record-attribute.ts`, `entity/data-record.ts`, `record-attribute.ts`, `record-change.ts`, `enrichment-settings.ts`, `services/records.ts`, `record-values.ts`, `record-history.ts`, `record-files.ts`, `trpc/router/settings.ts` (`getEnrichment`, `updateEnrichment`), `client/src/views/admin/records/`, `client/src/components/records/`, `client/src/utils/recordValues.ts`, `recordFilters.ts`, `recordImport.ts`, `client/src/views/admin/admin-settings.vue` (record label section), `client/src/composables/useRecordLabel.ts`, `useGridNavigation.ts`, `useRecordsGridPreferences.ts` | `administration/records.md`, `contributing/api.md`, `contributing/data-model.md` |
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
| `client/src/services/server.ts`, `client/src/stores/globalStore.ts` (token, cookie) | `deployment/client-build.md`, `deployment/reverse-proxy.md` |
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
| JWT, password reset, invitation expiry and signed storage links | `administration/accounts-and-links.md` |
| Worker failures, provider credentials, temporary storage and monitoring | `deployment/operations.md` |
| Release, installation and restore qualification | `deployment/acceptance-checklist.md`, `reference/validation-status.md` |
| Unresolved implementation defects | `reference/known-limitations.md` (remove or update entries when fixed) |
| Documentation rendering and validation | `docs/README.md`, `scripts/`, `.github/workflows/docs.yml`; matching renderer and build checks in the website repository |

End-user instructions are maintained as a separate how-to knowledge base and onboarding on the public website. This repository documents the product model, installation, configuration, administration, operation and contribution contracts. Do not duplicate the website walkthroughs here.

## Relevance test for documentation updates

Update a public page when a code change alters a reader's action, visible result, configuration, supported capability, permission, limit, compatibility, failure mode or recovery procedure. Keep implementation-only changes in code, tests, pull requests or `_internal/` notes. Rewrite the existing explanation instead of appending a chronological account of the change.
