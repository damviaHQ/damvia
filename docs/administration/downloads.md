---
title: Downloads
description: Understand direct and emailed exports, conversion limits, access rechecks and seven-day link expiry.
sidebar:
  order: 11
lastUpdated: 2026-09-23
---

Damvia packages one or more accessible files as a downloadable object in the assets bucket. Small exports can finish in the request; larger exports are prepared by the worker and announced by email. Every prepared object expires after seven days.

## Record lists and product views

Selecting records, files, or a mixture of both shows **Download** in the top toolbar. One selected record opens the single-file preview, with its visible fields and a gallery labelled by filename. The arrows move through the products visible on the current page; clicking a filename in the gallery switches views within the current product. When views are enabled, the configured main view is selected for download initially, or the first available view if it is absent. Browsing the gallery does not change that selection; **Select all** and **Remove all** control the views in both single and multiple record downloads. The record data can be copied together from the icon beside its heading or one value at a time by clicking its row. One selected file uses the same preview layout. Multiple selected records, mixed selections, and record collections open the multi-file download modal. **Files** and **Products** tabs at the top of the right sidebar switch both the settings and the main preview, showing either the file gallery or the record table. When both are available, the footer offers separate file and Excel/CSV downloads and **Download all**, which produces one ZIP with the selected files and `record-list.xlsx` or `record-list.csv`. The ZIP uses the usual direct or emailed delivery and rechecks file and record access when it is prepared. The list preview shows product pictures and up to 12 rows. It exports as Excel (`.xlsx`) or CSV, with selectable columns that can be dragged into the desired order. The same order is used in the export. Excel can embed a **Picture** column for selections of up to 1,000 records; CSV exports text columns only. The list includes up to 10,000 accessible records, including records without media unless **Hide records without media** is enabled. Only fields marked visible are offered or exported. Excluded collection members stay excluded, and access is checked again when the list is downloaded.

List-only exports download immediately in the browser; they do not create a seven-day download link or an entry in download history. A list bundled with files follows the file download's direct or emailed delivery and appears in download history. Excel embeds compressed, non-interactive picture thumbnails in the **Picture** column. Excel preserves references and leading zeroes as text. CSV includes a UTF-8 byte-order mark and protects formula-leading values.

The multi-selection modal closes when preparation begins. A persistent notification shows that the download is being prepared while the user continues browsing, then confirms the browser download or emailed link, or reports a failure. A compact animated icon in the top bar shows preparation; once an archive is ready, it opens the Downloads list. The icon remains available while a prepared archive can be downloaded, and its new marker clears after the user opens that list.

File selections resolve all accessible media linked to the selected records, with duplicate assets included once. A record collection grants access to linked pictures without a separate file collection; licence dates and regional restrictions still apply. When **Views** is enabled in record settings, product downloads offer only files with a matching numbered view. The chosen views determine the files, size, usage terms and delivery options. Individually excluded files remain greyed out in their original positions; clicking them again includes them in the download. Selecting a view does not remove rows from a record list.

## Direct and emailed exports

| Mode | Behaviour |
|---|---|
| Direct | Damvia prepares the file or archive while the request is open and returns it when ready. Proxy timeouts must allow long conversions. |
| Email | A background job prepares the export, then emails a link when it is ready. The worker and SMTP must be healthy. |

The client normally offers direct multi-file downloads only up to 2 GB and 300 images. Single-file direct downloads can be offered up to 5 GB. The server rejects any request whose accessible source files total 10 GB or more. These are decimal byte limits.

For several files, Damvia creates an uncompressed zip and preserves the file collection path beneath an `export/` folder. Pictures accessed through records without a file collection are placed directly in `export/`. A single file is delivered directly. Up to 25 files may be fetched or converted at once, so a large export can require substantial temporary disk and CPU.

## Format conversion

Images can remain original or be converted to PNG, JPEG or WebP. Videos can remain original or be converted to MP4 or WebM. Resolution/quality choices affect only supported image and video files; other file types remain original.

Video conversion requires ffmpeg. Image conversion uses sharp. Conversion output can be larger than the source, so the request-size checks do not guarantee that temporary disk or the finished archive fits. Monitor representative exports before setting proxy and disk limits.

## Access is checked again

When a request is created, files the requester cannot see are excluded. Before a queued email export is prepared, Damvia checks the requester's current approval, collection access and file licences again.

If access has been revoked or a licence has expired, the export becomes `failed`, no ready email is sent and no link is exposed. Temporary storage or provider failures use the queue's retry policy; exhausted jobs require diagnosis before a new request is submitted.

Licence acceptance shown in the browser is an acknowledgement, not a server-side acceptance record. The server enforces visibility and licence conditions independently. See [Licences](./licenses.md).

## Links expire after seven days

A ready download uses `API_URL/v1/downloads/{id}`. That route does not require a session; it redirects to a short-lived signed object URL while the download record is ready and unexpired. Anyone who holds the public link can use it during that period.

Every minute, the cleanup job marks overdue downloads expired and deletes their stored objects. Expired entries remain visible in the download history for about a month. Deleting a user removes that user's downloads and stored objects immediately.

Removing an invitation or rotating `APP_SECRET` does not revoke an already issued object URL. See [Accounts and links](./accounts-and-links.md).

## Diagnose a failed or stuck export

Check these in order:

1. Confirm one server process runs with `ENABLE_WORKER=true`.
2. Inspect `download/create-archive` jobs and the corresponding download status.
3. Check temporary disk, memory and the required conversion tools.
4. Verify that source objects can be read and the assets bucket can be written.
5. For an email export, verify the ready-email job and provider delivery log.
6. Re-check the requester's approval, collection access, region and file licences.

An active job expires after the queue's configured lifetime and has limited retries. A retry may find an object already uploaded or an email already sent, so inspect the existing record before submitting another request. The detailed procedure is in [Operations](../deployment/operations.md#downloads-stuck-in-preparing).
