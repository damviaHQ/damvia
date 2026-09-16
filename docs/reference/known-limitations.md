---
title: Known limitations
description: Implementation gaps affecting access control, synchronisation, recovery and deployment in the audited code.
sidebar:
  order: 7
lastUpdated: 2026-09-16
---

The code review found the following problems. They still need fixes in the application; correcting the documentation does not change how the server behaves. Review them before making an instance available to users. The audit examined commit `b860246` without attempting to exploit a running instance.

## Access-control gaps

| Area | Current behaviour | Consequence |
|---|---|---|
| Product edits | `pim.updateProduct` has no authentication middleware. | Someone can change product data through the API without logging in, even though the editing screen is restricted to admins. |
| Verification resend | `user.resendVerificationEmail` accepts an unverified account id publicly and returns a JWT. | Someone who knows an unverified account's id can obtain a login token for it. |
| Manager edits | `user.update` restricts the assigned role, not the existing admin role of the target. | A manager can demote an administrator in the same region. The mutation returns a raw user entity. |
| Collection groups | Updates propagate to existing descendants; manual creation, duplication and synchronisation do not consistently inherit restrictions. | A new sub-collection may be visible to people who cannot see its parent. |
| Licences | The licence check applies to ordinary public access. Ownership, admin rights, group membership or an invitation can grant access separately. | A user with one of these other permissions may see a file even when its licence excludes their region or has expired. |

Fixes must add the missing server checks and tests that verify them. New guest accounts also join the default group of the inviter's region. If that group has access to other collections, the guest gets access to those collections too.

## Synchronisation and storage

- `upsertFile` overwrites the previous checksum before comparing it, so content changes are not detected there. Same-size replacements require [targeted refresh](../deployment/integrity-check.md#targeted-refresh-of-a-stale-original-or-missing-preview).
- Reappearing rows can retain `pending_deletion`. A file move removes its existing `collection_files` associations, including curated copies, before adding synchronised associations at the new location.
- Dropbox ignores a completely empty listing. If saving an individual file or folder fails, however, it can continue without adding that item to the list of assets to keep. The deletion step can then mark it for removal. Repeated authentication failures (HTTP 401) have no fixed retry limit.
- OneDrive has no empty-listing guard and relies on feed order for parent resolution. Use the full-drive `root` recipe; Business subfolder delta has not been validated.
- Original S3 upload errors and preview errors can be swallowed before a file is marked `up_to_date`. Integrity checks validate original size/presence, not preview health.
- S3 credentials in URL username/password fields are not percent-decoded before being passed to MinIO. Use URL-safe credentials until this parser is fixed.

## Deployment and recovery

Run one server process with `ENABLE_WORKER=true` to handle the API, background tasks and cloud sync. With the flag off, requests may fail when they try to queue work. The first sync can also start before the database and worker are ready. Failed jobs have a limited number of retries; an interrupted job may already have uploaded a file or sent an email before it runs again. See [Worker and scaling](../deployment/worker-and-scaling.md).

Deleting an owner can fail while private collections still reference that user. Main-bucket uploads cannot be rebuilt from Dropbox or OneDrive. Node 20 in the current Dockerfile is end-of-life. The client type check fails even though its bundle builds. See [Validation status](./validation-status.md) for the checks that passed and the tests still needed on a running instance.
