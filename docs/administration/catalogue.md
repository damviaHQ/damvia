---
title: Product catalogue
description: Open the record database to readers as a catalogue, with product collections, readiness and models.
sidebar:
  order: 15
lastUpdated: 2026-09-23
---

The record database is an administrative tool until you open part of it to readers. A **product collection** does that: it holds records instead of files, and readers browse those records as a catalogue of cards, each carrying its main visual, the visuals attached to it and the field values you made visible. This is the route to take when your readers think in products rather than in folders.

Product lists appear in the reader navigation through the collection entries managed in **Admin → Menu**. There is no automatic **Products** entry. The catalogue route `/catalogue` remains available for full listings.

Records are called whatever you named them in Settings. This page says *product*; your instance may say *reference*, *event* or *venue*.

Product collections start at the top level unless you choose a parent. A parent makes the collection a real child with inherited visibility and access rules. To group only its navigation link, leave the parent empty and arrange it in [Menu](./menu-and-pages.md).

## A collection gives access to its products and their linked pictures

One rule decides everything: **a reader sees a product when at least one collection they can open holds it.** Product collections use the same visibility as every other collection, so a hidden collection, a draft, or one limited to groups hides its products exactly as it hides its files. See [Roles and access](../introduction/roles-and-access.md).

**That same collection gives readers access to the products’ linked pictures**, including previews, favourites and downloads. You do not need a separate PACKSHOTS file collection. Picture access follows current membership: removing or excluding a product closes that route to its pictures, unless another accessible record or file collection still grants access. New linked pictures become available automatically.

Licence dates and regional restrictions still apply to each picture. A picture in a private file collection can also be published through an accessible product collection: either collection can grant access. Other file types, such as PDFs and videos, still need access through a file collection. Counts and thumbnails only use files the reader may open.

For automatic linking, keep the **Packshot** asset type assigned to the source folder, enable **Related to products**, and configure the rules in **Link to products**. The collection publishes the matches; it does not create them. These labels use the record name in Settings, so the same setup works for events, properties or venues. **Views** is optional and is not required for matching or picture access.

A product no collection holds is invisible to everybody, administrators included. Opening `/products/<id>` for it answers "not found".

## Create a product collection

Product collections have their own page, apart from **Collections**: it is named after your records in the sidebar (for example **Products collections**), and lists only catalogues. Its **New … collection** button asks for a name and nothing else, then takes you straight to the screen described below to fill it.

A product collection is a collection like any other: same address, same breadcrumb, same selection bar, same action bar. What draws the products is a **Products** block on its page, added for you the moment the collection becomes a catalogue. If it already has a custom page, the product block is appended and the existing blocks are kept. Open **Edit page** to move it, give it a title, choose grid or list, or put it next to a banner and a text block. Readers meet one application, not two.

## Turn an existing collection into a product collection

Open a collection, then **Edit collection**. The Products section chooses what readers browse there:

| Choice | What readers get |
|---|---|
| Files only | The collection as it has always worked. This is what every existing collection keeps. |
| Products only | The collection opens on its products. |
| Files and products | A new page has product, sub-collection and file sections. |

On an existing custom page, blocks determine the visible content and their order. Changing the mode preserves those blocks; use **Edit page** to adjust them.

Membership is built in three ways, and they mix freely:

- **From a reference list.** **Build this catalogue** → **References / CSV** → **Add by reference** takes the product keys, pasted one per line or read from a CSV whose reference column you name. Matching ignores case and surrounding spaces. The references matching no product come back on screen so you can correct the list instead of discovering a short catalogue later. This is the static assortment: it holds the references you gave and changes only when you change it.
- **By hand.** A reader or an editor adds products from the catalogue with **Add to collection**, the same action files already use.
- **By rules.** This is the dynamic assortment: a collection on `Season is Winter 2024` gains and loses products as the field changes. The Rules block builds the membership from the record fields, using the conditions of the records grid: contains, is, is not, is empty, is not empty, is any of. Every product matching the rules joins the collection and leaves it when it stops matching. **Only an administrator writes rules**, including on a collection they own: a rule fills a collection from the whole record database without looking at what its author may see, so anyone else would read the catalogue through a collection of their own. The owner of a collection still chooses what readers browse there and adds products by hand, which is checked against their own visibility.

Whichever way a collection is built, it only ever stores a list of references. The field values, the visuals and the readiness of a product are read live, so a product corrected in the grid is corrected everywhere it appears.

## Build the catalogue and see what is ready

**Products collections** → **Build** opens the catalogue builder. **View collection** opens its reader view. It shows every product the collection holds, one row each, with no value editing: that stays in the records grid.

