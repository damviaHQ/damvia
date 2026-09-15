---
title: Branding
description: Rename the instance, change the accent colour, set the login background, and replace the logo and favicon.
sidebar:
  order: 5
lastUpdated: 2026-09-15
---

Branding is spread over four mechanisms with different lifecycles: a runtime setting, a build-time colour, an admin upload, and two static files. Knowing which is which saves a rebuild.

| What | Mechanism | Change takes effect |
|---|---|---|
| Name in the browser tab | `APP_NAME` on the server | On server restart, no client rebuild |
| Accent colour | `VITE_BRAND_COLOR`, `VITE_BRAND_COLOR_HOVER`, `VITE_BRAND_COLOR_STRONG` on the client | On client rebuild |
| Login page background image | Admin upload at `/admin/settings` | Immediately |
| Logo in the top bar, favicon | Files in the client source | On client rebuild |

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

## Logo and favicon

Both are static files in the client:

| File | Used by |
|---|---|
| `client/src/assets/logo.svg` | The top bar and the authentication layout |
| `client/public/favicon.svg` | `<link rel="icon">` in `client/index.html` |

Replace them with files of the same name and rebuild. There is no admin upload for the logo.

## Fonts

The client loads Inter from Google Fonts in `client/index.html` and Tailwind's `fontFamily.sans` is set to `Inter`. To self-host or change the font, edit both places and rebuild.

## Legal pages

`/privacy-policy` and `/legal-information` are Vue views (`client/src/views/public/`) with hard-coded text. Edit them for your organisation before going live; they are reachable without login.
