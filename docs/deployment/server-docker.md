---
title: Server with Docker
description: Build the server image from the repository's Dockerfile and run it with the worker enabled.
sidebar:
  order: 2
lastUpdated: 2026-09-15
---

`server/Dockerfile` produces a self-contained image with Node 20, the media tools, the compiled server and the sources (the CLI still runs from TypeScript). It is the only deployment artefact in the repository.

## What the image contains

```dockerfile
FROM node:20
WORKDIR /app
RUN apt-get update
RUN apt-get install -y ffmpeg ghostscript libreoffice coreutils imagemagick
COPY package.json .
COPY package-lock.json .
RUN npm install
COPY . .
RUN npm run build
CMD ["npm", "start"]
```

- `npm run build` runs `tsc` with `NODE_ENV=production` and writes `dist/`.
- `npm start` runs `node dist/index.js` with `NODE_ENV=production`.
- LibreOffice makes the image large (around 2 GB). It is needed for office document previews; removing it from the `apt-get` line only loses those previews.
- `mailconfig.json` is copied with the sources, so the file fallback works inside the container when `MAILCONFIG` is unset.

## Build

From the `server/` folder:

```bash
docker build -t damvia-server:latest .
```

`npm install` installs dev dependencies too (the build needs `typescript`); the image is not slimmed. Add a `.dockerignore` with `node_modules`, `dist` and `.env` to keep the build context small and to avoid copying a local `.env` into the image.

## Run

Pass the configuration as environment variables, never bake `.env` into the image:

```bash
docker run -d --name damvia-server \
  --env-file /srv/damvia/server.env \
  -e ENABLE_WORKER=true \
  -p 3000:3000 \
  damvia-server:latest
```

`ENABLE_WORKER=true` is required on exactly one container: `npm start` does not set it, unlike `npm run dev`. Without it no email is sent and no file is downloaded. See [Worker and scaling](./worker-and-scaling.md).

The complete variable list is in [Environment variables](../reference/environment-variables.md). Inside a Docker network, `DATABASE_URL`, `SMTP_HOST` and the S3 URLs use the service names (`postgres`, `minio`) rather than `localhost`; the S3 URLs must nonetheless be reachable from browsers, see [Reverse proxy](./reverse-proxy.md).

## Startup sequence and health

On start the process:

1. Initialises the cloud storage driver (for Dropbox, refreshes the token). Failure exits with code 1.
2. Connects to Postgres and runs pending migrations.
3. Listens on `0.0.0.0:${PORT}` (default 3000).
4. Starts the worker if `ENABLE_WORKER=true`.
5. Logs `server listening`.

There is no dedicated health endpoint. `GET /trpc/env` returns a JSON body with the app name and regions and needs no authentication, which makes it a usable readiness check:

```bash
curl -fsS http://localhost:3000/trpc/env
```

## Temp space

File contents are downloaded to the system temp directory before upload, download archives are assembled there, and LibreOffice and ffmpeg write intermediate files there. Mount a volume or tmpfs on `/tmp` sized for your largest asset plus a 10 GB archive.

## Logs

Winston writes to stdout in the format `timestamp level: message {json}`. Use `docker logs` or your platform's collector; there is no log file.

## docker-compose for production

The repository's `server/docker-compose.yml` is the development stack (Postgres, MailHog, MinIO) and does not include the server. A production compose file adds the server service built from `server/`, replaces MailHog with real SMTP settings, and puts the proxy in front. Keep the named volumes for Postgres and MinIO on persistent storage.
