---
title: Asset types
description: Classify source folders and choose how their files appear and participate in product search.
sidebar:
  order: 6
lastUpdated: 2026-09-20
---

An asset type describes a family of files such as product packshots, campaign visuals or documents. It supplies display and search defaults; it does not grant access. Use groups and licences for access control.

## Define a type

Open `/admin/asset-types` and provide:

| Setting | Effect |
|---|---|
| Name | Identifies the type to admins and readers. Maximum 30 characters. |
| Description | Explains when the type should be used. Maximum 255 characters. |
| Related to products | Allows product-view filtering for files of this type. |
| Search by default | Includes the type in a reader's initial search selection. |
| Default display | Chooses grid or list when a reader has no saved preference. |
| List-view items | Chooses and orders size, licence, format, dimensions, updated date and viewable product attributes. |

Only admins can create, edit or remove a type. Approved users can read the type list because the library needs it for display and search.

## Assign it to a folder

Open the folder in [Assets](./assets-tree.md), choose the asset type and save. Damvia applies it to the folder, its descendants and their files. New subfolders inherit from their parent; each file takes its current folder's type on every source run.

The type belongs to the file once assigned and follows it into all collections and pages. A manual collection cannot give a different type to one of its files. To classify one file differently, place it in a source folder with the intended type.

Moving a file in the cloud changes its type to the destination folder's type on the next source run and currently removes its manual collection links and favourites. See [Known limitations](../reference/known-limitations.md).

## Product and search effects

Mark a type **Related to products** when its files should participate in product-view filters. Filename matching and the imported catalogue still determine which product a file belongs to; the type only enables that product-related presentation.

**Search by default** preselects the type for new search sessions. Readers can change the selection and Damvia remembers their preference. Use this setting for the core assets people normally expect, and leave decorative or supporting material unselected when it would make searches noisy.

## Display effects

When all files in a result share one type, Damvia can use that type's default grid/list mode and configured list columns. A reader's saved preference overrides the default. Mixed or untyped results use the general file-display preference and a simpler list.

Removing a type leaves its files in place and clears the type assignment. Before removal, check whether it supplies product filtering or list columns that people rely on.
