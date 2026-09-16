# Page map

Repo-only. Which documentation page covers which part of the code. Update the page on the right when you touch the code on the left.

| Code | Page(s) |
|---|---|
| `server/src/env.ts` | `reference/environment-variables.md`, `configuration/server-env.md` |
| `server/.env.template`, `client/.env.template` | `reference/environment-variables.md`, `configuration/client-env.md` |
| `server/src/worker.ts` | `reference/background-jobs.md`, `deployment/worker-and-scaling.md` |
| `server/src/index.ts` (startup, 5-minute sync loop) | `integrations/index.md`, `deployment/worker-and-scaling.md` |
| `server/src/server.ts` (Fastify, CORS, body limit, `/v1/downloads/:id`) | `deployment/reverse-proxy.md`, `administration/downloads.md` |
| `server/src/cli.ts`, `server/src/services/system.ts` | `reference/cli.md`, `deployment/integrity-check.md` |
| `server/src/asset-updater/dropbox.ts` | `integrations/dropbox.md` |
| `server/src/asset-updater/one-drive.ts` | `integrations/onedrive.md` |
| `server/src/asset-updater/base.ts`, `services/asset.ts` (upsert, deletion, thumbnails, product assignment) | `administration/assets-tree.md`, `administration/products-and-pim.md` |
| `server/src/services/image-processor.ts` | `administration/assets-tree.md`, `getting-started/index.md` (system packages) |
| `server/src/services/mailer.ts`, `server/mailconfig.json` | `configuration/email-templates.md`, `integrations/smtp.md` |
| `server/src/services/user.ts`, `trpc/router/user.ts`, `trpc/router/authorized-domain.ts` | `administration/users-and-approval.md`, `introduction/roles-and-access.md`, `getting-started/first-admin.md` |
| `server/src/trpc/index.ts` (auth predicates) | `introduction/roles-and-access.md` |
| `server/src/services/collection.ts`, `trpc/router/collection.ts`, `trpc/router/collection/invitation.ts`, `entity/collection.ts` | `administration/collections-and-sharing.md`, `introduction/roles-and-access.md` |
| `server/src/trpc/router/region.ts`, `group.ts`, `entity/region.ts`, `entity/group.ts` | `administration/groups-and-regions.md` |
| `server/src/trpc/router/license.ts`, `entity/license.ts` | `administration/licenses.md` |
| `server/src/trpc/router/asset-type.ts`, `entity/asset-type.ts` | `administration/asset-types.md` |
| `server/src/trpc/router/asset.ts`, `entity/asset-file.ts`, `entity/asset-folder.ts` | `administration/assets-tree.md` |
| `server/src/trpc/router/menu-item.ts`, `page.ts`, `services/page.ts`, `entity/menu-item.ts`, `page.ts`, `page-block.ts` | `administration/menu-and-pages.md` |
| `server/src/trpc/router/pim.ts`, `product-attributes.ts`, `entity/product.ts`, `product-attribute.ts` | `administration/products-and-pim.md` |
| `server/src/trpc/router/download.ts`, `services/download.ts`, `entity/download.ts` | `administration/downloads.md` |
| `server/src/trpc/router/settings.ts` | `configuration/branding.md` |
| `server/src/services/storage.ts`, `trpc/router/dashboard.ts`, `entity/storage-usage.ts` | `administration/dashboard.md`, `deployment/operations.md`, `configuration/server-env.md`, `deployment/integrity-check.md` |
| `client/src/views/admin/admin-dashboard.vue`, `client/src/layouts/LayoutAdmin.vue` | `administration/dashboard.md`, `administration/index.md` |
| `server/src/entity/*` (all) | `introduction/concepts.md` |
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

End-user instructions are intentionally outside this technical documentation.
