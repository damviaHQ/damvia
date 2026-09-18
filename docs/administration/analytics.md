---
title: Insights
description: The admin analytics screen at /admin/analytics with views, downloads, active users, searches and shares over a date range, what each figure counts, and how long events are kept.
sidebar:
  order: 13
lastUpdated: 2026-09-17
---

Insights, at `/admin/analytics`, tells an admin which files are used, by whom, and what people look for without finding it. The [dashboard](./dashboard.md) answers "is the instance healthy right now"; Insights answers "what happened over the last 30 days". It is rendered for the `admin` role only, and every figure comes from the `analytics` router, gated by `userAdmin`.

## Figures start at the upgrade

Damvia records activity in the `activity_events` table from the moment the server is upgraded to a version that has it. Nothing is rebuilt from earlier data: the `downloads` table is not a history, because its rows are expired and deleted. Expect empty charts on the first day. “No recorded downloads” means no download in the retained event history, not a guarantee that a file has never been used.

## Choose the period

The period picker selects the last 7, 30, 90 or 365 days, or a custom range of up to 366 days. Fill both dates and choose **Apply dates**; the end date is included. Reversed dates and future end dates cannot be applied. Reports keep the same period when switching sections. Charts use UTC calendar days.

Six reports separate Overview, Asset usage, Users, Search demand, Collections and Library & storage. Overview highlights search terms needing attention and links to the detailed reports. Available activity metrics show their absolute change against the immediately preceding period of the same length. Comparisons use retained events only; missing history is not reconstructed.

Storage totals and “No recorded downloads” describe the current library independently of the selected period.

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

### Explore activity on the map

The Users report includes a world map with **Active users**, **Downloads** and **Views** controls. Bubble size follows the selected metric. Nearby locations form a cluster; select it to zoom in, or select a location from the ranking to see all three metrics. Drag to pan, use the zoom buttons, and reset to world view. Keyboard users can focus the map, use arrow keys to pan, `+` / `-` to zoom and `Home` to reset. The location list provides the same selection controls.

Geography comes from the **current region assigned to each account**, not from IP addresses, devices or live presence. Country names in the bundled dataset, translated names and ISO country codes are matched exactly after normalization. Common regional labels such as Europe, APAC, EMEA and LATAM use explicitly labelled reference points. A regional point is not a user's city or precise location. Regions that resolve to the same country are combined; each user has one assigned region, so counts remain additive. Updating a user's region changes where their retained activity appears.

Custom or ambiguous names remain in the **not mapped** list. The coverage percentage shows the proportion of the selected metric represented on the map; unmapped activity remains included in report totals and CSV exports. Small territories absent from the bundled dataset also remain unmapped. No coordinates or guesses are generated for unknown names.

The map loads on demand with local Natural Earth data and requires no API key, external tiles or geolocation service. The existing region table and map CSV contain all region rows, including unmapped ones.

**Search demand.** Total searches, searches without results, distinct people searching, and the number of terms with a daily spike. The chart compares total searches with searches returning nothing. The terms table includes search counts, change against the previous period, distinct users and searches without results. “New” means no recorded searches in the previous period. Filter either the top 50 terms or up to 50 terms needing attention; the filter and CSV apply to that selected list. The CSV also includes average results.

### Detect demand and respond

A **search spike** is a day with at least 5 more searches than the daily average of the preceding seven UTC days, and at least three times that average. Days with no recorded searches count as zero. A term with no preceding activity can therefore trigger a spike at 5 searches. The strongest qualifying day is shown for each term. A **content gap** means at least 3 searches returned no results during the selected period. These are indicators of recorded demand, not statistical forecasts; recently enabled analytics and expired history can lower the baseline.

The attention list evaluates all terms before limiting the display, so an uncommon term with missing content is still surfaced even when it falls outside the 50 most popular searches.

Select a term to see its daily chart and contactable users. The audience includes approved, email-verified non-guest accounts that searched that exact term in the selected period. Deleted accounts still contribute to event totals but cannot be contacted. Up to 200 users are shown and exported; the full contactable count is displayed alongside that limit.

Use **Find matching content** to open the portal search with the term prefilled, or **Manage assets** to review the asset tree. Missing content may need to be added in the connected cloud storage, exposed through collections, or made searchable in [Products and PIM](./products-and-pim.md).

Choose a waiting or availability-update message, then **Draft email** beside a person to open a prefilled message in your email application. Review the text and supply any confirmed dates or links before sending. **Copy message** copies the suggested text. Damvia does not send emails, schedule alerts or publish assets automatically from this report.

**Collections.** Collections created and invitations sent per day, the most shared collections, and the collections whose files are viewed and downloaded the most.

The CSV buttons export the displayed table rows or the underlying daily chart data as UTF-8 CSV, named after the report and period. Exports neutralise spreadsheet formula prefixes in text cells.

## Events are kept 365 days

Every night at 04:30 UTC the `activity/prune-events` job deletes events older than `ANALYTICS_RETENTION_DAYS`, 365 by default. Set it to `0` to keep them forever. Shortening it takes effect at the next run and cannot be undone.

Events name the user, so they are personal data. Removing an account keeps its events but clears the user on them: the totals stay right and nothing points to the person any more. The same happens to the file and the collection of an event when they are deleted. Mention the retention period in the privacy policy of the instance.
