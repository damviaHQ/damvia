---
title: Dashboard
description: The admin recap at /admin with storage used against the plan, the paused-sync state, orphan cleanup, sync health, pending approvals and recent downloads.
sidebar:
  order: 2
lastUpdated: 2026-09-16
---

The dashboard is the first admin screen, at `/admin`, and the page every admin lands on from the "Administration" entry of the account menu. It answers one question before anything else: how full is the storage, and is the cloud sync still bringing files in.

## What the storage block shows

The worker adds up every object of the two buckets every 30 minutes (`storage/measure-usage`) and keeps the total in the `storage_usage` table. The block shows that total, and when `STORAGE_QUOTA` is set, the plan next to it (`1.2 TB / 1.5 TB`), a bar and the percentage. Sizes use decimal units, the way plans are sold: 1.5 TB is 1 500 000 000 000 bytes. Without a plan the bar is hidden and only the used space appears.

Between two measurements the total is kept current by adding the size of each file the worker uploads, so the figure never lags more than half an hour and never under-counts for long. Sizes reserved by downloads still running survive a measurement; they are only cleared when no `asset/update-content` job is active, which is how a reservation left by a crashed process disappears. "Last measured" gives the time of the last full listing.

When a file from Dropbox or OneDrive no longer fits under the plan, the alert above the block says that new files are not downloaded until space is freed.

## The plan pauses the sync, not the DAM

With `STORAGE_QUOTA` set, each `asset/update-content` job reserves the file's size against the plan before downloading anything. Ten files are processed at once, and the reservation is a single conditional `UPDATE`, so ten large videos cannot slip past the limit together. A file that does not fit stays `creating` or `outdated`, the job ends without a retry, and the worker logs `storage.quota-exceeded`.

Everything else keeps working: users still browse, download archives, upload page media and collection thumbnails, and thumbnails of files already downloaded are still generated. That is why the plan must be smaller than the disk: on a 2 TB disk, a 1.5 TB plan leaves room for archives, previews, Postgres and temporary files.

## Alerts at 80, 90, 95 and 100 %

When a measurement crosses one of these thresholds upwards, every admin designated in [Users](./users-and-approval.md) ("Receives storage and maintenance emails") receives the `storage-alert` email once, with `severity` `warning` at 80 %, `critical` at 90 and 95 %, and `full` at 100 %. The level is remembered, so a usage that stays at 93 % does not mail every half hour. It is lowered again, without mail, once usage drops more than 2 points under the remembered threshold, so the next crossing mails again. The template and its variables are in [Email templates](../configuration/email-templates.md).

From 80 %, the warning above the storage block also shows the `SERVER_ALERT_EMAILS` addresses as an email link, for the admin to ask the host for a larger plan. It is omitted when the variable is empty.

The same thresholds drive the banner shown above every admin page: amber from 80 %, red from 90 %, with the paused state when the sync stopped.

## The server disk is for the host, not the customer

An admin whose address is listed in `SERVER_ALERT_EMAILS` sees one more block, "Server disk", with the used and free space of the disk behind `STORAGE_DISK_PATH` and two operating figures. "Cloud synchronisation" is `Running` or `Paused`, with the number of `creating` and `outdated` files waiting since the pause. "Last orphan cleanup" reports what the daily [integrity check](../deployment/integrity-check.md) deleted: objects older than 24 hours without a database row, and archives of expired or failed downloads. The API omits the whole block for everyone else, so on a shared server a customer sees their plan and nothing about the machine or the other instances. The same thresholds send `disk-alert` emails to those addresses only, whatever fills the disk: orphan objects, archives, Postgres, temporary files. See [Server configuration](../configuration/server-env.md).

## Getting the sync going again

1. Free space: remove folders from the cloud storage (the sync marks their files `pending_deletion` and the deletion job removes the objects within a minute), delete large expired downloads, or raise `STORAGE_QUOTA` and restart the server.
2. Click "Measure now" instead of waiting for the next half hour. The button reads "Measuring…" until the new figures arrive, usually a few seconds, longer on a very large library, then a message gives the used space. If it takes more than two minutes the page says so and the figures update on their own when the worker is done.
3. When the measurement shows less usage than the previous one and the sync was paused, the worker queues `asset/update-content` for every `creating` and `outdated` file on its own and logs `storage.quota-recovered`. "Retry pending files" does the same by hand and says how many files will be downloaded again.

Files still too large for the remaining space are blocked again at their turn and logged; the rest downloads in order.

## The other blocks

| Block | Figures | What to look at |
|---|---|---|
| Asset files | Counts of `up_to_date`, `creating` (waiting for download), `outdated`, `pending_deletion` | `creating` should fall to zero after an import; a stable non-zero count means blocked or failing downloads, see [Operations](../deployment/operations.md) |
| Users | Total, admins receiving storage alerts, waiting for approval, count per role | Both counts are red when they need attention: designate an alert recipient, approve pending users, on [Users and approval](./users-and-approval.md) |
| Downloads, last 7 days | `ready`, `preparing`, `failed`, `expired` created in the last 7 days | Failed counts turn red; the causes are in [Downloads](./downloads.md) |

All figures come from one admin-only procedure, `dashboard.summary`; managers never see the dashboard or the banner.
