---
title: Object storage
description: The two S3 buckets Damvia writes to, the URL syntax that configures them, and what browsers need to reach.
sidebar:
  order: 6
lastUpdated: 2026-09-19
---

Damvia keeps its own copy of every asset in S3-compatible object storage, next to the previews it generates and the archives users download. It uses the MinIO client library and the S3 API. MinIO is the development configuration; other providers require validation of endpoint addressing, signatures, CORS and the operations below. API compatibility alone is not a tested support guarantee.

## Two buckets, two lifecycles

| Bucket | Variable | Contains | Can be rebuilt? |
|---|---|---|---|
| Main | `MAIN_S3_URL` | Collection thumbnails, page images/videos, the login background (`settings/auth-background.webp`), client logo (`settings/client-logo.webp`) | No. These are uploaded by admins. Back it up. |
| Assets | `ASSETS_S3_URL` | Asset originals at `asset-file/{id}`, their WebP thumbnails, download archives at `downloads/{id}` | Originals and generated previews, while sources remain available. Download archives are not recreated. See [Integrity check](../deployment/integrity-check.md). |

The two variables may point to the same server with different bucket names, which is the usual setup. Damvia does not create buckets; create both before the first start.

## The URL syntax

```
scheme://ACCESS_KEY:SECRET_KEY@host[:port]/bucket
```

| Part | Meaning |
|---|---|
| `scheme` | `https` enables TLS (`useSSL`), `http` disables it. |
| `ACCESS_KEY:SECRET_KEY` | Credentials. The current code does not decode URL username/password escapes; credentials needing percent-encoding are not supported reliably. Use URL-safe credentials until the parser is corrected. |
| `host[:port]` | The S3 endpoint. Port defaults to 443 for `https` and 80 for `http`. |
| `/bucket` | The bucket name, nothing after it. |

Examples:

```bash
# Development MinIO from docker-compose
MAIN_S3_URL=http://dam:damdamdamdam@localhost:9000/dam
ASSETS_S3_URL=http://dam:damdamdamdam@localhost:9000/dam-assets

# AWS S3 (path-style endpoint)
MAIN_S3_URL=https://AKIA...:SECRET@s3.eu-west-3.amazonaws.com/acme-dam-main
ASSETS_S3_URL=https://AKIA...:SECRET@s3.eu-west-3.amazonaws.com/acme-dam-assets
```

No region variable exists; the MinIO client derives what it needs from the endpoint. For AWS, use the regional endpoint of the buckets' region.

## Browsers talk to the bucket directly

Damvia never proxies file bytes through the API:

- Thumbnails and previews are served to the browser through presigned GET URLs.
- Admin uploads (collection thumbnails, page images, the login background) go to presigned PUT URLs valid 24 hours.
- Client logos use a ten-minute presigned POST policy with a 5 MB limit, followed by server-side validation and WebP conversion. Temporary upload keys are caller-scoped and never used for display.
- Downloads redirect from `API_URL/v1/downloads/{id}` to a presigned GET URL of the archive; the `download-ready` email carries such a URL directly.

Therefore the endpoint hostname in both URLs must be resolvable and reachable **from users' browsers**, over HTTPS in production, and the bucket must allow the presigned requests. With MinIO behind a reverse proxy, forward the S3 API port (9000 by default) on a public hostname and use that hostname in the URLs; the server can use the same hostname.

CORS is needed for presigned PUT uploads and any cross-origin fetch/XHR reads (the browser performs a cross-origin PUT). Allow `PUT`, `POST` and `GET` from `APP_URL`'s origin on the main bucket. Presigned GET links opened as navigations or `<img>` sources do not need CORS.

## Bucket policy

Keep both buckets private. Everything is accessed with presigned URLs signed by the server's credentials, so no public-read policy is required. The credentials need list, get, put and delete on both buckets: the integrity check lists `asset-file/`, deletions remove objects, and every job writes.

## Storage size

The assets bucket holds every original once plus one WebP thumbnail per file, plus download archives for at most 7 days. Include original sizes, previews and all archives retained concurrently; repeated exports can exceed the size of the source library.

## MinIO versus AWS

| | MinIO | AWS S3 |
|---|---|---|
| Setup | One container, `docker-compose.yml` has it | Two buckets, an IAM user with a scoped policy |
| Public reachability | You expose port 9000 through your proxy | Already public; use the regional endpoint |
| Backups | Back up the `minio` volume (main bucket at least) | Versioning or replication on the main bucket |
| Cost | Your disk | Per GB stored and transferred; presigned downloads count as egress |

## Main-bucket CORS example

For an AWS S3 CORS configuration, replace the example origin with the exact `APP_URL` origin:

```json
[
  {
    "AllowedOrigins": ["https://dam.example.com"],
    "AllowedMethods": ["GET", "HEAD", "PUT"],
    "AllowedHeaders": ["Content-Type", "x-amz-*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Use the equivalent CORS setting supported by your storage service; its configuration format may differ. Validate an OPTIONS preflight with `Access-Control-Request-Method: PUT` and `Access-Control-Request-Headers: content-type`, then an actual browser upload. Do not add OPTIONS to S3's allowed-method list. CORS does not make a private bucket public and does not replace signed authorisation.

The CORS example follows the [AWS S3 CORS element reference](https://docs.aws.amazon.com/AmazonS3/latest/userguide/ManageCorsUsing.html); validate the equivalent settings on another provider.
