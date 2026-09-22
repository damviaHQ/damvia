---
title: Product catalogue
description: Open the record database to readers as a catalogue, with product collections, readiness and models.
sidebar:
  order: 15
lastUpdated: 2026-09-22
---

The record database is an administrative tool until you open part of it to readers. A **product collection** does that: it holds records instead of files, and readers browse those records as a catalogue of cards, each carrying its main visual, the visuals attached to it and the field values you made visible. This is the route to take when your readers think in products rather than in folders.

Records are called whatever you named them in Settings. This page says *product*; your instance may say *reference*, *event* or *venue*.

## A reader sees a product through a collection, and its media through the library

One rule decides everything: **a reader sees a product when at least one collection they can open holds it.** Product collections use the same visibility as every other collection, so a hidden collection, a draft, or one limited to groups hides its products exactly as it hides its files. See [Roles and access](../introduction/roles-and-access.md).

The media of a product are not covered by that rule. Each file keeps the rights it already had: its licence, its region and the collections holding it. A reader can therefore see a product and only some of its pictures, or none of them. Counts and thumbnails on a card only ever come from files that reader may open, so a card never promises a picture it cannot show.

A product no collection holds is invisible to everybody, administrators included. Opening `/products/<id>` for it answers "not found".

## Turn a collection into a product collection

Open a collection, then **Edit collection**. The Products section chooses what readers browse there:

| Choice | What readers get |
|---|---|
| Files only | The collection as it has always worked. This is what every existing collection keeps. |
| Products only | Opening the collection opens the catalogue filtered to its products. |
| Files and products | The files stay in place, with a link to the products of the collection above them. |

Membership is built in two ways, and they mix freely:

- **By hand.** A reader or an editor adds products from the catalogue with **Add to collection**, the same action files already use.
- **By rules.** The Rules block builds the membership from the record fields, using the conditions of the records grid: contains, is, is not, is empty, is not empty, is any of. Every product matching the rules joins the collection and leaves it when it stops matching. **Only an administrator writes rules**, including on a collection they own: a rule fills a collection from the whole record database without looking at what its author may see, so anyone else would read the catalogue through a collection of their own. The owner of a collection still chooses what readers browse there and adds products by hand, which is checked against their own visibility.

**Products added by hand are never removed by a rule.** A refresh only ever rewrites the rows it wrote itself, so an editor can pin a product into a seasonal collection without the next pass taking it away.

Rules are applied the moment you save them. After that, a record edited in the grid reaches its dynamic collections at the next enrichment pass, so allow up to five minutes for a product to appear in or disappear from a rule-driven collection. See [Background jobs](../reference/background-jobs.md).

### One collection for the whole catalogue

**Show the whole catalogue** turns a collection into an entry on every record at once, without a membership row per product. Use it for the single "All products" entry most instances want in the menu. It is an administrator's decision; an owner cannot set it on their own collection. A copy of such a collection never inherits the flag.

## Group the catalogue in the menu

Sidebar headings are menu entries of type **Section**, so the catalogue gets its own part of the navigation next to the library. Create a section named Catalogue in `/admin/menu-items`, then drop the product collections under it. A reader who cannot see anything inside a section is not shown the heading. See [Menu and pages](./menu-and-pages.md).

## Searching the catalogue

The search box above the grid reads the product key and the fields marked **Search** in the field settings. A field left out of search is never matched, even when it is shown on the product page, so a value kept out of sight cannot be confirmed by probing for it. See [Records](./records.md).

## Say what makes a product ready to use

Settings → **Ready to use** describes what a complete product is in your organisation:

- **Required fields**: the record fields a product must carry a value for.
- **Required views**: the view numbers it must have a file for, for example `00` for the front and `01` for the back. Views are configured in the same screen; see [Records](./records.md).
- **Labels**: what a complete product and an incomplete one are called, for example "Ready to use" and "To complete".

Each product then carries a score, shown on its card and on its page, and readers can keep only what is ready or only what is missing something. **Requiring nothing leaves every product ready**, which is what a fresh instance does until you fill this in.

The score is recomputed when a record is edited or imported, when files are linked during a sync, and when you save the definition. A required view counts as filled as soon as one file carries that view, whether it reaches the record through a link or through the older matching column.

**Keep products with no visible file out of the catalogue** hides, from listings, every product none of whose files the reader may open. A direct link to such a product still opens it: a listing choice is not a refusal, and readers who received a link should not meet a dead end.

## Group several keys under one model

A brand usually sells one model in several colours or formats: one style with three colourways, one flavour in a single can and in a four-pack. Settings → **Model field** names the field holding that model, for example *Style name*. Products sharing its value form one model.

The value is matched on a normalised key: case, accents and stray spaces are ignored, so `Pampa`, ` pampa ` and `PAMPÁ` are the same model. The name shown to readers is the value as it was typed. The catalogue then offers a **By model** view listing one card per model, and each product page lists the other entries of its model.

Changing the model field regroups the whole catalogue at once. Clearing it drops the grouping, and nothing else changes.

## Readers build their own assortments

A reader creates product collections of their own under **My collections**, either from scratch or from one of yours:

- **From scratch**: create a collection, then add products as they browse.
- **From an existing catalogue**: add one of your product collections to their own. The copy freezes the membership as it stands, as hand-picked entries, even when the source was rule-driven. The copy never carries the rules or the "whole catalogue" flag, so it stays the assortment they chose on that day.

Products they remove from their copy leave only that copy. The catalogue and the collections you publish are untouched.

## What this does not do yet

Catalogue-style presentation pages built from a product collection, and channel exports of a collection's fields and visuals, are not part of this release. The membership of a product collection is the durable record both will read, so nothing needs to be rebuilt when they arrive.
