---
title: Asset types
description: Classify source folders and choose how their files appear and participate in record search.
sidebar:
  order: 6
lastUpdated: 2026-09-21
---

An asset type describes a family of files such as product packshots, campaign visuals or documents. It supplies display and search defaults; it does not grant access. Use groups and licences for access control.

## Define a type

Open `/admin/asset-types` and provide:

| Setting | Effect |
|---|---|
| Name | Identifies the type to admins and readers. Maximum 30 characters. |
| Description | Explains when the type should be used. Maximum 255 characters. |
| Related to records | Allows record-view filtering for files of this type. The checkbox shows the record label chosen in the Data enrichment settings, for example "Related to products". |
| Search by default | Includes the type in a reader's initial search selection. |
| Default display | Chooses grid or list when a reader has no saved preference. |
| List-view items | Chooses and orders size, licence, format, dimensions, updated date, viewable record attributes and visible file metadata fields (marked "from the file"). |

Only admins can create, edit or remove a type. Approved users can read the type list because the library needs it for display and search.

## Assign it to a folder

Open the folder in [Assets](./assets-tree.md), choose the asset type and save. Damvia applies it to the folder, its descendants and their files. New subfolders inherit from their parent; each file takes its current folder's type on every source run.

A type chosen this way is recorded as **set by hand** on that folder and never changed by a rule. Its descendants are recorded as **inherited**. Clearing the type ("No asset type") removes the hand-set mark, so the rules below apply again on the next sync.

## Assign it by a rule on the folder path

Open `/admin/folder-rules` to give a type to every folder whose path matches a regular expression, without touching each folder. A rule has a pattern, an asset type and an enabled flag.

| Field | Rule |
|---|---|
| Pattern | A JavaScript regular expression tested against the folder path, for example `^/DIGITAL PACK/.*/PACKSHOTS`. Case does not matter. Paths start with `/` and the name of the source's top folder, such as `/Dropbox/Season/Packshots`. Rejected when empty, longer than 500 characters, not a valid expression, a duplicate of another rule, or when it takes more than 50 ms on a sample path. |
| Asset type | Given to every folder matched by the pattern and, by inheritance, to their subfolders. |
| Enabled | Disabled rules are kept but not applied. |

Rules are applied by the enrichment pass that runs after every sync, and immediately when a rule is saved or re-applied. The dialog shows, before saving, how many folders match with three examples, and what those folders currently hold ("12 folders currently Packshot (rule `…`)", "3 folders currently Shooting (set by hand, not changed)"). Saving writes the type to the matched folders and their files. Nothing is ever written to the cloud storage.

### Writing a pattern

Every path starts with the top folder of the source, for example `/Dropbox/EVENTS/2026/PACKSHOTS`. Letters, digits and spaces match themselves; these characters have a meaning:

| Character | Meaning |
|---|---|
| `/` | Separates folders. Put it before a name so the name starts there, not in the middle of another word. |
| `^` | The path starts here. A pattern starting with `^` must continue with the top folder, such as `^/Dropbox/`. `^/PACKSHOTS` matches nothing. |
| `$` | The path ends here: the folder itself, not a longer name that begins the same way. |
| `.*` | Any text, across folders. Skips levels you do not want to name. |
| `[^/]*` | Any text inside one folder name only. |
| `(A\|B)` | Either A or B. |
| `\` | Before `. ( ) [ ] + ? * \| ^ $` when the folder name really contains that character. |

| Goal | Pattern |
|---|---|
| Every folder named PACKSHOTS, wherever it is | `/PACKSHOTS$` |
| Every folder whose name contains the word packshots | `/[^/]*packshots[^/]*$` |
| Only one folder | `^/Dropbox/PACKSHOTS$` |
| PACKSHOTS folders at any depth inside one folder | `^/Dropbox/EVENTS/.*/PACKSHOTS$` |

The dialog shows this guide with a **Use** button per example. Its preview says how many folders the pattern matches, how many will take the type, how many keep a type set by hand and how many stay with another rule, naming it. The rules table counts, under **Folders typed**, only the folders a rule actually types, and adds the folders it matches but that keep a hand-set type.

How the type of a folder is decided:

- A type set by hand on the folder wins, always.
- Otherwise the rule that **starts deepest** wins. A rule starts at the highest folder from which it matches without interruption down to the current one. With rule A `^/DIGITAL PACK` and rule B `^/DIGITAL PACK/.*/PACKSHOTS`, A starts at `/DIGITAL PACK` and types the season folders; B starts at `/DIGITAL PACK/PAMPA SS26/PACKSHOTS` and wins there and below.
- Two rules starting at the same level: the older rule wins and both are flagged **Overlaps with** on the rules screen.
- Below a folder typed by hand, a rule that started at or above that folder is blocked, so the subfolders inherit the hand-set type. A rule that starts deeper still wins: with `/SHOOTS` set by hand to Shooting and a rule `PACKSHOTS`, `/SHOOTS/SS26/PACKSHOTS` becomes Packshot.
- Otherwise the folder inherits from the nearest typed ancestor, or stays untyped.

Editing or deleting a rule changes nothing until the next sync or **Re-apply**. Re-apply covers only that rule's folders, the folders it used to type and their inherited subfolders; the toast reports the folder and file counts. Removing an asset type deletes its rules. A rule that stops compiling is skipped by the pass and shows its error on the screen until it is edited.

The type belongs to the file once assigned and follows it into all collections and pages. A manual collection cannot give a different type to one of its files. To classify one file differently, place it in a source folder with the intended type.

Moving a file in the cloud changes its type to the destination folder's type on the next source run and currently removes its manual collection links and favourites. See [Known limitations](../reference/known-limitations.md).

## Record and search effects

Mark a type **Related to records** when its files should participate in record-view filters. Filename matching and the imported catalogue still determine which record a file belongs to; the type only enables that record-related presentation.

**Search by default** preselects the type for new search sessions. Readers can change the selection and Damvia remembers their preference. Use this setting for the core assets people normally expect, and leave decorative or supporting material unselected when it would make searches noisy.

## Display effects

When all files in a result share one type, Damvia can use that type's default grid/list mode and configured list columns. A reader's saved preference overrides the default. Mixed or untyped results use the general file-display preference and a simpler list.

Removing a type leaves its files in place and clears the type assignment. Before removal, check whether it supplies record filtering or list columns that people rely on.
