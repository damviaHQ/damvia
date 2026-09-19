---
title: Validation status
description: What was checked locally, which versions were inspected, and which integration tests remain unexecuted.
sidebar:
  order: 8
lastUpdated: 2026-09-19
---

The documentation was reviewed against application commit `b860246` on 16 September 2026, then updated for `f8eb687`, which adds hexadecimal brand colours without `#`, and for the storage plan, dashboard and orphan cleanup change. It now includes the access, credential and storage changes tested on an isolated PostgreSQL database. The table distinguishes those tests from integrations still requiring a staging instance.

| Component | Observed version | Verification |
|---|---|---|
| Local Node | 22.14.0 | Used for local checks. Both packages now declare `engines.node >=22.12.0` (pg-boss 12, commander 15 and Vitest 5 need it). The website lockfile includes `undici` requiring Node >=22.19.0, so use an up-to-date Node 22 for CI/deployment. |
| Server | Fastify 5.12, tRPC 11.19.0, TypeORM 1.1, zod 4, TypeScript 6 | TypeScript compilation and 34 security regression tests passed against an isolated PostgreSQL instance, including fresh login tokens, API responses, direct exports, revoked-access exports, the storage plan reservation, plan and disk alert emails, orphan cleanup and the dashboard access rules including the hosting-contact-only disk figure. Buckets, cloud storage and email transport are stubbed; the real `asset/update-content` and archive callbacks run. |
| Client | Vue 3.5.43, Vite 8.3.0, Tailwind 4.3.3, Reka UI 2.10.4, tRPC 11.19.0 | Production and design-reference builds, shared UI type check and 12 browser regressions pass. Full application type checking still reports existing client and server-source errors. See [UI stack audit](./ui-stack-audit.md). |
| Queue | pg-boss 12.33 | Actual registered archive callbacks tested for access denial and a temporary failure followed by a successful retry. Queue registration and delivery are stubbed in the suite; the retirement of a pg-boss 10 schema is covered by `test/pgboss-legacy.cjs` and was exercised by booting the server against a real pg-boss 10 database. |
| PostgreSQL | 15 in development Compose | Migrations applied to an empty test database and the access migration checked against existing fixture rows. No production restore drill. |
| Documentation | Astro 7.3.2, Starlight 0.42.1 | Built locally with current Markdown; generated internal routes and anchors checked. |
| Docker image | `node:22-bookworm` base in the Dockerfile | The image was not rebuilt, and its media conversions were not tested during this review. |
| Dropbox / OneDrive / S3 / SMTP | Versions depend on deployment | Driver/configuration reviewed; no authenticated external integration tests or real email sends. |

The Docker base uses Node 22. Build and verify the image’s document, image and video conversions in staging before deployment. The client and server now share tRPC 11.19.0. A passing client bundle does not validate full application TypeScript or authenticated backend workflows.

## Reproduce local checks

From the repository root:

```bash
npm ci --prefix scripts
scripts/check-docs.sh
node --test scripts/docs.test.mjs
```

From `server/`, run `SECURITY_TEST_DATABASE_URL=postgresql://.../damvia_security_test npm test` against a disposable PostgreSQL 15 database. The suites clear fixture tables, run migrations and test access, credentials, synchronisation, search, downloads, sign-up and concurrent requests. They never load `server/.env` or send email. The database name must end in `_test`.

From `client/`, run `npm run typecheck`, `npm test` and `npm run build` after building the server once. The type check must report zero errors; a Vite build alone is not a type check. For isolated component validation run `npm run ui:check` and `npm run test:ui`.

The website build must use the corrected renderer and schema, with the documentation submodule advanced to the intended code version. It then runs the generated-HTML checker. See the repository's `docs/README.md` for publication wiring. Local edits to the adjacent application checkout do not update the website's pinned submodule by themselves.

For an installation, upgrade or restoration, execute [Acceptance checklist](../deployment/acceptance-checklist.md) with isolated services and record the result. No production-ready certification is implied by this page.
