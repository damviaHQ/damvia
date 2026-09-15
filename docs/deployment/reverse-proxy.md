---
title: Reverse proxy
description: Put HTTPS in front of the API and the client, and expose the S3 endpoint browsers must reach.
sidebar:
  order: 4
lastUpdated: 2026-09-15
---

The server speaks plain HTTP on one port and expects a proxy to terminate TLS. Three hostnames are involved: the client (`APP_URL`), the API (`API_URL`) and the S3 endpoint from the bucket URLs, and all three must be reachable by browsers.

## What the API exposes

| Path | Purpose |
|---|---|
| `/trpc/*` | Every application call, `GET` for queries and `POST` for mutations. Auth is the `authorization` header. |
| `/v1/downloads/:id` | Redirects to a presigned S3 URL for a ready download, or to `APP_URL/link-expired`. Linked from the client and from emails. |

Two Fastify settings matter for the proxy:

- `bodyLimit` is 5 MB. No file bytes go through the API (uploads use presigned URLs), so this only bounds JSON bodies such as CSV product imports, which are sent as JSON. Set the proxy's body limit at least as high.
- `maxParamLength` is 5000, because tRPC encodes query inputs in the URL. Keep the proxy's URL length limit above 8 KB.

CORS is registered with `@fastify/cors` and no options, meaning any origin is allowed. The proxy does not need to add CORS headers and should not restrict them unless you want to lock the API to `APP_URL`, which you can do at the proxy level.

## nginx, two hostnames

```nginx
server {
  listen 443 ssl;
  server_name api.dam.example.com;
  client_max_body_size 10m;
  large_client_header_buffers 4 16k;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
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

Then `APP_URL=https://dam.example.com`, `API_URL=https://dam.example.com`, `VITE_API_ENDPOINT=https://dam.example.com/trpc`.

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

## Security headers

The API sets none. Add `Strict-Transport-Security` and the usual headers at the proxy. If you add a `Content-Security-Policy` to the client, allow `connect-src` to the API and `img-src` and `media-src` to the S3 hostname, plus `fonts.googleapis.com` and `fonts.gstatic.com` for Inter.
