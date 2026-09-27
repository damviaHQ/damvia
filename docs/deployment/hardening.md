---
title: Hardening checklist
description: The steps that make a Damvia deployment secure in production, from TLS and secrets to backups and monitoring.
sidebar:
  order: 12
lastUpdated: 2026-09-27
---

Work through this list before a Damvia instance holds real files or people, and again after each upgrade. Each item links to the page that explains it. [Security architecture](./security.md) describes why.

## Network and TLS

- [ ] Serve the client, the API and the S3 endpoint over HTTPS only, with HTTP redirected. See [Reverse proxy](./reverse-proxy.md).
- [ ] Put the client and the API on the same site: one hostname, or sibling subdomains such as `dam.example.com` and `api.dam.example.com`. Keep `SESSION_COOKIE_SAMESITE=lax`.
- [ ] Set `APP_URL` to the exact client origin and `API_URL` to the exact API origin. CORS and the cross-site request check rely on them.
- [ ] Make the proxy overwrite `X-Forwarded-For` with the client address, and set `TRUST_PROXY` to the number of proxies in front of the API.
- [ ] Give the client's static files a Content-Security-Policy, starting from the one in [Reverse proxy](./reverse-proxy.md).
- [ ] Keep PostgreSQL, and the S3 endpoint's admin interface, off the public internet.

## Secrets

- [ ] Generate `APP_SECRET` randomly (`openssl rand -hex 32`), once per instance.
- [ ] Pass secrets as files (`APP_SECRET_FILE`, `SMTP_PASS_FILE`, `OIDC_CLIENT_SECRET_FILE`, the S3 URLs and the source credentials) from your secret store. Don't bake them into images or commit them.
- [ ] Give the S3 keys access to their two buckets only, and the cloud source credentials read-only access to the synced folders.

## Storage

- [ ] Turn on default server-side encryption for both buckets. The server warns at startup when it is off (`S3_ENCRYPTION_CHECK`). See [Object storage](../integrations/object-storage.md).
- [ ] Keep both buckets private, with CORS limited to `APP_URL` on the main bucket.
- [ ] Encrypt the database disk, or use a managed database with encryption at rest.

## Email

- [ ] Use an SMTP relay with `SMTP_REQUIRE_TLS=true` (or port 465), and SPF, DKIM and DMARC for the sender domain: sign-in links are credentials. See [SMTP](../integrations/smtp.md).

## Accounts

- [ ] Set `MFA_REQUIRED_ROLES=admin,manager` so administrators and managers use two-step verification. With single sign-on, enforce MFA at the identity provider.
- [ ] Keep `PASSWORD_BREACH_CHECK=true` unless the server has no internet access.
- [ ] Review `SESSION_IDLE_HOURS` and `SESSION_MAX_HOURS` against your policy.
- [ ] With single sign-on, set `OIDC_TRUST_EMAIL` only for a provider where users cannot choose their address, and consider `OIDC_ONLY=true`. See [Single sign-on](../integrations/single-sign-on.md).
- [ ] Keep the number of admins small. Check the access review export (Users > Export access review) every quarter, and suspend people who leave the same day.

## Logging and monitoring

- [ ] Collect the server logs centrally. Set `AUDIT_LOG_STREAM=true` so audit entries also leave the host.
- [ ] Alert on `security.configuration` warnings, bursts of `auth.sign_in_failed` and `auth.locked`, `access.denied`, `mfa.reset` and `audit.exported`. See [Audit log](../administration/audit-log.md).
- [ ] Choose `AUDIT_RETENTION_DAYS`, `ANALYTICS_RETENTION_DAYS` and `ANALYTICS_SEARCH_MODE` to match your retention policy. See [Privacy and personal data](../configuration/privacy.md).

## Host and container

- [ ] Run the published Dockerfile unmodified: it runs as the unprivileged `node` user. Make mounted secrets readable by uid 1000 only. See [Server with Docker](./server-docker.md).
- [ ] Apply operating system security updates automatically, and restrict SSH to keys and to administrators.
- [ ] Rebuild the image when Damvia or its base image publishes a security fix. Watch the repository's security advisories.

## Backups and upgrades

- [ ] Back up the database, both buckets and the configuration, encrypted, off the host. Rehearse a restore every quarter. See [Backups](./backups.md).
- [ ] Read [Upgrading](./upgrading.md) before each release. Migrations run at startup, so back up first.

## Privacy

- [ ] Set `PRIVACY_CONTROLLER` and `PRIVACY_CONTACT`, and edit the legal information page. See [Branding](../configuration/branding.md#legal-pages).
- [ ] Publish an accessibility statement if you provide the service to the public or to a public body. See [Client accessibility review](../reference/client-accessibility-review.md).
