---
title: Branding
description: Rename the instance, set the accent colour of the portal and emails, set the login background, and replace the logo and favicon.
sidebar:
  order: 5
lastUpdated: 2026-09-27
---

Branding uses runtime settings, build-time colours, an admin background upload, and static logo files. Knowing which is which saves a rebuild.

| What | Mechanism | Change takes effect |
|---|---|---|
| Brand name in the browser tab and emails | Settings → Brand name, falling back to `APP_NAME` on the server | Immediately |
| Accent colour of the portal and emails | Settings → Accent colour | Immediately; portal pages already open pick it up within 5 minutes or on reload |
| Build-time `brand` colour family | `VITE_BRAND_COLOR`, `VITE_BRAND_COLOR_HOVER`, `VITE_BRAND_COLOR_STRONG` on the client | On client rebuild |
| Login page background image | Admin upload at `/admin/settings` | Immediately |
| Admin sidebar logo policy | Server `ADMIN_CLIENT_LOGO` (alias `ADMIN-CLIENT-LOGO`) | After server restart |
| Brand Logo | Settings → Brand Logo | Immediately after upload |
| Favicon | `client/public/favicon.svg` | On client rebuild |

## App name

An admin sets the brand name in **Settings → Brand name**. It is the name of the browser tab, and in every email the sender name (unless one is set under **Admin → Emails**), the name at the top when no logo is uploaded, the `Sent by` line of the footer and the `{{ appName }}` variable.

Left empty, the name is `APP_NAME`, set by the host, and without it `Damvia - Open Source Digital Asset Management` in the browser tab and `Damvia` in emails. The client reads it from the public `env` query at startup; the static `<title>` in `client/index.html` is only visible before the app has loaded. The authenticator app entry created for two-step verification keeps `APP_NAME`, so existing entries are not renamed.

## Accent colour

An admin sets one colour in **Settings → Accent colour**, as a colour picker or a `#rrggbb` code. It is stored in the database and applies to:

- **every email**: the button, the links and the bar above the heading. See [Email templates](./email-templates.md);
- **the client portal**: its buttons, links, focus rings and selections, including dialogs. The administration keeps the Damvia colours.

Text on the colour is white, unless the colour is too light for white text (contrast under 3:1 against white), in which case it is near-black; the settings screen warns when this happens, because links in that colour are also hard to read on white. **Use the default** returns to the neutral dark grey (`#171717`) that the portal and emails use without a setting.

The colour is public: the login page reads it before anyone signs in.

The three build-time variables `VITE_BRAND_COLOR`, `VITE_BRAND_COLOR_HOVER` and `VITE_BRAND_COLOR_STRONG` define the `brand` Tailwind colour family, with a readable text shade and foreground derived from the first. See [Client configuration](./client-env.md). When an accent colour is set in Settings, it replaces that family at runtime too, so there is no need to rebuild the client to change the brand colour.

## Login background

An admin uploads an image under `/admin/settings`. The flow is:

1. The client asks the server for a presigned PUT URL (`settings/auth-background-temp` in the main bucket, valid 24 hours) and uploads the file straight to S3.
2. The server downloads it, resizes it to at most 2000 px high with `sharp`, encodes it as WebP at quality 80, stores it as `settings/auth-background.webp`, and deletes the temporary object.
3. The login, sign-up and password pages ask for `settings.getAuthBackgroundImage`, which returns a presigned GET URL valid 24 hours when the object exists.

Removing the image from the same screen deletes the object. Because the image is in the main bucket, it survives a rebuild of the assets bucket and must be included in backups. See [Backups](../deployment/backups.md).

## Brand Logo and favicon

Upload or replace the brand logo in **Settings → Brand Logo**. SVG, PNG and WebP are accepted, up to 5 MB and 16 million input pixels. Animated images are rejected. The logo appears in the portal, authentication and public page layouts, and at the top of every email; missing or failed logos fall back to the bundled Damvia logo, and emails to the instance name in text. The favicon remains `client/public/favicon.svg` and requires a rebuild to change.

Uploads use the same direct-to-MinIO staging and server-side processing pattern as the login background, with additional validation:

1. Only an approved, verified admin can request an upload. A ten-minute presigned POST policy restricts the object key, content type and file size. Each upload has its own random key scoped to the requesting user.
2. The server checks the actual bytes and image format, limits input size/pixels, and processes in-memory with Sharp. SVG is rasterised to static WebP; original SVG markup is never served. Loading from a buffer avoids a base file for external resources. See [Sharp security](https://sharp.pixelplumbing.com/security/) and [librsvg resource restrictions](https://gnome.pages.gitlab.gnome.org/librsvg/Rsvg-2.0/class.Handle.html#security-and-locations-of-referenced-files).
3. Only validated output replaces the permanent `settings/client-logo.webp` object. Replacements/removals are serialised. The previous version is explicitly deleted on versioned buckets; ordinary buckets atomically replace the single object. Invalid uploads leave the previous logo intact. Storage retention policies must permit deletion.
4. Emails need a PNG, since Outlook shows neither WebP nor SVG. Each upload also writes `settings/client-logo-email.png` (at most 320 × 96 px), served publicly at `API_URL/v1/branding/email-logo.png` with a one-hour cache. A logo uploaded before this existed gets its PNG at the first request. Removing the logo removes both.
5. Staged objects are removed on completion or validation failure. Abandoned uploads are removed by the daily integrity check after 24 hours. Both logo and background belong in main-bucket backups.

## Admin sidebar logo

The hosting administrator controls the sidebar through the server environment: `ADMIN_CLIENT_LOGO=true` allows the uploaded logo; `false` (default) always uses Damvia. `ADMIN-CLIENT-LOGO` is also accepted, and wins when both spellings are set. Restart the server after changing it. When enabled but no logo has been uploaded, the sidebar falls back to Damvia.

DAM admins can upload client artwork but cannot change this setting. The generic Damvia logo is bundled separately in `packages/design-system/src/logo.svg`. Client artwork keeps its colours on a white backing in the dark admin sidebar. No workspace-name block is repeated below it.

## Fonts

The redesigned admin uses the self-hosted Mona Sans font from the design-system package. The tenant portal loads Inter from Google Fonts in `client/index.html` and Tailwind's `fontFamily.sans` is set to `Inter`. To self-host or change the font, edit both places and rebuild.

## Legal pages

`/privacy-policy` and `/legal-information` are Vue views (`client/src/views/public/`), reachable without login. The privacy page is built from the server's configuration and names the organisation from `PRIVACY_CONTROLLER` and `PRIVACY_CONTACT`; see [Privacy and personal data](./privacy.md). The legal information page has hard-coded text: edit it for your organisation before going live.

Settings groups Brand Logo and Login background into separate panels with consistent upload and replacement actions.
