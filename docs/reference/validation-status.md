---
title: Validation status
description: What was checked locally, which versions were inspected, and which integration tests remain unexecuted.
sidebar:
  order: 8
lastUpdated: 2026-09-16
---

The documentation was reviewed against application commit `b860246` on 16 September 2026, then updated for `f8eb687`, which adds hexadecimal brand colours without `#`. The table distinguishes code and build checks from tests performed on a running instance.

| Component | Observed version | Verification |
|---|---|---|
| Local Node | 22.14.0 | Used for local checks. The website lockfile includes `undici` requiring Node >=22.19.0; local npm emitted an engine warning, so use an up-to-date Node 22 for CI/deployment. |
| Server | Fastify 5, tRPC 11.1.0, TypeORM 0.3 | TypeScript compilation passed; no live server/database exercise. |
| Client | Vue 3, Vite 5, tRPC 10.45.0 | Vite build passed. `vue-tsc --noEmit` fails on the typed inline callback in `search.vue`; full cross-version router type compatibility is not established. |
| Queue | pg-boss 10.2.0 | Source/defaults inspected; producer-before-start behaviour checked without a live queue. |
| PostgreSQL | 15 in development Compose | Schema and migrations inspected; migration and restore drills not executed. |
| Documentation | Astro 7.3.2, Starlight 0.42.1 | Built locally with current Markdown; generated internal routes and anchors checked. |
| Docker image | `node:20` base in the Dockerfile | The image was not rebuilt, and its media conversions were not tested during this review. |
| Dropbox / OneDrive / S3 / SMTP | Versions depend on deployment | Driver/configuration reviewed; no authenticated external integration tests or real email sends. |

Node 20 is [end-of-life](https://nodejs.org/en/about/previous-releases); Node 22 and 24 remain maintained at this review date. Before deploying, build the server with a maintained Node version and test its image, document and video conversions. A passing client bundle does not validate its TypeScript or the tRPC 10/11 protocol combination.

## Reproduce local checks

From the repository root:

```bash
npm ci --prefix scripts
scripts/check-docs.sh
node --test scripts/docs.test.mjs
```

From `server/`, run `npm run build`. From `client/`, run `npm run build` and separately `npx vue-tsc --noEmit`; retain and report that check's current failure rather than treating the Vite build as a replacement.

The website build must use the corrected renderer and schema, with the documentation submodule advanced to the intended code version. It then runs the generated-HTML checker. See the repository's `docs/README.md` for publication wiring. Local edits to the adjacent application checkout do not update the website's pinned submodule by themselves.

For an installation, upgrade or restoration, execute [Acceptance checklist](../deployment/acceptance-checklist.md) with isolated services and record the result. No production-ready certification is implied by this page.
