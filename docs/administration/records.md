---
title: Records
description: Create, edit and import a catalogue of records (products, events, venues), type their fields, see the files matched to each one and its history, and choose which fields power search and display.
sidebar:
  order: 10
lastUpdated: 2026-09-21
---

The Data enrichment area adds context to mirrored assets. Damvia keeps a flat catalogue of **records**, created on screen or imported by CSV, extracts a record key and optional view from each filename, and uses selected record fields for search, filters and display.

A record is whatever the files are about: a product for a brand, an event for a venue, a property for an agency. Open **Settings** (`/admin/settings`), section **Record label**, to give records the name your team uses, singular and plural ("Product" and "Products" by default). The label is used in the menu, the search filters, the asset type settings and the record screens. It does not change the tables, the API or the environment variables, which keep the record and product names below.

## Daily work and setup

The menu splits data enrichment in two. **Data Enrichment** holds the screens used every day: **Products** (your record label), the catalogue that some teams run as their PIM, and **To review**, where the files no step could link arrive after each sync. **Enrichment Setup** holds four settings, made once in order and adjusted when the folders or the catalogue change. Each setup screen names its step at the top.

| Step | Screen | Question it answers |
|---|---|---|
| 1 | **Asset types**, with the **Folder rules** tab | What kind of file is this? The other settings are made per type. |
| 2 | **Link to products** | How does a file of each type find its record? Needs records to link to. |
| 3 | **Fields**, optional | What do readers see and search: record columns and photo metadata? |
| 4 | **Variants**, optional | Which files are versions of one creative? |

**Enrichment Setup → Setup guide** (`/admin/data-enrichment`) lists the four steps with where each stands: types defined and folders still without one, types with matching steps (or that no record exists yet), photo metadata fields shown, types grouping variants and axes waiting for a name. A step is ticked when it is done, and its button opens its screen. It also shows the last pass: when it ran, who started it (the sync or an admin), how long it took and what each stage changed, or the error that stopped it. **Run enrichment now** starts a pass straight away; while one runs, the button says since when and by whom, and a second request waits for it and runs next. The menu badges count the files unmatched or in conflict, and the axes waiting for a name.

## Two questions, two tools

- **Folder rules** (setup step 1) answer "what kind of file is this?": they give an [asset type](./asset-types.md) from the folder path (packshot, video, logo).
- **Link to products** (setup step 2) answers "which record is this file about?": it finds a record key in the file name or the folder path (product `WX5678-100`, event `EVT-25028`).

Matching only runs on files whose asset type is marked **Related to records**. Files of other types, such as logos or fonts, are left out and never appear in **To review**.

## Set the matching steps

Open **Data enrichment → Link to products** (the menu uses your record label, `/admin/data-enrichment/matching`). Choose an asset type on the left, then add its steps:

| Step | What it reads | What its group gives |
|---|---|---|
| File name | The file name, without its folder, case-sensitive | The record key. An optional **view group** gives the view, for example `02` in `ABC123-001.02.jpg`. |
| Folder path | The full folder path, such as `/Dropbox/EVENTS/2025/EVT-25028 Festival Aurora 2025`, case-insensitive | Either the record key, or the value of an attribute, which links the file to a **range**: every record sharing that value, such as every product of a collection. |

Every enabled step runs on every file. When two steps find a different record key, the file becomes a **conflict** and nothing is chosen for you. Steps are refused when the pattern has no group in parentheses, names a group it does not have, or takes more than 50 ms on a sample.

**Test on a folder** runs the steps on screen, saved or not, on up to 40 files of a folder and its subfolders, and shows the key found, the record and the result of each file. **Save and re-run** writes the steps and recomputes the links of every file straight away. Nothing is ever written to the cloud storage.

A pattern such as `^(.{6}-\d{3})` with views enabled in Settings reads `ABC123-001.02.jpg` as key `ABC123-001` and view `02`: the view part is added after the key from the **Views** settings (separator `.` and two digits by default). A step that names its own view group keeps it.

### The old `PRODUCT_MATCHING_REGEX` becomes the first step

At the upgrade that brought this screen, `PRODUCT_MATCHING_REGEX` was copied into a **File name** step, group 1 key and group 2 view, for every asset type then marked Related to records, and `PIM_PRODUCT_VIEW` became the thumbnail view in Settings. From then on the admin screen is where they are edited.

The old job that applied the regex every 5 minutes still runs, but only on files that no step owns: files of a type without steps, or of a type not related to records. It leaves alone files linked by hand. Once every record-related type has steps, set `ENABLE_LEGACY_PRODUCT_MATCHING=false` to stop it. The **Use PRODUCT_MATCHING_REGEX** button adds the old regex as a step to a type that has none.

## Work on records like a spreadsheet

