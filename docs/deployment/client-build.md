---
title: Client build
description: Build the Vue client into static files and serve them with a history fallback.
sidebar:
  order: 3
lastUpdated: 2026-09-16
---

The client is a Vite single-page application. `npm run build` produces a `dist/` folder of static files that any web server, CDN or object storage website endpoint can serve. There is no client Dockerfile or hosting configuration in the repository.

## Build

The client's `package.json` depends on the server package for types, so both must be installed:

```bash
cd server && npm install
cd ../client && npm install
cp .env.template .env      # then set VITE_API_ENDPOINT
npm run build
```

Set `VITE_API_ENDPOINT` to the public API URL followed by `/trpc`, for example `https://api.dam.example.com/trpc`, and the brand colours if you use them. Vite reads `client/.env` at build time; the values are compiled into the bundle, so **a different API URL means a different build**.

`npm run build` runs `vite build` only; type-checking is not part of it. Run `npx vue-tsc --noEmit` first if you want a type error to fail the build.

The output is `client/dist/`: an `index.html`, hashed assets under `assets/`, and `favicon.svg`.

## Serve with a history fallback

The router uses HTML5 history mode, so `/collections/abc` must return `index.html` from the server rather than a 404.

nginx:

```nginx
server {
  listen 443 ssl;
  server_name dam.example.com;
  ssl_certificate /etc/letsencrypt/live/dam.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/dam.example.com/privkey.pem;
  root /srv/damvia/client/dist;

  location / {
    try_files $uri $uri/ /index.html;
  }

  location /assets/ {
    add_header Cache-Control "public, max-age=31536000, immutable";
  }
}
```

Caddy:

```
dam.example.com {
  root * /srv/damvia/client/dist
  try_files {path} /index.html
  file_server
}
```

Netlify, Vercel, Cloudflare Pages and S3 static websites each have a rewrite or "SPA fallback" setting that does the same.

## Caching

Files under `assets/` carry a content hash in their name and can be cached forever. `index.html` must not be cached aggressively, or users keep loading an old bundle that references deleted hashed files after a deploy.

## Fonts

`index.html` loads Inter from Google Fonts. A locked-down network or a strict Content Security Policy needs the font self-hosted; see [Branding](../configuration/branding.md).

## Same host or separate host

The client and the API can share a hostname (proxy `/trpc` and `/v1/` to the server, everything else to the static files) or use two hostnames. Both work because the API's CORS allows any origin and the session travels in an `authorization` header rather than a cookie. Example configurations are in [Reverse proxy](./reverse-proxy.md).

The nginx examples assume certificates already issued at the displayed paths. Replace the hostnames and certificate paths, validate the configuration before reloading, and arrange certificate renewal. They do not provision certificates.
