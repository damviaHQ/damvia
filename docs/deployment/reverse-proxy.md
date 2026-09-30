---
title: Reverse proxy
description: Put HTTPS in front of the API and the client, and expose the S3 endpoint browsers must reach.
sidebar:
  order: 4
lastUpdated: 2026-09-29
---

The server speaks plain HTTP on one port and expects a proxy to terminate TLS. Three hostnames are involved: the client (`APP_URL`), the API (`API_URL`) and the S3 endpoint from the bucket URLs, and all three must be reachable by browsers.

## What the API exposes

| Path | Purpose |
|---|---|
| `/trpc/*` | Every application call, `GET` for queries and `POST` for mutations. Auth is the `damvia_session` cookie. |
| `/v1/downloads/:id` | Checks the download and that its owner can still reach every file on each click, then redirects to a presigned S3 URL valid 5 minutes, or to `APP_URL/link-expired`. Linked from the client and from emails. |
| `GET /v1/branding/email-logo.png` | The client logo shown in emails. Public, loaded by mail clients and their image proxies. |
| `GET /v1/newsletter-images/:id.(jpg\|png)` | Images in newsletters. Public and cached for a year; emails already sent keep loading them, so keep the path reachable, and redirect it from the old host if `API_URL` changes. |
| `POST /v1/unsubscribe/:token` | One-click unsubscribe, posted by mail providers without cookies or an `Origin`. Rate-limited per address. |
| `POST /v1/email-events/:secret` | Bounce and spam reports from the mail provider, up to 1 MB. `404` unless `EMAIL_EVENTS_SECRET` is set and matches. |

Two Fastify settings matter for the proxy:

- `bodyLimit` is 5 MiB (5,242,880 bytes). No file bytes go through the API (uploads use presigned URLs), so this only bounds JSON bodies such as CSV product imports, which are sent as JSON. Set the proxy's body limit at least as high.
- `maxParamLength` is 5000 for path parameters, not query strings. tRPC query inputs travel in the query string; separately size and test the proxy request-line/header limits with representative queries.

CORS allows the origin of `APP_URL` only, with credentials. Any request other than `GET`, `HEAD` or `OPTIONS` that carries an `Origin` header other than the origin of `APP_URL` or of `API_URL` gets a `403`. The proxy must not add its own CORS headers.

## The session cookie must reach the API

The API signs users in with an HttpOnly cookie, `damvia_session`, set on the API's hostname with `Path=/` and `SameSite=Lax`, and marked `Secure` when `API_URL` is HTTPS. For the browser to send it:

- Serve the client and the API from the same site: one hostname, or two hostnames under one registrable domain (`dam.example.com` and `api.dam.example.com`). With the client on an unrelated domain, set `SESSION_COOKIE_SAMESITE=none` on the server; that needs HTTPS on both.
- Pass `Cookie` and `Set-Cookie` through unchanged. Do not strip, rewrite the domain or path of, or cache responses carrying `Set-Cookie`.
- Set `APP_URL` to the exact origin of the client, including the port if it is not the default.

## Forward the client address

Sign-in rate limits and the request log use the client address from `X-Forwarded-For`. The API trusts as many proxies as `TRUST_PROXY` says, 1 by default. The proxy in front of the API should **set** the header to the address it sees, not append to a value the client sent; otherwise a client can choose the address it is counted under. With two proxies in a row (for example a CDN and nginx), set `TRUST_PROXY=2` and let the outer one set the header.


## nginx, two hostnames

```nginx
server {
  listen 443 ssl;
  server_name api.dam.example.com;
  ssl_certificate /etc/letsencrypt/live/api.dam.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/api.dam.example.com/privkey.pem;
  client_max_body_size 10m;
  large_client_header_buffers 4 16k;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto https;
    proxy_read_timeout 300s;
  }
}
```

`proxy_read_timeout` is raised because a `download.create` with type `direct` builds the archive inside the request; a multi-gigabyte selection can take minutes. The client's static site is the server block in [Client build](./client-build.md).

Then `APP_URL=https://dam.example.com`, `API_URL=https://api.dam.example.com`, `VITE_API_ENDPOINT=https://api.dam.example.com/trpc`.

## Caddy, one hostname

```
dam.example.com {
  handle /trpc/* {
    reverse_proxy 127.0.0.1:3000
  }
  handle /v1/* {
    reverse_proxy 127.0.0.1:3000
  }
  handle {
    root * /srv/damvia/client/dist
    try_files {path} /index.html
    file_server
  }
}
```

Then `APP_URL=https://dam.example.com`, `API_URL=https://dam.example.com`, `VITE_API_ENDPOINT=https://dam.example.com/trpc`. Caddy's `reverse_proxy` sets `X-Forwarded-For` itself and ignores a client-supplied value unless `trusted_proxies` is configured.

## Exposing MinIO

Browsers load thumbnails, upload admin images and fetch archives from the S3 endpoint directly. With self-hosted MinIO, publish its API port on a hostname:

```
s3.dam.example.com {
  reverse_proxy 127.0.0.1:9000
}
```

and use it in both bucket URLs: `https://dam:...@s3.dam.example.com/dam` and `.../dam-assets`. Presigned URLs embed the host and scheme they were signed for, so the server must use the same public URL, not an internal `http://minio:9000`. The MinIO console (port 8090 in the dev compose) stays private.

Do not forward `/dam/` and `/dam-assets/` paths through the API hostname: the signature covers the host.

## Timeouts and sizes to raise

| Setting | Why |
|---|---|
| Proxy read timeout on `/trpc/download.create` | Direct downloads are built synchronously. |
| Proxy body size | Product CSV imports are sent as JSON in one request. |
| Upload size on the S3 proxy | Presigned PUT of the login background image and page images go through the S3 hostname, not the API. |

## The API sets its own security headers

Every API response carries `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`, `Strict-Transport-Security`, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff` and `Cross-Origin-Resource-Policy: same-site`. Do not add a second, conflicting copy of these at the proxy for the API hostname.

The API logs one `http.response` line per request with the method, the path without its query string (download ids masked), the status, the duration in milliseconds, the client address and the request id. `REQUEST_LOG=false` turns it off.

## Give the client its own Content Security Policy

The client is static files, so its headers come from whatever serves them. Add `Strict-Transport-Security` and a `Content-Security-Policy` there. A starting point, with `https://api.dam.example.com` as the API and `https://s3.dam.example.com` as the S3 endpoint:

```
default-src 'self';
connect-src 'self' https://api.dam.example.com https://s3.dam.example.com;
img-src 'self' data: https://s3.dam.example.com;
media-src 'self' https://s3.dam.example.com;
frame-src 'self' https://s3.dam.example.com;
style-src 'self' 'unsafe-inline';
frame-ancestors 'none';
base-uri 'self';
form-action 'self'
```

`connect-src` covers presigned uploads to S3 and `frame-src` the PDF previews. This policy blocks the Inter font that `index.html` loads from Google Fonts: add `https://fonts.googleapis.com` to `style-src` and `font-src https://fonts.gstatic.com`, or self-host the font. Test the policy in `Content-Security-Policy-Report-Only` mode with a reader, an editor and an admin session before enforcing it, and add any other host the browser console reports.

The nginx examples assume certificates already issued at the displayed paths. Replace the hostnames and certificate paths, validate the configuration before reloading, and arrange certificate renewal. They do not provision certificates.
