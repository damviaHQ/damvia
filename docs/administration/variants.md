---
title: Variants
description: Show the formats, languages and durations of one creative as a single card, name what differs between them and correct the grouping by hand.
sidebar:
  order: 14
lastUpdated: 2026-09-21
---

Twelve formats of one banner are twelve files in the cloud storage. With variant grouping, search shows them as one stacked card, and readers open the card to see, filter and download every version. Grouping reads file names only; nothing is renamed or moved in the cloud storage.

## Turn grouping on for an asset type

Grouping is set per [asset type](./asset-types.md): tick **Group variants** on the types whose files come in versions, such as web banners, social visuals or video cuts. Never enable it for packshots, where two views of one product are different pictures. Saving the type groups its files straight away; unticking it removes the groups.

## How files are grouped

Files are grouped inside one folder and one asset type, never across folders, because type and licence are set per folder.

1. Each name loses its extension and is cut on `_`, `-`, space and `.`, in lower case. A record key found by a [matching step](./records.md#set-the-matching-steps) counts as one word, so `77374-228_01.jpg` and `77374-229_01.jpg` never merge.
2. The words are read as a tree from the first one. The shared start of the names is the group while every branch below it holds at least two files; where a branch would leave a file alone, the group stops. `pampa_campaign_a`, `pampa_campaign_b`, `pampa_teaser_a` and `pampa_teaser_b` make two groups. Branches that are formats, ratios, durations or languages never split a group, so a full grid of `1x1`, `9x16`, `en`, `fr` stays one card.
3. A group needs at least two files, a shared start of at least **4** characters (so `01.jpg` to `24.jpg` never group), and a start that is not only a record key.
4. Files whose name contains a **blocked word** are never grouped. By default: `v2`, `v3`, `final`, `ok`, `old`, `new`, `copy`, `img`, `dsc`, which keeps versions and camera dumps apart.

When two creatives share a short start and one of them has a single file (`sale_fr`, `sale_de`, `sale_banner_16x9`, `sale_banner_9x16`), they stay one group; split it by hand as below.

The **cover** of a card is the member with a preview, an image before a video before anything else, then the largest, then the first name, whatever the order files were synced in. The status of a card is the worst status of its members, so a group being processed says so.

## What differs is an axis

Each position after the shared start where members differ becomes an **axis**, and each member holds a value on it. An axis made only of sizes such as `1080x1080` is named **Dimensions**; `1x1` or `9x16`, **Ratio**; `15s`, **Duration**; ISO language codes, **Language**. Any other axis is shown as **Variant 1**, **Variant 2** until an admin names it. A group whose names differ only by extension uses the extension as its axis.

An axis is shared by every group whose values it already holds, so naming it once names it everywhere. Its values never grow on their own: to join two axes, merge one into the other. Axes appear as filters in search, next to the record and metadata filters.

## What readers see

Search shows one card per group, with its cover, a stacked outline and a **n variants** button; collections and pages keep showing every file. The button opens the group: each member with its preview, its value on each axis, its type, its status and a download link, and **Download all**, which opens the usual download dialog with the group as the selection. Members a reader cannot see, because of a collection, group or licence rule, are neither listed, counted nor downloaded.

## Name the axes and set the rules

Open **Data enrichment → Variants** (`/admin/data-enrichment/variants`). The menu badge counts the axes waiting for a name.

| Tab | What it does |
|---|---|
| Axes | Axes waiting for a name first, then named ones, each with its values, the number of groups using it and two example file names. Type a name to rename it everywhere. **Ignore** hides an axis from the search filters; its values stay stored and it does not come back. **Merge into** another axis takes the union of the values and moves the groups. |
| Changes by hand | Every split, exclusion and cover chosen by hand, with the files, who and when, and **Undo**. |
| Blocked words | Add or remove the words that keep a file out of every group. |
| Settings | The minimum shared length, 4 by default, with a live example. |

Every change regroups straight away. Nothing is written to the cloud storage.

## Correct a group by hand

Admins see **Edit group** in the group panel. Select members, then:

| Action | Effect |
|---|---|
| Split into new group | The selected files leave their group and form one of their own, marked **Forced**. |
| Exclude from grouping | The selected files are never grouped again. |
| Set as cover | The selected file is the cover, whatever the automatic choice. |

These choices are kept by file, so they survive every sync and rename in the cloud storage, and each one has an **Undo**. Axis names are edited from the column headers of the panel too. Nothing is written to Dropbox, OneDrive or Google Drive.
