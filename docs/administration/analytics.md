---
title: Insights
description: The admin analytics screen at /admin/analytics with views, downloads, active users, searches and shares over a date range, what each figure counts, and how long events are kept.
sidebar:
  order: 13
lastUpdated: 2026-09-17
---

Insights, at `/admin/analytics`, tells an admin which files are used, by whom, and what people look for without finding it. The [dashboard](./dashboard.md) answers "is the instance healthy right now"; Insights answers "what happened over the last 30 days". It is rendered for the `admin` role only, and every figure comes from the `analytics` router, gated by `userAdmin`.

## Figures start at the upgrade

Damvia records activity in the `activity_events` table from the moment the server is upgraded to a version that has it. Nothing is rebuilt from earlier data: the `downloads` table is not a history, because its rows are expired and deleted. Expect an empty screen on the first day, and read "Never downloaded" as "never downloaded since recording started".

## Choose the period

The buttons select the last 7, 30 or 90 days, or the last 12 months. The two date fields select any other period; both must be filled, and the end date is included. Picking a preset clears the dates. Every block, chart and CSV export follows the selected period, except "Storage by asset type" and "Never downloaded", which describe the library as it is now. Charts show one point per day.

## What each event counts

| Event | Recorded when | Rule |
|---|---|---|
| `login` | The client loads the current user (`user.me`), which every sign-in path does: password, magic link, invitation link and a returning session | At most one per user per 30 minutes of inactivity. The same moment is stored in `users.last_login_at` and shown as "Last Login" in [Users](./users-and-approval.md) |
| `asset_view` | A user opens a file in the preview dialog | Sent by the browser, at most once per file per 30 minutes per tab. Thumbnails in a grid are not views. The server checks that the caller can see the file |
| `asset_download` | A download is requested, direct or by email | One event per file of the archive, so a 300-file archive counts 300 files and 1 request. Recorded in the same transaction as the download: a refused request records nothing |
| `search` | A search returns its first page | The term is trimmed and lowercased. The same user repeating the same term within 1 minute counts once, which absorbs the facet request and page changes. The number of results is stored with it |
| `collection_share` | An invitation to a collection is created | One per invitation |
| `favorite` | A file is added to favorites | Removing a favorite records nothing |

"Active users" is the number of distinct users with at least one event of any kind in the period. "Download requests" counts archives; "Files downloaded" counts the files inside them.

## The blocks

**Assets.** The 20 most downloaded and the 20 most viewed files, downloads and views by asset type and by collection, the number of files added per day, the size of the library per asset type, and the files that are `up_to_date` and have no download event, with the 50 most recent listed. A file deleted from the cloud storage leaves the tables but stays in the totals.

**Users.** Active users, logins and new registrations per day; the 20 users who downloaded the most files, with their number of requests and last download; activity by role, region and group. A user in two groups counts in both.

**Search.** Searches per day, the 50 most frequent terms with their average number of results, and the terms that returned nothing. The last list is the one to act on: it names files to add, to rename, or product attributes to make searchable in [Products and PIM](./products-and-pim.md).

**Collections.** Collections created and invitations sent per day, the most shared collections, and the collections whose files are viewed and downloaded the most.

The download icon of each table exports its rows as a UTF-8 CSV named after the block and the period.

## Events are kept 365 days

Every night at 04:30 UTC the `activity/prune-events` job deletes events older than `ANALYTICS_RETENTION_DAYS`, 365 by default. Set it to `0` to keep them forever. Shortening it takes effect at the next run and cannot be undone.

Events name the user, so they are personal data. Removing an account keeps its events but clears the user on them: the totals stay right and nothing points to the person any more. The same happens to the file and the collection of an event when they are deleted. Mention the retention period in the privacy policy of the instance.
