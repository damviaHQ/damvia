# Activity map data

`world.json` contains simplified SVG country outlines, map label points and country-name aliases derived from [Natural Earth 1:110m countries](https://www.naturalearthdata.com/downloads/110m-cultural-vectors/110m-admin-0-countries/) and its tiny-country points. Natural Earth data is public domain.

Sources, retrieved 2026-09-17:

- https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_admin_0_countries.geojson
- https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_admin_0_tiny_countries.geojson

Coordinates are projected to an equirectangular 1000 × 448 canvas: `x = 20 + (longitude + 180) / 360 * 960`, `y = 24 + (85 - latitude) / 150 * 400`. Antarctica is omitted. Original rings, including holes, are preserved; paths use even-odd fill. Point-only countries have no outline but can have an activity marker. Boundary shapes are illustrative, not a statement about legal borders.

Country aliases are exact normalized matches from the dataset, including ISO codes and translated names. Ambiguous aliases are not matched. Additional macroregion anchors are explicitly labelled as regional centres in `utils/activityMap.ts`. User activity is aggregated by the current region assigned to each account; markers never represent an IP address, city, device position or real-time presence. All map data is bundled locally; no mapping service receives user or region data.
