---
title: Client configuration
description: "The client has four build-time variables: the API endpoint and three brand colours."
sidebar:
  order: 3
lastUpdated: 2026-09-15
---

The client is a static bundle built by Vite. Its configuration is read when you run `npm run dev` or `npm run build`, and the values end up inside the JavaScript. Changing `client/.env` on a running dev server has no effect until it restarts; changing it in production means rebuilding and redeploying the bundle.

Copy `client/.env.template` to `client/.env`:

```bash
VITE_API_ENDPOINT=http://localhost:3000/trpc

# Brand color: a Tailwind color name (red-500) or any CSS color (#e11d48).
# Defaults: sky-400 / sky-500 / sky-600. Restart dev server or rebuild after changing.
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
| Any CSS colour | `#e11d48`, `rgb(225 29 72)`, `hsl(346 77% 50%)` | Used verbatim. |

| Variable | Default | Where it shows |
|---|---|---|
| `VITE_BRAND_COLOR` | `sky-400` | Primary accent: badges, the cloud-sync icon, active states. |
| `VITE_BRAND_COLOR_HOVER` | `sky-500` | Hover state of the accent and the "public collection" badge in the member links tab. |
| `VITE_BRAND_COLOR_STRONG` | `sky-600` | Emphasised text such as the license acceptance line in the download dialogs. |

A value that is neither a known Tailwind name nor valid CSS is passed to the browser as is and renders as no colour, so check the result in the download dialog after changing it.

:::note
Most of the interface uses the neutral grey palette from shadcn-vue and is not affected by the brand colours. They apply to accents only. See [Branding](./branding.md) for the other levers.
:::

## No other client settings

The app name in the tab title, the list of regions offered at sign-up and the passwordless flag come from the server at runtime through the public `env` query, so they follow the server's configuration without a client rebuild.
