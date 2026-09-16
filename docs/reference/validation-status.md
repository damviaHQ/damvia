---
title: Validation status
description: What was checked locally, which versions were inspected, and which integration tests remain unexecuted.
sidebar:
  order: 8
lastUpdated: 2026-09-16
---

The documentation was reviewed against application commit `b860246` on 16 September 2026, then updated for `f8eb687`, which adds hexadecimal brand colours without `#`. It now includes the access and credential changes tested on an isolated PostgreSQL database. The table distinguishes those tests from integrations still requiring a staging instance.

| Component | Observed version | Verification |
|---|---|---|
| Local Node | 22.14.0 | Used for local checks. The website lockfile includes `undici` requiring Node >=22.19.0; local npm emitted an engine warning, so use an up-to-date Node 22 for CI/deployment. |
| Server | Fastify 5, tRPC 11.1.0, TypeORM 0.3 | TypeScript compilation and 18 security regression tests passed against an isolated PostgreSQL instance, including fresh login tokens, API responses, direct exports and revoked-access exports. Storage and email are stubbed. |
| Client | Vue 3, Vite 5, tRPC 10.45.0 | Vite build passed. `vue-tsc --noEmit` fails on the typed inline callback in `search.vue`; full cross-version router type compatibility is not established. |
| Queue | pg-boss 10.2.0 | Actual registered archive callbacks tested for access denial and a temporary failure followed by a successful retry. Queue registration and delivery are stubbed; no live scheduler test. |
| PostgreSQL | 15 in development Compose | Migrations applied to an empty test database and the access migration checked against existing fixture rows. No production restore drill. |
| Documentation | Astro 7.3.2, Starlight 0.42.1 | Built locally with current Markdown; generated internal routes and anchors checked. |
| Docker image | `node:22-bookworm` base in the Dockerfile | The image was not rebuilt, and its media conversions were not tested during this review. |
| Dropbox / OneDrive / S3 / SMTP | Versions depend on deployment | Driver/configuration reviewed; no authenticated external integration tests or real email sends. |

The Docker base uses Node 22. Build and verify the image’s document, image and video conversions in staging before deployment. A passing client bundle does not validate its TypeScript or the tRPC 10/11 protocol combination.

## Reproduce local checks

From the repository root:

```bash
npm ci --prefix scripts
scripts/check-docs.sh
node --test scripts/docs.test.mjs
```

From `server/`, run `npm run build`. From `client/`, run `npm run build` and separately `npx vue-tsc --noEmit`; retain and report that check's current failure rather than treating the Vite build as a replacement.

Run `SECURITY_TEST_DATABASE_URL=postgresql://.../damvia_security_test npm run test:security` from `server/` against a disposable PostgreSQL 15 database. The suite clears fixture tables, runs migrations and tests access, credentials and concurrent requests. It never loads `server/.env` or sends email. The database name must end in `_test`.

The website build must use the corrected renderer and schema, with the documentation submodule advanced to the intended code version. It then runs the generated-HTML checker. See the repository's `docs/README.md` for publication wiring. Local edits to the adjacent application checkout do not update the website's pinned submodule by themselves.

For an installation, upgrade or restoration, execute [Acceptance checklist](../deployment/acceptance-checklist.md) with isolated services and record the result. No production-ready certification is implied by this page.
