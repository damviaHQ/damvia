---
title: Acceptance checklist
description: An isolated technical verification procedure for installation, upgrades and restore drills.
sidebar:
  order: 10
lastUpdated: 2026-09-21
---

Run these checks on a separate test instance before an installation, upgrade or restore goes live. Record which checks pass and which fail. They have not all been run during this documentation review; completed checks are listed in [Validation status](../reference/validation-status.md).

## Isolated prerequisites

Use a dedicated cloud source, database, buckets and SMTP test inbox/sink. Set a non-empty random `APP_SECRET`, one server with `ENABLE_WORKER=true`, matching server/client code, reachable HTTPS endpoints, and the exact origin in storage CORS. Do not reuse production buckets for a restore drill.

Prepare a nested folder containing an image, a PDF, a short video and a file type with no thumbnail implementation. Record original sizes and names. Create a test administrator through [First admin](../getting-started/first-admin.md), plus a member and guest for access checks.

## Expected checks

| Check | Expected result / limitation to record |
|---|---|
| Startup | Migrations complete, API responds, worker is active and a full provider pass succeeds. Initial sync may race startup; HTTP alone is insufficient. |
| Import | Nested files/folders appear with correct sizes. Original bytes can be fetched; supported previews render. Unsupported types remain downloadable without a preview. |
| Modified file | Verify both different-size and same-size replacement. Current checksum detection is defective; use targeted refresh and record the limit. |
| Renamed/moved file | Provider id is retained. Check private curated associations as moves can remove them. |
| Synchronised collection | After the jobs finish, sub-collections and files match the source folder. Each new sub-collection inherits its parent’s group restrictions. |
| Access | Use separate accounts to check public and draft collections, group restrictions, regional licences and invitations. Owners, group members and invitees must meet licence restrictions; admins are exempt. Drafts are visible only to admins and owners. |
| Editorial upload | Upload a collection thumbnail and page image/video; validate PUT preflight and rendered GET URLs from the actual browser origin. |
| Records | Import the two-row [CSV fixture](../administration/records.md#reproducible-import-fixture); verify key/view links after the scheduled job. |
| Exports | Build a small direct export and an email export. Check archive contents, queue completion and delivery in the test sink. |
| Source deletion | Delete only a disposable fixture; after a complete listing and worker pass, confirm its database and mirrored-object removal. |
| Restore | Restore database plus main bucket/configuration with the original application version; verify custom media and restricted access before testing any upgrade. |

## Record the outcome

Store the application commit and image id, client build, Node and PostgreSQL versions, provider/tenant type, input sizes, durations, failures and repairs. Keep test secrets out of the record. Mark an untested provider or conversion as untested; a successful compilation is not a complete integration test.

If a test account can access content it should not see, fix that problem before giving real users access. Review [Known limitations](../reference/known-limitations.md) when assessing the results. After testing, remove the test files and accounts using the provider's and application's normal deletion procedures.
