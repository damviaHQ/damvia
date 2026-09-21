---
title: Server with Docker
description: Build the server image from the repository's Dockerfile and run it with the worker enabled.
sidebar:
  order: 2
lastUpdated: 2026-09-20
---

`server/Dockerfile` builds on Node 22 (Debian Bookworm; the server needs 22.12 or newer) and includes the media tools, compiled server and sources. The CLI still runs from TypeScript. See [Validation status](../reference/validation-status.md) for completed checks.

## What the image contains

```dockerfile
FROM node:22-bookworm
WORKDIR /app
RUN echo 'deb http://deb.debian.org/debian bookworm-backports main' > /etc/apt/sources.list.d/backports.list
RUN apt-get update
RUN apt-get install -y ffmpeg ghostscript libreoffice coreutils imagemagick
RUN apt-get install -y -t bookworm-backports libheif1
COPY package.json .
COPY package-lock.json .
RUN npm ci
COPY . .
RUN npm run build
CMD ["npm", "start"]
```

- `npm run build` runs `tsc` with `NODE_ENV=production` and writes `dist/`.
- `npm start` runs `node dist/index.js` with `NODE_ENV=production`.
- `libheif1` comes from `bookworm-backports`: HEIC thumbnails go through ImageMagick, and the libheif in bookworm itself refuses the files iPhones produce. Drop the backport and HEIC pictures get no thumbnail.
- LibreOffice increases image size; measure the built image for your architecture. It is needed for office document previews; removing it from the `apt-get` line only loses those previews.
- `mailconfig.json` is copied with the sources, so the file fallback works inside the container when `MAILCONFIG` is unset.

## Build

From the `server/` folder:

```bash
docker build -t damvia-server:latest .
```

`npm ci` installs the locked dependencies, including dev dependencies (the build needs `typescript`); the image is not slimmed. The checked-in `server/.dockerignore` excludes `node_modules`, `dist` and `.env` files before the build copies sources.

## Run

Pass the configuration as environment variables, never bake `.env` into the image:

```bash
docker run -d --name damvia-server \
  --restart unless-stopped \
  --env-file /srv/damvia/server.env \
  -e ENABLE_WORKER=true \
  -p 127.0.0.1:3000:3000 \
  damvia-server:latest
```

Run one server container with `ENABLE_WORKER=true`: `npm start` does not set it, unlike `npm run dev`. Without it the process can publish jobs but does not process them or register scheduled jobs. See [Worker and scaling](./worker-and-scaling.md).

The complete variable list is in [Environment variables](../reference/environment-variables.md). Inside a Docker network, `DATABASE_URL` and an internal `SMTP_HOST` use service names rather than `localhost`. S3 URLs must use an endpoint reachable both from the container and browsers, see [Reverse proxy](./reverse-proxy.md).

## Startup sequence and health

The server first initialises the database and migrations, validates stored source keys, and registers the configured sources. It then starts source initialisation, creates the queues and worker schedules, and opens the HTTP port. Source initialisation is asynchronous, so the first source run can overlap queue startup.

Treat `server listening` as an API/database check. Readiness also requires one recent `assets updated successfully` message per source, processing jobs that leave the queue, reachable S3 objects and a controlled email delivery.

There is no dedicated health endpoint. `GET /trpc/env` returns a JSON body with the app name and regions and needs no authentication, which checks API/database access only. It does not certify worker, SMTP, S3 or cloud sync readiness:

```bash
curl -fsS http://localhost:3000/trpc/env
```

## Temp space

File contents are downloaded to the system temp directory before upload, download archives are assembled there, and LibreOffice and ffmpeg write intermediate files there. Size `/tmp` for concurrent source downloads, conversion outputs and the completed archive together. Ten asset jobs and up to 25 files within an archive can run concurrently. A tmpfs consumes memory; measure representative workloads before selecting it. Directories named `dam-asset*` left by a crash are removed at the next start when older than 6 hours.

## Logs

Winston writes to stdout in the format `timestamp level: message {json}`. Use `docker logs` or your platform's collector; there is no log file.

## docker-compose for production

The repository's `server/docker-compose.yml` is the development stack (Postgres, MailHog, MinIO) and does not include the server. A production compose file adds the server service built from `server/`, replaces MailHog with real SMTP settings, and puts the proxy in front. Keep the named volumes for Postgres and MinIO on persistent storage.

For `docker run --env-file`, keep literal `KEY=value` entries without shell quotes or trailing comments. Start from the corrected server template, replace all localhost service addresses, and keep the file outside the image. [Docker documents this environment-file format](https://docs.docker.com/reference/cli/docker/container/run/#env).