**Data enrichment → Products** (the menu uses your record label, `/admin/data-enrichment/records`) lists the records in a grid. Every change is saved as soon as it is made and written to the record's history.

| To | Do |
|---|---|
| Add a record | Type its key in the last row and press Enter, or use **Add product** at the top. The record opens as a card to fill in. A key already taken is refused in the row, with a **Go to** link that opens the page holding that record and highlights its row; search and filters that hide it are cleared first. |
| Edit a value | Click a cell to select it, then click again, double-click, press Enter or Space to continue the value, or start typing to replace it. Enter saves and moves down, Tab saves and moves right, Esc cancels. A select opens its list of options; type to narrow it and add a missing option from there. |
| Select several cells | Drag across them, Shift+click the far corner, or hold Shift with the arrow keys. Ctrl+A or ⌘+A selects every cell of the page, Esc goes back to one cell. |
| Copy and paste | Ctrl+C or ⌘+C copies the selected cells as tab-separated rows, the form Sheets and Excel use, so a block goes both ways. Ctrl+V or ⌘+V pastes: one value fills every selected cell, a block the selection holds a whole number of times is repeated across it, and any other block is laid from the top-left cell. |
| Duplicate values down | Drag the small square at the corner of the selection up or down: the selected rows repeat over the rows you cover. Double-click the square to fill to the last row of the page, or press Ctrl+D or ⌘+D to copy the first row of the selection into the rows below it. |
| Clear values | Delete or Backspace clears every selected cell. |
| Undo an edit | Use **Undo** on the notice that confirms the edit. The undo is a change of its own in the history. |

A paste, fill or clear over several cells is checked before anything is sent: one value its field refuses and nothing is saved. It is saved in one go, can be undone in one go, and each record it changes gets one history entry. The key, picture and count columns are never written; the notice says how many of their cells were left out. A paste or fill stops at the last row of the page.
| Find records | The search box looks in the key and every value. **Filters** narrow by field (contains, is, is not, is empty, is any of the options), and several filters narrow each other. |
| Sort | Open a column's menu. Numbers and dates sort by value; values that do not fit their type come last. |
| Arrange columns | **Columns** shows, hides and reorders them, and each column can be resized from its right edge; a long value never widens its column. **Wrap text** at the top of **Columns** shows up to four lines per cell, line breaks included, instead of one. The layout is kept in this browser only. **Files** counts the files linked to each record and **Filled** how many of its fields hold a value. |
| Act on several records | Tick them, across pages if needed: **Set a field** gives them one value, **Export CSV** exports them, **Delete** removes them. |
| Export | **Export CSV** in the ⋮ menu exports every record the search and filters find, or the selection when there is one, never only the visible page. At most 10,000 records per export. Cells starting with `=`, `+`, `-` or `@` are prefixed with `'` so a spreadsheet never runs them as formulas. |

The ↗ button next to a key, or Enter on the key, opens the record as a card on the right. Its address carries `?record=`, so a link to it can be shared with another admin.

