---
title: Products and PIM
description: Import a product catalogue, match assets from filenames and choose which columns power search and display.
sidebar:
  order: 10
lastUpdated: 2026-09-20
---

The PIM area adds product context to mirrored assets. Damvia imports a flat CSV catalogue, extracts a product key and optional view from each filename, and uses selected catalogue columns for search, filters and display.

## Plan the matching rule first

`PRODUCT_MATCHING_REGEX` runs against each asset filename. Capture group 1 must return the product key exactly as it appears in the CSV. Optional group 2 becomes the product view.

For example:

```dotenv
PRODUCT_MATCHING_REGEX=^(.{6}-\d{3})(?:\.(\d{2}))?
PIM_PRODUCT_VIEW=00
```

`ABC123-001.02.jpg` becomes product key `ABC123-001`, view `02`. `PIM_PRODUCT_VIEW=00` asks the product list to use a matching `00` file as the representative picture when one has a preview.

Test the expression on representative filenames before importing a large catalogue. Write it without surrounding slashes or flags. A bad rule can leave assets unlinked or associate them with the wrong products every five minutes.

## Prepare the CSV

The first row must contain column names and the following rows contain product data. Choose one stable, unique primary-key column such as `sku`. Damvia accepts CSV, not Excel, and large files padded with empty rows should be cleaned first.

The primary-key column name is fixed by the first import. Later imports must use the same key name. Missing values in other columns become empty strings so that all products expose the same set of attributes.

Example:

```csv
sku,name,colour,category
ABC123-001,Example shirt,Blue,Clothing
ABC123-002,Example bag,Black,Accessories
```

## Compare before importing

Open `/admin/products/import`:

1. Choose the CSV file.
2. Select the columns to import.
3. Select the primary-key column.
4. Compare with the existing catalogue.
5. Review new, changed, unchanged and duplicate rows.
6. Select which changed rows may overwrite existing data, then import.

Rows with an empty key are skipped. Duplicate keys in the same file are reported for review. The import creates new products and applies only the changed rows you approved.

CSV is parsed in the browser and sent as JSON. The API body limit is 5 MiB, so the JSON request may exceed the limit even when the original CSV does not. Split large catalogues into batches with the same key column.

Removing all products clears product links from assets before deleting the catalogue. It does not delete source files.

## Let the scheduled matcher link files

Every five minutes, Damvia applies `PRODUCT_MATCHING_REGEX` to asset filenames. A captured key that exists in the catalogue sets the product link; capture group 2 sets the view. A matching key that no longer exists clears an old product link.

Changing the regex does not rename assets. It changes their product associations on subsequent matching runs. Check a representative product, including its intended thumbnail view, after every regex or catalogue change.

## Configure product attributes

Open `/admin/products/attributes` and declare how each imported column behaves:

| Setting | Effect |
|---|---|
| Display name | Reader-facing label for the column. |
| Searchable | Free-text search checks this column. |
| Filter in Search | The column becomes a faceted filter. Enabling it also makes it viewable. |
| Visible in Product List | The value can appear in file details and configured list views. |

Choose facetable columns with a manageable set of values such as category, colour family or season. Very high-cardinality values produce unwieldy filters even though the interface hides options that would yield no result.

Search words are alternatives within the text query, while selected values from different attributes narrow the result together. Product-view filters apply only to files whose [asset type](./asset-types.md) is marked **Related to products**.

## Validate the result

On a small fixture:

1. Import two products and confirm a repeated comparison reports them unchanged.
2. Change one value and confirm it is reported as changed before approving it.
3. Repeat one key and confirm the duplicate is reported.
4. Add source files whose names exercise the product key and view capture groups.
5. Confirm the intended type is product-related, the attribute filters appear, and the representative view is used.

If matching fails, check the exact filename, captured key, scheduled job, product key and asset type in that order. The [Environment variables](../reference/environment-variables.md) page contains the exact configuration names; [Background jobs](../reference/background-jobs.md) contains the schedule.
