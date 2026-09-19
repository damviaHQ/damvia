---
title: Client configuration
description: "The client has four build-time variables: the API endpoint and three brand colours."
sidebar:
  order: 3
lastUpdated: 2026-09-19
---

The client is a static bundle built by Vite. Its configuration is read when you run `npm run dev` or `npm run build`, and the values end up inside the JavaScript. Changing `client/.env` on a running dev server has no effect until it restarts; changing it in production means rebuilding and redeploying the bundle.

Copy `client/.env.template` to `client/.env`:

```bash
VITE_API_ENDPOINT=http://localhost:3000/trpc

# Brand color: a Tailwind color name (red-500) or a hex color without # (e11d48).
# "#" starts a comment in .env files: write "#e11d48" in quotes or drop the #.
# Defaults: #e5e5e5 / #f5f5f5 / #262626. Restart dev server or rebuild after changing.
VITE_BRAND_COLOR=
VITE_BRAND_COLOR_HOVER=
VITE_BRAND_COLOR_STRONG=
```

## The API endpoint includes /trpc

`VITE_API_ENDPOINT` is the full URL of the tRPC endpoint: the server's public `API_URL` followed by `/trpc`. The client sends every request there with an `authorization` header holding the session token from the `dam_token` cookie. The server's CORS is open to any origin, so the client and API can live on different hosts without extra configuration; see [Reverse proxy](../deployment/reverse-proxy.md).

## Brand colours are resolved by Tailwind

The three `VITE_BRAND_COLOR*` variables define the `brand` colour family in `client/tailwind.config.js`, which loads `client/.env` itself with `dotenv`. Each accepts:

| Form | Example | Resolved as |
|---|---|---|
| Tailwind colour name and shade | `red-500`, `emerald-600` | The hex value from Tailwind's default palette. |
| Hex without `#` | `e11d48`, `777` | Prefixed with `#`. |
| Any other CSS colour | `"#e11d48"`, `rgb(225 29 72)`, `hsl(346 77% 50%)` | Used verbatim. |

`#` starts a comment in a `.env` file, so an unquoted `VITE_BRAND_COLOR=#e11d48` is read as empty and the default neutral grey is used. Quote it or drop the `#`.

| Variable | Default | Where it shows |
|---|---|---|
| `VITE_BRAND_COLOR` | `#e5e5e5` | The licence checkbox, its label and the download button hover in the download dialogs. |
| `VITE_BRAND_COLOR_HOVER` | `#f5f5f5` | Available as the `brand-hover` class; the built-in interface does not use it. |
| `VITE_BRAND_COLOR_STRONG` | `#262626` | Available as the `brand-strong` class; the built-in interface does not use it. |

## Readable shades are derived from the brand colour

The build derives two more colours from `VITE_BRAND_COLOR`, so any brand colour stays readable:

- `brand-text`: the brand colour darkened until it reaches a 4.5:1 contrast ratio on white. Text, borders and hover states use it instead of the raw colour.
- `brand-foreground`: dark grey (`#171717`) or white, whichever contrasts more with the brand colour. It is used on top of a `brand` background.

The derivation understands hex values, `rgb()` and Tailwind colour names. For any other CSS colour, such as `rebeccapurple` or `hsl()`, it falls back to `#262626` and `#171717`. To set colours at runtime instead, define `--tenant-brand-color`, `--tenant-brand-text` and `--tenant-brand-foreground` on the document root; you are then responsible for their contrast.

A value that is neither a known Tailwind name nor valid CSS is passed to the browser as is and renders as no colour, so check the result in the download dialog after changing it.

:::note
Most of the interface uses the neutral grey palette from shadcn-vue and is not affected by the brand colours. They apply to accents only. See [Branding](./branding.md) for the other levers.
:::

## No other client settings

The app name in the tab title, the list of regions offered at sign-up and the passwordless flag come from the server at runtime through the public `env` query, so they follow the server's configuration without a client rebuild.

## Hex colours in dotenv

Bare hex values such as `VITE_BRAND_COLOR=e11d48` are supported. If including `#`, quote the value because dotenv treats an unquoted `#` as a comment:

```dotenv
VITE_BRAND_COLOR="#e11d48"
VITE_BRAND_COLOR_HOVER="#be123c"
VITE_BRAND_COLOR_STRONG="#9f1239"
```
