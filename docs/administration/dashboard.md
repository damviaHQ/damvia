---
title: Dashboard
description: The admin recap at /admin with storage used against the plan, the paused-sync state, orphan cleanup, sync health, pending approvals and recent downloads.
sidebar:
  order: 2
lastUpdated: 2026-09-18
---

The dashboard is the first admin screen, at `/admin`, and the page every admin lands on from the "Administration" entry of the account menu. It combines workspace totals, user activity, file and download activity, access requests and storage health in the shared Damvia admin design. Usage over time, such as the most downloaded files, active users and search terms, is on [Insights](./analytics.md).

## What the storage block shows

The worker adds up every object of the two buckets every 30 minutes (`storage/measure-usage`) and keeps the total in the `storage_usage` table. The block shows that total, and when `STORAGE_QUOTA` is set, the plan next to it (`1.2 TB / 1.5 TB`), a bar and the percentage. Sizes use decimal units, the way plans are sold: 1.5 TB is 1 500 000 000 000 bytes. Without a plan the bar is hidden and only the used space appears.

Between two measurements the total is kept current by adding the size of each file the worker uploads, so the figure never lags more than half an hour and never under-counts for long. Sizes reserved by downloads still running survive a measurement; they are only cleared when no `asset/update-content` job is active, which is how a reservation left by a crashed process disappears. "Last measured" gives the time of the last full listing.

When a file from Dropbox or OneDrive no longer fits under the plan, the shared banner says that new files are not downloaded until space is freed.

## The plan pauses the sync, not the DAM

With `STORAGE_QUOTA` set, each `asset/update-content` job reserves the file's size against the plan before downloading anything. Ten files are processed at once, and the reservation is a single conditional `UPDATE`, so ten large videos cannot slip past the limit together. A file that does not fit stays `creating` or `outdated`, the job ends without a retry, and the worker logs `storage.quota-exceeded`.

Everything else keeps working: users still browse, download archives, upload page media and collection thumbnails, and thumbnails of files already downloaded are still generated. That is why the plan must be smaller than the disk: on a 2 TB disk, a 1.5 TB plan leaves room for archives, previews, Postgres and temporary files.

## Usage can be above the plan

The plan stops new downloads; it never deletes what is already stored. An instance that held 4.9 GB before `STORAGE_QUOTA=2GB` was set shows `4.9 GB / 2.0 GB`, `246% used · 0 B available`, and "Storage needs attention". "Available" never goes below zero. Archives, previews and page media, which the plan does not block, can also push usage past it.

Usage goes back under the plan in two ways: raise `STORAGE_QUOTA` and restart the server, or remove folders from the cloud storage and let the deletion job remove their objects. Then click "Measure now".

## Alerts at 80, 90, 95 and 100 %

When a measurement crosses one of these thresholds upwards, every admin designated in [Users](./users-and-approval.md) ("Receives storage and maintenance emails") receives the `storage-alert` email once, with `severity` `warning` at 80 %, `critical` at 90 and 95 %, and `full` at 100 %. The level is remembered only once the email has gone out, so a usage that stays at 93 % does not mail every half hour, while an alert that could not be sent (no designated admin, missing template, SMTP error) is tried again at the next measurement. It is lowered again, without mail, once usage drops more than 2 points under the remembered threshold, so the next crossing mails again. The template and its variables are in [Email templates](../configuration/email-templates.md).

From 80 %, the shared admin banner also shows the `SERVER_ALERT_EMAILS` addresses as an email link, for the admin to ask the host for a larger plan. It is omitted when the variable is empty.

The banner is shown once above every admin page: amber from 80 %, red from 90 %, with the paused state and hosting contact link when configured. The dashboard does not repeat the same warning in a second alert. Storage usage sits near the top of the navigation sidebar. Its bar follows the same thresholds, amber from 80 % and red from 90 %, and its label becomes "Storage running low", then "Storage almost full". Once the plan has paused the sync, it reads "Storage full" over "Sync paused · plan full".

## The server disk is for the host, not the customer