The **References / CSV** and **Automatic rules** tabs distinguish the two membership sources. Switching tabs does not change membership. Rules are applied with **Save rules**; incomplete rules cannot be saved, and the preview continues to show the saved membership while changes are pending. Clearing and saving the rules removes automatic membership while keeping manually added references.

Each preview row carries its reference, record fields, source and **readiness** score. Wide tables scroll horizontally within the panel. That score is production information, which is why it lives here and never on a reader's card.

The switch in the first column decides whether a product reaches readers. Turning it off **takes the product out of the catalogue without removing it**: the row stays in the same reference order, greyed, and the count readers see drops by one. This matters for a rule-driven collection, where a deletion would be undone at the next pass; an exclusion is a decision, and a refresh leaves it alone.

**Exclude all not ready** takes out, in one move, every product the readiness definition does not call ready. Its count covers the entire collection, including rows on other pages. Use it to publish a collection while the missing pictures are still being shot, then put products back as they land.

The builder uses exclusion rather than deletion. In a fixed collection, its owner can also select products in the reader view and remove them with the action bar. A product a rule brought in leaves the collection by changing the rule or the record, or is hidden with its inclusion switch.

**Products added by hand are never removed by a rule.** A refresh only ever rewrites the rows it wrote itself, so an editor can pin a product into a seasonal collection without the next pass taking it away.

Rules are applied the moment you save them. After that, a record edited in the grid reaches its dynamic collections at the next enrichment pass, so allow up to five minutes for a product to appear in or disappear from a rule-driven collection. See [Background jobs](../reference/background-jobs.md).

### One collection for the whole catalogue

**Show the whole catalogue** turns a collection into an entry on every record at once, without a membership row per product. Use it for the single "All products" entry most instances want in the menu. It is an administrator's decision; an owner cannot set it on their own collection. A copy of such a collection never inherits the flag. This mode has no per-product inclusion preview: save rules in the builder to turn it into a curated collection before excluding individual entries.

## Group the catalogue in the menu

Sidebar headings are menu entries of type **Section**, so the catalogue gets its own part of the navigation next to the library. Create a section named Catalogue in `/admin/menu-items`, then drop the product collections under it. A reader who cannot see anything inside a section is not shown the heading. See [Menu and pages](./menu-and-pages.md).

## Searching and narrowing the catalogue

The top search bar has two labelled choices: **Files** finds individual pictures, documents and videos; **Products** (your configured record label) finds references and searchable record fields, with their linked pictures. Asset types are filters within Files, not another search mode. A product list narrows the scope of the product search. Its placeholder names the selected target. The choice stays selected as you navigate; opening a product page never changes it for you. Switching on a results page changes the results immediately. Product search starts in **multiple references** mode: words or pasted references separated by spaces or commas are matched independently. Choose **Exact phrase** in the search options or the results sidebar to search the whole text together. When searching from a collection, the sidebar lets you choose that collection, its subcollections, or all collections. Product results use the same cards and grid/list preference as the catalogue.

Choose **Name** from the filter icon to show the same search chip used on collection pages. In the full catalogue, this search reads the product key and the fields marked **Search** in the field settings. A field left out of search is never matched, even when it is shown on the product page, so a value kept out of sight cannot be confirmed by probing for it. See [Records](./records.md).

The filter icon of the action bar works on products exactly as it works on files: pick the fields you want on the bar, then pick values, and the chips show what is on. A product offers the fields marked **Filter** in the field settings, and the dimensions that belong to files alone, asset type and format, do not appear where there are no files. A collection holding both offers one bar over both, so a field shared by a product and its media narrows the two at once. The full catalogue filters and counts matching products on the server across every page. An embedded Products block filters its displayed preview; its **Showing …** link opens the complete collection in the catalogue when there are more than 96 products.

## What a card shows

A catalogue card carries the main visual, the reference and the visuals attached to the product. Settings → **Card title field** names the one field shown under the reference, on a single line, for example *Style name*; leaving it on **Reference only** shows the reference alone.

One field, one line, deliberately. A card that grew with its content left a product carrying a long description towering over an empty neighbour, and the grid stopped reading as a grid. Every other field is on the product page. **Display preferences** switches products between grid and list and chooses additional field columns. These preferences are saved independently of file layouts. The reference and configured title stay visible in both views.

Readiness, file counts and the fields a product does not fill are not shown to readers. They are how you steer the catalogue, not how somebody browses it; see the readiness screen below.

## Open a product and its files

The image and reference both open the product page. Its heading uses the same title field as its card. The breadcrumb keeps the collection from which the product was opened, and its details show the visible record fields.