- **Fields** lists every field with an input of its type; a value is saved when you leave the field or pick an option. The pencil next to a field's name edits the field itself (display name, type, options, switches), and **Add a field** at the bottom adds one to every record.
- **Files** shows the files linked to the record with their thumbnail, the primary one marked, and what linked each of them: a matching step and its pattern, a folder, a file set by hand, the CSV mapping or the file metadata. Files linked to a range the record belongs to follow under **Covering the range**. Files are attached from [Unmatched](#fix-what-matching-could-not), not from the card.
- **History** lists who created, changed or deleted the record, when, where (grid, card, bulk edit, CSV import, Unmatched, removal of a field) and each value before and after. A record deleted and created again under the same key shows its earlier life. History started with this version; earlier changes are not listed, and it is never pruned.

**Delete product** at the bottom of the card, or **Delete** on a selection, removes records. Their last values stay in the history. Files linked to their key stay linked and appear as dangling in Unmatched until a record with that key exists again.

## Give each field a type

Every column of the catalogue is a **field**. A field has one of these types:

| Type | Entered as | Stored as |
|---|---|---|
| Text | One line | The text, trimmed |
| Long text | Several lines, Ctrl+Enter or ⌘+Enter saves | The text as typed |
| Number | Digits, with a dot or a comma as decimal point | `12.5` |
| Date | A date picker | `2026-10-01` |
| Link | A web address | The `http` or `https` address |
| Single select | One option from a list | The option |
| Multiple select | Several options from a list | The options in list order, joined by `\|`, such as `Eco\|Sale` |

An empty value is valid for every type. A value its type refuses is not saved and the reason is shown. Changing the type of a field never rewrites stored values: those that no longer fit are shown in red in the grid, with the reason on hover, until someone corrects them. The field dialog says how many there are.

A field turned into a select without options takes its options from the values records already hold. An option cannot contain `|`. Readers see the options of a multiple select as a list, and search filters and counts treat each option on its own.

Add a field from the ⋮ menu, from **Columns**, from a record's card, or on **Fields**. Its name is the CSV column name and cannot change afterwards; its display name can. Edit or remove a field from its column menu or on **Fields**. Removing a field removes its value from every record, and each record keeps the lost value in its history.

## Prepare the CSV

The first row holds the column names and each row after it is one record. One column holds a stable, unique key such as `sku`. Save the sheet as CSV (UTF-8) from Excel, Numbers or Google Sheets; commas, semicolons and tabs all work, and blank lines are ignored.

The key column name is fixed by the first record, imported or created on screen. When a file does not have that column, you choose the column whose values are matched against the stored keys. The easiest way to update what is stored is to start from **Export** on the records page, edit it, and import it back.

Write values in the form of their field: numbers with a dot or a comma, dates as `YYYY-MM-DD`, links with `https://`, and the options of a multiple select joined by `|`. An option a select field does not have yet is added to its list.

Example:

```csv
sku,name,colour,category
ABC123-001,Example shirt,Blue,Clothing
ABC123-002,Example bag,Black,Accessories
```

## Compare before importing

Open **Import CSV** on the records page (`/admin/data-enrichment/records/import`). Nothing is saved before the last step.

1. **File**: drop the CSV or choose it.
2. **Columns**: check the key column, then say where each other column goes. A column goes into the field with the same name or display name, case aside; otherwise it becomes a new Text field. Pick another field, or **Don't import**, for any column. Sample values show what each column holds. Under **Empty cells**, choose whether an empty cell keeps the value already stored (the default) or clears it.
3. **Review**: counts of new, changed, unchanged and not imported rows sit above the list; click one to show only those rows. A changed row lists each field as old value → new value. Every changed row is ticked and will be applied; untick the ones to leave as stored, or use the header box to untick or tick them all. New rows are always created. The fields that will be created and the options that will be added to select fields are listed at the top.
4. **Import** writes it all in one go: if it fails, nothing is written. Each created or changed record gets a history entry from the import.

Rows are not imported when they have no key, when their key appears on several rows of the file, or when a value is refused by its field, such as text in a Number field. The review gives the reason for each; fix the file and import it again.

CSV is parsed in the browser and sent as JSON. The API body limit is 5 MiB, so the JSON request may exceed the limit even when the original CSV does not. Split large catalogues into batches with the same key column.

**Remove all products** in the ⋮ menu deletes every record, including those outside the current search and filters. Their values stay in the history, links set on their keys wait as dangling, and no source file is deleted.

## How a file ends up linked

After every sync, and straight away after an admin change, Damvia computes the links of every file of a record-related type:

- A file can be linked to several records and to ranges. Each link remembers what made it: file name, folder path, folder set by hand, file set by hand.
- One of the record links is the **primary**; it decides the thumbnail, the view and the record attributes shown on the file. Links set on the file by hand come first, then links set on a folder by hand, then file name, then folder path.
- A key that no record has is kept as a **dangling** link, with its reason ("no record with key EVT-25041"). Importing the record later attaches the file on the next pass. Deleting a record does the reverse.
- Changing a step or moving a file in the cloud recomputes the links made by steps. Links set by hand are never touched by a step.

The **Files** tab of a record's card shows every file linked to it and what linked it, with the files covering its ranges.

## Fix what matching could not

Open **Data enrichment → To review** (`/admin/data-enrichment/unmatched`). The menu badge counts unmatched files and conflicts.

| Tab | Lists | Action |
|---|---|---|
| Folders | Folders holding unmatched files, largest first | **Attach** links every file of the folder and its subfolders, now and after each sync, to one record or one range |
| Files | Every unmatched file and why | **Attach** one file or the selected ones by hand |
| Conflicts | Files where steps found different keys | **Use** one of the keys, or **Other**. The choice is kept and no step changes it later |
| Dangling | Links to a key or value no record has | **Create record** with the key only, filled by the next CSV import, or **Detach** a link set by hand |
| Linked by hand | Every folder and file linked by hand, newest first, with the number of files, the target and who set it | **Link this folder** links any folder, including one whose files are already matched, such as a pack that covers a whole range. **Detach** removes a link |

The attach dialog searches records by key and by searchable attribute, or picks a range by attribute and value. When the key does not exist, **Create record with this key** creates it.

## Use the metadata written inside the files

Damvia reads the EXIF (camera, lens, date taken, GPS) and IPTC (title, caption, keywords, credit, city, copyright) metadata of every image it processes. Each tag becomes a field on the **File metadata** tab of **Fields**, created switched off the first time a file carries it, so nothing shows to readers until an admin decides. Formats that carry no readable metadata, such as PSD files, are skipped without an error. Images processed before this feature have none until `npm run cli -- metadata:backfill` is run once on the server.

| Switch | Effect |
|---|---|
| Searchable | Free-text search also looks in this field. |
| Filter | The field becomes a filter in search: its values for text, a from/to range for dates. A GPS position cannot be a filter. Text fields show their 200 most used values. |
| Visible | The value is shown under **From the file** in the file preview and can be chosen as a list column on an asset type. |
| Can link | The field may link files to records, through a **Metadata** step on the Link to products screen. Say whether the value is a record key or the value of an attribute (a range). |

Metadata belongs to the file, so these filters also work on files no record is linked to. Cameras write some fields reliably; people write others, which can be wrong or outdated. Only tick **Can link** for a field your team fills reliably: until then, a value equal to a record key links nothing. When a trusted field has a record key on an unmatched file, the Unmatched screen suggests it with **Accept**. Dates are stored as the camera wrote them, without time zone conversion.

## Map files to records with a CSV

For files whose name, folder and metadata say nothing, the **CSV mapping** section of the Link to products screen imports a CSV with the columns `file_name` and `record_key`, or `file_name`, `attribute` and `value` for a range. The file name may leave out its extension and case does not matter. The first row must name the columns; the file is limited to 5 MB and 50,000 rows.

Choosing the file compares it with the current mapping before anything is written: rows new, changed and removed, keys no record has, and how many files of the library it names. **Replace the mapping** then applies it: a new import replaces the previous one entirely and links from the old one go. Links set by hand are kept. CSV links apply to every record-related asset type, after links set by hand and before file name steps.

## Set the views

Views are made for brands that sell products. A product is usually shot several times (front, back, side, close-up, in use), and a number after the product key in the file name tells these pictures apart: `ABC123-001.01.jpg`, `ABC123-001.02.jpg` and `ABC123-001.03.jpg` are three views of product `ABC123-001`. With views on, these files are linked to the same record, search can be filtered by view, and one view is used as the record's picture. Leave views off when each file shows its record once, as for events or venues. In **Settings**, section **Record label**, under **Views**. Separator, Digits and Thumbnail view show only while the switch is on:

| Setting | Effect |
|---|---|
| Files show several views of each record | Off on new installs; turned on at the upgrade when `PRODUCT_MATCHING_REGEX` or `PIM_PRODUCT_VIEW` was set. Off hides the view filter from search and stops reading views, except in steps that name their own view group. |
| Separator | One character, `.` by default. |
| Digits | 1 to 4, `2` by default. |
| Thumbnail view | The view used as the record's picture in the admin list, `00` by default or the old `PIM_PRODUCT_VIEW`. |

The view part is added after the pattern of every file name step that does not name its own view group, and the Link to products screen shows the full pattern. Changing the separator, the digits or the switch re-runs matching straight away.

## Search shows exact files and range files apart

A search now lists each file once, even when it sits in several collections the reader can see, and facet counts count files. When the text finds records (by key or searchable attribute), files linked to a range those records share appear in a separate **Covering the range** section after the exact results: the first 60, then **See all**. A file never appears in both. Range files follow the same visibility, licence and filter rules as any result.

## Configure record fields

Open **Data enrichment → Fields** (`/admin/data-enrichment/fields`), tab **Product attributes**. Drag the fields, or use the arrows, to set the order of the grid and the card; each admin can still rearrange the grid for themselves. Declare how each field behaves:

| Setting | Effect |
|---|---|
| Display name | Label shown to admins and readers instead of the name. |
| Type and options | How values are entered and checked; see [Give each field a type](#give-each-field-a-type). |
| Searchable | Free-text search checks this field. |
| Filter in search | The field becomes a faceted filter. Enabling it also makes it visible. |
| Visible on files | The value can appear in file details and configured list views. |

Choose facetable columns with a manageable set of values such as category, colour family or season. Very high-cardinality values produce unwieldy filters even though the interface hides options that would yield no result.

Search words are alternatives within the text query, while selected values from different attributes narrow the result together. Record-view filters apply only to files whose [asset type](./asset-types.md) is marked **Related to records** (shown with your label, for example "Related to products").

## Validate the result

On a small fixture:

1. Import two records and confirm a repeated comparison reports them unchanged, then edit a value in the grid and find the change in the record's history.
2. Change one value and confirm it is reported as changed before approving it.
3. Repeat one key and confirm the duplicate is reported.
4. Add source files whose names exercise the record key and view capture groups.
5. Confirm the intended type is related to records, the attribute filters appear, and the representative view is used.

If matching fails, check the exact filename, captured key, scheduled job, record key and asset type in that order. The [Environment variables](../reference/environment-variables.md) page contains the exact configuration names; [Background jobs](../reference/background-jobs.md) contains the schedule.