An admin whose address is listed in `SERVER_ALERT_EMAILS` sees one more block, "Server disk", with the used and free space of the disk behind `STORAGE_DISK_PATH` and two operating figures. "Cloud synchronisation" is `Running` or `Paused`, with the number of `creating` and `outdated` files waiting since the pause. "Last orphan cleanup" reports what the daily [integrity check](../deployment/integrity-check.md) deleted: objects older than 24 hours without a database row, and archives of expired or failed downloads. The API omits the whole block for everyone else, so on a shared server a customer sees their plan and nothing about the machine or the other instances. The same thresholds send `disk-alert` emails to those addresses only, whatever fills the disk: orphan objects, archives, Postgres, temporary files. See [Server configuration](../configuration/server-env.md).

## Getting the sync going again

1. Free space: remove folders from the cloud storage (the sync marks their files `pending_deletion` and the deletion job removes the objects within a minute), delete large expired downloads, or raise `STORAGE_QUOTA` and restart the server.
2. Click "Measure now" instead of waiting for the next half hour. The button is disabled while a measurement is already waiting or running, and the server refuses a second one with `The storage is already being measured.` The button reads "Measuring…" until the new figures arrive, usually a few seconds, longer on a very large library, then a message gives the used space. If it takes more than two minutes the page says so and the figures update on their own when the worker is done.
3. When a measurement finds the usage back under the plan, or no plan at all, and the sync was paused, the worker clears the pause, queues `asset/update-content` for every `creating` and `outdated` file on its own and logs `storage.quota-recovered`. Raising `STORAGE_QUOTA` is enough: after the restart, the next measurement resumes the sync without any file being deleted. "Retry pending files" does the same by hand and says how many files will be downloaded again. It is only available when no file download is waiting or running: the button then reads "Downloading N files…", and the server refuses the action with `Files are already being downloaded. Try again once they are done.` The cloud sync queues new files every 5 minutes, so the button is often disabled for a moment right after a sync pass.

Files still too large for the remaining space are blocked again at their turn and logged; the rest downloads in order.

## Needs attention

A compact panel appears above recent files only when there is something to act on:

- **Access requests:** opens Users with the needs-approval filter.
- **Files waiting to sync:** offers Retry files when pending or outdated files exist and no file downloads are running. When storage has paused synchronisation, the shared storage banner explains the blocker instead.
- **Failed exports:** shows failures from the past seven days and offers a hosting-contact email link when configured.
- **Missing storage-alert recipient:** opens Users to designate an administrator who receives maintenance emails.

The panel disappears when none of these conditions apply. Role breakdowns, zero-count file states and expired/preparing download totals are not repeated as dashboard cards. Storage and cloud health remain in the sidebar panels; host-only disk diagnostics retain their existing visibility restriction.

All figures come from one admin-only procedure, `dashboard.summary`; managers never see the dashboard or the banner.

## Workspace overview and activity

The top row shows all asset files, folder and collection counts, workspace users, and downloads created in the last seven days. The equal-height operational row contains Latest user activity, Cloud synchronisation and Storage. Latest user activity combines the most recent registrations, approvals and guest invitations. Invitation entries name the person who created the shared link, the guest email and the collection. A verified account waiting for access has a one-click **Approve** action; unverified and approved accounts retain a compact state label.

Workspace activity sits below those cards without an enclosing white panel. Recently updated lists the three latest asset-file records and opens each file’s containing folder. Recently downloaded lists the three newest download requests with their file count, requester, status and update time. These timestamps describe current records rather than an immutable audit log. The pending-approval link opens Users with its existing needs-approval filter selected.

The midnight navigation and Mona Sans typography are shared with the design-system preview. Buttons have square corners and panels retain rounded corners. On narrow screens, Open navigation expands the menu above the content; choosing a destination closes it. The tenant-facing DAM keeps its existing branding.

When the dashboard content area is at least 1120 px wide, Latest user activity, Cloud synchronisation and Storage share one row with equal-height panels. Needs attention and server diagnostics remain full-width rows when present. The two workspace activity feeds share a row below. Smaller layouts retain stacked panels with natural heights to keep names and controls readable.