The **Files** section offers every populated filterable field of the current product, including **Product Type** when that field is marked **Filter** in Records. A single-value facet stays available here; open the filter icon to add its chip. Fields left empty, hidden or not filterable are not offered. This also works for files attached through record links.

The **Files** section uses the collection file renderer: grid, list or masonry, filter chips, previews, favourites and file selection. Linked pictures inherit access through the product collection; all files retain their licence dates and regional restrictions. Adding the product itself to a collection uses the separate **Add to collection** action in the product header.

## Choose related products

Settings → **Related Products** defines what appears on product detail pages. The heading follows the configured plural record label. The catalogue builder offers the same controls per collection; **Use the default related products settings** restores the global setting. Only administrators change these rules.

Each group combines:

- **Look in**: the current list (including accessible subcollections and excluding excluded members), or all accessible lists. A current-list group returns nothing when the product was opened without a collection; it never silently expands to all lists.
- **Related by**: the same model, the same nonempty value of a visible field, or any product matching the filters. Same-field matching compares the complete stored value; **Same model** uses the normalised model key.
- **At least one accessible photo**: requires a linked image file the reader can open. A PDF thumbnail, a private image or a licence-restricted image does not qualify.
- **Match all filters (AND)**: all conditions must hold.
- **Exclude if any filter matches**: any matching exclusion removes the product from this group. For a select field, choose the unwanted values with **is any of**.

**Add OR group** includes products matching any group. An exclusion belongs to its group: another group may include the same product. Up to five groups are supported, with ten inclusion and ten exclusion filters per group.

For “the same range except SS24, with at least one photo”, choose **Same Range**, enable the photo switch and exclude **Season is any of SS24** in one group. To also include all products with a photo from other lists, add a second group with **All accessible lists**, no relationship field and the photo switch enabled.

The current product is always omitted and overlapping groups produce no duplicates. Related cards use the catalogue card design, paginate by 24 and preserve the originating collection when opened. Rules never widen record or file access. A group referring to a field that is removed or made private stops contributing results. With no custom setting, the default remains other products of the same model across accessible lists. Turning **Show related products** off hides the section.

## Say what makes a product ready to use

Settings → **Ready to use** describes what a complete product is in your organisation:

- **Required fields**: the record fields a product must carry a value for.
- **Required views**: the view numbers it must have a file for, for example `00` for the front and `01` for the back. Views are configured in the same screen; see [Records](./records.md).
- **Labels**: what a complete product and an incomplete one are called, for example "Ready to use" and "To complete".

Each product then carries a score, which you read in administration to see what is left to produce. **Requiring nothing leaves every product ready**, which is what a fresh instance does until you fill this in.

The score is recomputed when a record is edited or imported, when files are linked during a sync, and when you save the definition. A required view counts as filled as soon as one file carries that view, whether it reaches the record through a link or through the older matching column.

**Keep products with no visible file out of the catalogue** hides, from listings, every product none of whose files the reader may open. A direct link to such a product still opens it: a listing choice is not a refusal, and readers who received a link should not meet a dead end.

## Group several keys under one model

A brand usually sells one model in several colours or formats: one style with three colourways, one flavour in a single can and in a four-pack. Settings → **Model field** names the field holding that model, for example *Style name*. Products sharing its value form one model.

The value is matched on a normalised key: case, accents and stray spaces are ignored, so `Pampa`, ` pampa ` and `PAMPÁ` are the same model. The name shown to readers is the value as it was typed. This grouping supplies the **Same model** option in related-product settings.

Changing the model field regroups the whole catalogue at once. Clearing it drops the grouping, and nothing else changes.

## Readers build their own assortments

A reader creates product collections of their own under **My collections**, either from scratch or from one of yours:

- **From scratch**: create a collection under My collections by giving it a name and, optionally, a parent. There is no Files/Products type to choose: a personal collection accepts both and displays what it contains. Creating one from a selection also selects it as the destination. Products can be added from the catalogue or by reference in the collection settings.
- **From an existing catalogue**: add one of your product collections to their own. The copy freezes the membership as it stands, as hand-picked entries, even when the source was rule-driven. The copy never carries the rules or the "whole catalogue" flag, so it stays the assortment they chose on that day.

Personal collections show products, files and subcollections with the shared renderers. Existing layouts are preserved; a product or file section omitted by an older layout is displayed automatically when that content is added.

Products they remove from their copy leave only that copy. The catalogue and the collections you publish are untouched.

## What this does not do yet

Catalogue-style presentation pages built from a product collection, and channel exports of a collection's fields and visuals, are not part of this release. The membership of a product collection is the durable record both will read, so nothing needs to be rebuilt when they arrive.
