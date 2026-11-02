---
title: Error tracking
description: Send server and browser errors to GlitchTip, a self-hosted Sentry or sentry.io, without personal data.
sidebar:
  order: 9
lastUpdated: 2026-11-02
---

Damvia can report unexpected errors to any service that accepts the Sentry protocol: [GlitchTip](https://glitchtip.com), which is open source, a self-hosted Sentry, or sentry.io. It uses the official Sentry SDKs, `@sentry/node` and `@sentry/vue`, which are MIT licensed. Error tracking is off by default. Without a DSN the server never loads the SDK, the client build does not contain it, and nothing is sent anywhere.

## Create two projects

Create one project for the server (platform Node.js) and one for the client (platform Vue or browser JavaScript), and copy the DSN of each. Two projects keep server and browser issues, alerts and source maps apart. Put both on the same tracker: the server passes the browser's reports on to its own tracker only, see [Reports pass through the API](#reports-pass-through-the-api).

A DSN has the form `https://<public key>@<tracker host>/<project id>`. It identifies a project; it is not a secret, as every browser that loads the client can read the client's.

## Server

Set in `server/.env`, then restart:

```bash
SENTRY_DSN=https://3f2a...@glitchtip.example.com/1
SENTRY_ENVIRONMENT=production
SENTRY_RELEASE=damvia@1.2.0
```

A DSN that does not parse stops the server at startup. `SENTRY_ENVIRONMENT` defaults to `NODE_ENV`. Give `SENTRY_RELEASE` the same value on the server and in the client build, so both sides of one version group together.

| What | Reported | Tags |
|---|---|---|
| tRPC procedures | Calls that answer `INTERNAL_SERVER_ERROR`. Validation, permission and not-found answers are expected and are not reported. | `procedure`, `request_id`, `role` |
| Other routes: downloads, single sign-on, email events | Answers with a 5xx status | `request_id` |
| Background jobs | Each failed attempt, before pg-boss retries it | `queue`, `job_id` |
| Cloud sync | A failed run of a source | `source`, `provider`, `log` |
| Server log | Every `logger.error` that carries an error, with its stack. The lines logged before it become its breadcrumbs. | `log` |
| Startup and the CLI | The error that stops the process, sent before it exits | |

When something fails, the message a user sees ends with a reference, such as `Something went wrong. Please try again (reference req-4f).` Search the server project for the tag `request_id:req-4f` to find the report.

Identical errors that follow each other are sent once, and the tracker groups the rest into issues. Stack traces point at the TypeScript sources without any upload: `npm start` runs Node with `--enable-source-maps`, and the build emits source maps next to the compiled files.

To check the setup, run this from the `server` folder, with the same `.env`:

```bash
node -e "const m = require('./dist/monitoring'); m.reportError(new Error('Damvia error tracking test')); m.flushMonitoring()"
```

The error shows in the server project within a minute.

## Client

The client's variables are read at build time, like `VITE_API_ENDPOINT`. Set them in `client/.env`, then rebuild:

```bash
VITE_SENTRY_DSN=https://7c1b...@glitchtip.example.com/2
VITE_SENTRY_ENVIRONMENT=production
VITE_SENTRY_RELEASE=damvia@1.2.0
```

The browser reports uncaught errors, unhandled promise rejections, errors in Vue components, and failed queries and mutations whose cause is not an answer from the API. It does not report tRPC errors: the server reports those it answered with an error, and a call that never reached the API is the network's. The SDK adds about 40 kB (gzip) to the client, 57 kB with tracing. A build without `VITE_SENTRY_DSN` does not contain it.

To check the setup, open the client, open the browser console and run `setTimeout(() => { throw new Error('Damvia browser test') })`. The error shows in the client project.

### Reports pass through the API

By default the client posts its reports to `API_URL/v1/monitoring`, and the server passes them on to the tracker. As a result:

- the client's Content Security Policy needs no new host;
- ad and tracker blockers leave the reports alone;
- the tracker never sees the address of the people using Damvia, only the server's.

The route exists only when `SENTRY_DSN` is set on the server, so the server must have its DSN for browser reports to arrive. It passes on only reports for a project of that same tracker (same scheme, host, port and path), at most 120 a minute from one address and 1 MB each. Anything else gets a `400` and goes nowhere.

`VITE_SENTRY_TUNNEL=false` sends the reports straight from the browser to the tracker. Add the tracker's origin to `connect-src` in the client's policy then; see [Reverse proxy](../deployment/reverse-proxy.md#give-the-client-its-own-content-security-policy).

### Source maps

Without source maps, browser stack traces point at the minified bundle. To upload them when the client is built, set these variables in the build environment, such as a CI secret, or in `client/.env`:

```bash
SENTRY_AUTH_TOKEN=...
SENTRY_URL=https://glitchtip.example.com
SENTRY_ORG=my-organisation
SENTRY_PROJECT=damvia-client
```

`SENTRY_URL` is the address of your tracker; leave it unset for sentry.io. With a token, `npm run build` emits source maps, marks each bundle with a debug ID, uploads the maps and deletes the `.map` files from `dist/`, so they are never served. These variables have no `VITE_` prefix: they stay out of the bundle. A failed upload is logged and does not fail the build. The plugin's own usage reporting to Sentry is turned off.

If stack traces still show minified names after a build, read the upload lines of the build log, and check that your tracker's version accepts uploads by debug ID.

## Tracing

Performance tracing is off by default. `SENTRY_TRACES_SAMPLE_RATE` on the server and `VITE_SENTRY_TRACES_SAMPLE_RATE` in the client build turn it on, as the share of requests and page loads to trace, from `0` to `1`. Start low, such as `0.05`: every traced request is one more message to the tracker.

With both set, a page load and the API calls it makes form one trace: the browser adds the trace headers to calls to the API, and to no other host. Server transactions are named after the procedure (`trpc user.me`) or the route. They are sent as whole transactions: version 11 of the SDK streams spans by default, which GlitchTip does not read.

## What is sent, and what is not

| Sent | Never sent |
|---|---|
| Error type, message and stack, with the lines of source code around each frame | Request bodies: passwords, form contents, tRPC inputs |
| Method and path of the request, with the secret part of `/v1/downloads/`, `/v1/unsubscribe/` and `/v1/email-events/` masked | Query strings: sign-in codes, invitation tokens, signatures of presigned links |
| The account id and its role | Name, email address, IP address. An email address in a message becomes `[email]`. |
| The browser's user agent | Cookies and other headers |
| The log lines and navigation before the error, without query strings or addresses | Local variables, Vue component props |
| Environment, release, operating system and runtime versions | Session counts and replays |

The [privacy page](../configuration/privacy.md#the-privacy-page) says that error reports are sent when either side has a DSN. Your tracker is a processor of these reports: add it to your record of processing, and set its retention to what you need to fix errors.

Session replay and profiling are not set up: GlitchTip does not support them, and a replay would record the library's files and the people browsing them.
