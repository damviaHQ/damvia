---
title: Branding
description: Rename the instance, change the accent colour, set the login background, and replace the logo and favicon.
sidebar:
  order: 5
lastUpdated: 2026-09-17
---

Branding uses runtime settings, build-time colours, an admin background upload, and static logo files. Knowing which is which saves a rebuild.

| What | Mechanism | Change takes effect |
|---|---|---|
| Name in the browser tab | `APP_NAME` on the server | On server restart, no client rebuild |
| Accent colour | `VITE_BRAND_COLOR`, `VITE_BRAND_COLOR_HOVER`, `VITE_BRAND_COLOR_STRONG` on the client | On client rebuild |
| Login page background image | Admin upload at `/admin/settings` | Immediately |
| Admin sidebar logo policy | Server `ADMIN_CLIENT_LOGO` (alias `ADMIN-CLIENT-LOGO`) | After server restart |
| Brand Logo | Settings → Brand Logo | Immediately after upload |
| Favicon | `client/public/favicon.svg` | On client rebuild |

## App name

The client fetches the public `env` query at startup and sets `document.title` to `appName`, which is `APP_NAME` or, when unset, `Damvia - Open Source Digital Asset Management`. The static `<title>` in `client/index.html` is only visible before the app has loaded.

## Accent colour

Three build-time variables define the `brand` Tailwind colour family. See [Client configuration](./client-env.md) for the accepted values. The rest of the interface stays on the neutral palette.

## Login background

An admin uploads an image under `/admin/settings`. The flow is:

1. The client asks the server for a presigned PUT URL (`settings/auth-background-temp` in the main bucket, valid 24 hours) and uploads the file straight to S3.
2. The server downloads it, resizes it to at most 2000 px high with `sharp`, encodes it as WebP at quality 80, stores it as `settings/auth-background.webp`, and deletes the temporary object.
3. The login, sign-up and password pages ask for `settings.getAuthBackgroundImage`, which returns a presigned GET URL valid 24 hours when the object exists.

Removing the image from the same screen deletes the object. Because the image is in the main bucket, it survives a rebuild of the assets bucket and must be included in backups. See [Backups](../deployment/backups.md).

## Brand Logo and favicon

Upload or replace the brand logo in **Settings → Brand Logo**. SVG, PNG and WebP are accepted, up to 5 MB and 16 million input pixels. Animated images are rejected. The logo appears in the portal, authentication and public page layouts; missing or failed logos fall back to the bundled Damvia logo. The favicon remains `client/public/favicon.svg` and requires a rebuild to change.

Uploads use the same direct-to-MinIO staging and server-side processing pattern as the login background, with additional validation:

1. Only an approved, verified admin can request an upload. A ten-minute presigned POST policy restricts the object key, content type and file size. Each upload has its own random key scoped to the requesting user.
2. The server checks the actual bytes and image format, limits input size/pixels, and processes in-memory with Sharp. SVG is rasterised to static WebP; original SVG markup is never served. Loading from a buffer avoids a base file for external resources. See [Sharp security](https://sharp.pixelplumbing.com/security/) and [librsvg resource restrictions](https://gnome.pages.gitlab.gnome.org/librsvg/Rsvg-2.0/class.Handle.html#security-and-locations-of-referenced-files).
3. Only validated output replaces the permanent `settings/client-logo.webp` object. Replacements/removals are serialised. The previous version is explicitly deleted on versioned buckets; ordinary buckets atomically replace the single object. Invalid uploads leave the previous logo intact. Storage retention policies must permit deletion.
4. Staged objects are removed on completion or validation failure. Abandoned uploads are removed by the daily integrity check after 24 hours. Both logo and background belong in main-bucket backups.

## Admin sidebar logo

The hosting administrator controls the sidebar through the server environment: `ADMIN_CLIENT_LOGO=true` allows the uploaded logo; `false` (default) always uses Damvia. `ADMIN-CLIENT-LOGO` is also accepted, and wins when both spellings are set. Restart the server after changing it. When enabled but no logo has been uploaded, the sidebar falls back to Damvia.

DAM admins can upload client artwork but cannot change this setting. The generic Damvia logo is bundled separately in `packages/design-system/src/logo.svg`. Client artwork keeps its colours on a white backing in the dark admin sidebar. No workspace-name block is repeated below it.

## Fonts

The redesigned admin uses the self-hosted Mona Sans font from the design-system package. The tenant portal loads Inter from Google Fonts in `client/index.html` and Tailwind's `fontFamily.sans` is set to `Inter`. To self-host or change the font, edit both places and rebuild.

## Legal pages

`/privacy-policy` and `/legal-information` are Vue views (`client/src/views/public/`) with hard-coded text. Edit them for your organisation before going live; they are reachable without login.

Settings groups Brand Logo and Login background into separate panels with consistent upload and replacement actions.
