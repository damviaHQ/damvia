---
title: Products and PIM
description: Import a product catalogue from CSV, link files to products by file name, and turn product columns into search facets.
sidebar:
  order: 10
lastUpdated: 2026-09-16
---

The PIM section stores a flat product catalogue and links asset files to it by parsing file names. Once linked, product columns can be searched, offered as filters and displayed next to files.

## The product model

| Table | Column | Meaning |
| --- | --- | --- |
| `products` | `product_key` | Unique value of the primary key column, for example a SKU |
| `products` | `primary_key_name` | Name of the CSV column used as the key |
| `products` | `meta_data` | Postgres `hstore` of every other column, string to string |
| `product_attributes` | `name` | A `meta_data` key, unique |
| `product_attributes` | `display_name` | Label shown to users |
| `product_attributes` | `facetable` | Offered as a filter in search |
| `product_attributes` | `searchable` | Matched by the free-text search |
| `product_attributes` | `viewable` | Displayed in file details and list view |

`asset_files.product_id` and `asset_files.product_view` hold the link from a file to a product.

## Import products from CSV

`/admin/products/import` (admin only), titled `Import Products from CSV file`, parses the file in the browser with papaparse using `header: true`. The first CSV row must contain column names, with data starting on the second row. The importer does not accept Excel files or files padded with empty rows.

1. `Select a CSV File`.
2. Under `2. Select Columns to Import`, untick columns you do not want; a preview shows the first two rows.
3. Pick the key column in `Select the Primary Key column`.
4. Under `3. Compare with existing data`, press `Compare now`. `pim.compareCsv` returns one status per row:

| Status | Meaning |
| --- | --- |
| `new` | No product has this key |
| `changed` | A product exists and at least one column differs |
| `unchanged` | A product exists with identical values |
| `duplicate` | The key appears more than once in the CSV |

5. In `Comparison Results`, tick the changed rows to overwrite or `Override all changes`, then press `Import`. Only `new` rows and selected `changed` rows are sent to `pim.importCsv`.

On the server, `importCsv`:

- Uses the `primary_key_name` of the first existing product if any; the key column name is fixed by the first import.
- Adds every CSV column missing from existing products as an empty string, so all products share the same keys.
- Skips rows with an empty key and logs them.
- Creates missing products with every CSV column in `meta_data`, and updates changed values on existing ones.

`Remove All Products` on `/admin/products` sets `product_id` to null on every linked file, then deletes all products. Cells can also be edited inline in the products table, which calls `pim.updateProduct` with the full `meta_data`.

## Files are linked to products by file name

`PRODUCT_MATCHING_REGEX` is a regular expression applied to `asset_files.name`. Capture group 1 is the product key, capture group 2 (optional) the product view. The template value `^(.{6}-\d{3})(?:\.(\d{2}))?` reads a file such as `ABC123-001.02.jpg` as key `ABC123-001`, view `02`.

The `asset/assign-products-to-asset-files` job runs every 5 minutes (`*/5 * * * *`) and, for every file whose name matches:

- looks up the product with that `product_key` and stores it in `product_id`,
- stores group 2 in `product_view`, or null when the group is absent.

A matching file whose key has no product row gets `product_id` set to null, which also clears a link left over from a deleted product. Files whose name does not match are left untouched. If the variable is unset the job logs an error and does nothing.

`PIM_PRODUCT_VIEW` names the view used as a product's thumbnail: `pim.listProducts` picks, for each product, a file with `has_thumbnail` true and `product_view` equal to that value. `asset.listProductViews` returns the distinct views found in the files and feeds the product view filter in search. Both variables are listed in [Environment variables](../reference/environment-variables.md).

## Attributes drive search, filters and display

`/admin/products/attributes` lists attributes with `Attribute Key`, `Display Name`, `Filter in Search`, `Visible in Product List` and `Searchable`. The form offers `Select an Attribute *` from `productAttribute.listAvailable`, which returns the distinct `meta_data` keys of all products, then `Change Display Name`, `Add filter in search` (`facetable`), `Visible in Product List` (`viewable`) and `Searchable`. Ticking `facetable` forces `viewable` on both in the form and on the server.

How each flag is used by `collection.search` in `server/src/trpc/router/collection.ts`:

- **searchable**: every word of the query is matched with `ILIKE` against `asset_file.name` and against `product.meta_data['<name>']` for each searchable attribute; with `exactMatch` the whole query is matched once.
- **facetable**: `productAttribute.listFacets` returns each facetable attribute with the distinct values found in products. The client sends the chosen values as `attributes`, and the server adds `product.meta_data[<name>] IN (...)` conditions, ORed across attributes.
- **viewable**: `formatCollectionFile` returns the product's viewable attributes with each file, so they can be shown in details and as list columns configured on the [asset type](./asset-types.md).

A product view filter only matches files whose asset type has `is_related_to_products` set, so tag your packshot folders with such a type. Results are paginated 300 per page.

## Reproducible import fixture

Save this UTF-8 example as `products.csv` and use `sku` as the key on an empty test catalogue:

```csv
sku,name,colour,category
ABC123-001,Example shirt,Blue,Clothing
ABC123-002,Example bag,Black,Accessories
```

With `PRODUCT_MATCHING_REGEX=^(.{6}-\d{3})(?:\.(\d{2}))?`, `ABC123-001.00.jpg` links to the first product with view `00`. Set `PIM_PRODUCT_VIEW=00`; declare `colour` as facetable and `name` as searchable/viewable. On first comparison both records are `new`; after import, the same CSV should be `unchanged`. Change Blue to Green to exercise `changed`, and repeat a SKU to exercise `duplicate`.

CSV is parsed into JSON before submission. The API body limit is 5 MiB, so the JSON request size, not only the CSV size, determines whether a large import fits. Split into batches while keeping the same key column. Product editing requires an approved, email-verified administrator, both in the interface and through `pim.updateProduct`.
