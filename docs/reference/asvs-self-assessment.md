---
title: ASVS self-assessment
description: How the Damvia server and client measure against every level 2 requirement of the OWASP Application Security Verification Standard 4.0.3, with evidence and known gaps.
sidebar:
  order: 11
lastUpdated: 2026-09-27
---

This page maps Damvia to every level 2 requirement of the [OWASP Application Security Verification Standard](https://owasp.org/www-project-application-security-verification-standard/) (ASVS) 4.0.3. Use it to judge whether the software fits your security requirements and which controls you must provide yourself. [Security architecture](../deployment/security.md) describes the design that the evidence below refers to.

ASVS level 2 is the level recommended for applications that hold personal or business data. It has 14 chapters, V1 to V14, each a list of verifiable requirements.

:::caution
This is a self-assessment written by reading the source code and the automated tests on 2026-09-27. It is not a penetration test or an independent audit. A "Met" verdict means the code does what the requirement asks; it does not prove the absence of bugs.
:::

## How to read and re-run it

- **Met**: the software does what the requirement asks.
- **Partial**: part of it is done, or it depends on a setting that is off by default. The evidence says which part is missing.
- **Not met**: the software does not do it.
- **N/A**: the requirement concerns a feature Damvia does not have. The reason is given.

Several requirements are fulfilled by the deployment rather than the code: TLS termination, disk encryption, host clocks, firewalls, log shipping. They are marked N/A or Partial with the operator's part named; [Hardening checklist](../deployment/hardening.md) lists what to do.

To re-run the assessment for a new release, walk each table and check that the named file and symbol still behave as described, then run the tests cited as evidence:

```bash
cd server
SECURITY_TEST_DATABASE_URL=postgresql://dam:dam@localhost/dam_test npm test
npm audit --omit=dev
```

Update a verdict when its evidence changes, recount the summary table, and set `lastUpdated`.

## Summary by chapter

"Applicable" counts every level 2 requirement that is not N/A.

| Chapter | Applicable | Met | Partial | Not met | N/A |
|---|---|---|---|---|---|
| V1 Architecture, design and threat modelling | 38 | 23 | 15 | 0 | 0 |
| V2 Authentication | 45 | 29 | 10 | 6 | 7 |
| V3 Session management | 17 | 15 | 1 | 1 | 1 |
| V4 Access control | 9 | 7 | 2 | 0 | 0 |
| V5 Validation, sanitisation and encoding | 28 | 26 | 2 | 0 | 2 |
| V6 Stored cryptography | 11 | 8 | 2 | 1 | 2 |
| V7 Error handling and logging | 11 | 8 | 3 | 0 | 1 |
| V8 Data protection and privacy | 15 | 11 | 2 | 2 | 0 |
| V9 Communication | 6 | 3 | 2 | 1 | 2 |
| V10 Malicious code | 3 | 1 | 2 | 0 | 2 |
| V11 Business logic | 8 | 4 | 3 | 1 | 0 |
| V12 Files and resources | 13 | 9 | 3 | 1 | 2 |
| V13 API and web service | 8 | 6 | 2 | 0 | 5 |
| V14 Configuration | 22 | 14 | 7 | 1 | 1 |
| **Total** | **234** | **164** | **56** | **14** | **25** |

## V1 Architecture, design and threat modelling

| ID | Requirement | Status | Evidence |
|---|---|---|---|
| 1.1.1 | A secure development lifecycle is followed | Partial | CI tests, CodeQL, `npm audit` gate and `SECURITY.md`; no written SDLC policy |
| 1.1.2 | Threat modelling is done for design changes | Partial | Trust boundaries in [Security architecture](../deployment/security.md); no formal threat model |
| 1.1.3 | User stories carry security constraints | Partial | Security behaviour is stated as tests (`server/test/auth.cjs`, `security.cjs`), not as stories |
| 1.1.4 | Trust boundaries, components and data flows are documented | Met | "Components and trust boundaries" in [Security architecture](../deployment/security.md) |
| 1.1.5 | The high-level architecture is defined and analysed | Met | [Architecture](../contributing/architecture.md) |
| 1.1.6 | Security controls are centralised and reusable | Met | `authMiddleware` in `server/src/trpc/index.ts`, `recordAudit()`, `sanitizeBlockHtml()`, access queries in `services/collection.ts` |
| 1.1.7 | A secure coding checklist is available to developers | Partial | Contributing pages describe the contracts; no dedicated checklist |
| 1.2.1 | Components run under unique, low-privilege OS accounts | Partial | Docker image runs as `node`; API, worker and file converters share that account |
| 1.2.2 | Communication between components is authenticated | Met | Postgres password, S3 access keys, SMTP credentials |
| 1.2.3 | One vetted authentication mechanism is used | Met | Every sign-in method ends in `completeSignIn()` / `createSession()` (`services/sign-in.ts`, `services/session.ts`) |
| 1.2.4 | All authentication pathways have the same strength | Partial | SSO sessions skip Damvia's MFA; email links are a primary factor; guests use invitation links |
| 1.4.1 | Access control is enforced at trusted points | Met | Every procedure checks the caller on the server (`server/test/auth-invariants.cjs`) |
| 1.4.4 | One well-vetted access control mechanism is used | Met | `authMiddleware` plus `userCollectionsQuery` / `userCollectionFilesQuery` (`server/test/access.cjs`) |
| 1.4.5 | Access control is attribute or feature based | Met | Role, approval, region, group, invitation, licence and collection restrictions |
| 1.5.1 | Input and output handling requirements are defined | Met | A zod schema on every procedure input |
| 1.5.2 | Serialisation is not used with untrusted clients | Met | JSON only; no object deserialisation |
| 1.5.3 | Input validation is enforced on the server | Met | zod validation in each tRPC procedure |
| 1.5.4 | Output encoding happens near its interpreter | Met | Vue template escaping; HTML sanitised on the server; parameterised SQL |
| 1.6.1 | There is a cryptographic key management policy | Partial | `APP_SECRET` documented in [Environment variables](./environment-variables.md); no written rotation policy |
| 1.6.2 | Key material is protected (vault or API) | Partial | `APP_SECRET_FILE` reads secrets from mounted files; no vault integration |
| 1.6.3 | Keys and passwords can be replaced | Partial | Changing `APP_SECRET` makes enrolled TOTP secrets unreadable; no re-encryption tool |
| 1.6.4 | Client-side secrets are treated as insecure | Met | The client holds no secret; all keys are server side |
| 1.7.1 | A common logging format is used | Met | Winston logger in `server/src/env.ts`, one format for API and worker |
| 1.7.2 | Logs are transmitted securely to a remote system | Partial | Logs go to stdout; shipping them is the operator's (`AUDIT_LOG_STREAM`) |
| 1.8.1 | Sensitive data is identified and classified | Met | [Privacy and personal data](../configuration/privacy.md) |
| 1.8.2 | Protection levels are defined for each class | Partial | Protections described per item, no formal levels |
| 1.9.1 | Communications between components are encrypted | Partial | S3 and SMTP TLS optional with a startup warning; Postgres TLS depends on `DATABASE_URL` |
| 1.9.2 | Each side of a component link is authenticated | Partial | TLS certificates verified when TLS is used; plain connections allowed |
| 1.10.1 | Source code control with access control and history | Met | Git on GitHub, pull requests |
| 1.11.1 | Modules and their security functions are documented | Met | [Architecture](../contributing/architecture.md) service list |
| 1.11.2 | High-value flows are thread safe | Met | Atomic token consumption, advisory locks; concurrency tests in `server/test/security.cjs` |
| 1.12.2 | User-uploaded files are served safely | Met | Uploads re-encoded and served from the private bucket through signed URLs, not the app origin |
| 1.14.1 | Components of differing trust are segregated | Met | Private database and buckets; browser reaches objects only through signed URLs |
| 1.14.2 | Binary signatures and trusted sources are verified | Partial | Actions pinned to commit SHAs, npm lockfiles; Docker base image not pinned by digest |
| 1.14.3 | The build warns on outdated components | Met | Dependabot and `npm audit --audit-level=high` in `.github/workflows/ci.yml` |
| 1.14.4 | The build verifies a secure deployment | Partial | CI builds and tests; deployment verification is manual ([Acceptance checklist](../deployment/acceptance-checklist.md)) |
| 1.14.5 | Deployments are sandboxed or containerised | Met | `server/Dockerfile`, unprivileged user |
| 1.14.6 | No unsupported client-side technologies | Met | Vue 3 single-page app; no plugins |

## V2 Authentication

| ID | Requirement | Status | Evidence |
|---|---|---|---|
| 2.1.1 | Passwords have at least 12 characters | Met | `PASSWORD_MIN_LENGTH` in `services/password-policy.ts` (`server/test/auth.cjs`) |
| 2.1.2 | Passwords of 64 characters are allowed, at most 128 | Met | `PASSWORD_MAX_LENGTH` = 128 |
| 2.1.3 | Passwords are not truncated | Met | Full string hashed by `hashPassword()` |
| 2.1.4 | Any printable Unicode character is allowed | Met | No character rule in `newPasswordSchema` |
| 2.1.5 | Users can change their password | Partial | Only through the emailed reset link; no in-session change form |
| 2.1.6 | Changing a password requires the current one | Partial | No in-session change; the reset link proves control of the mailbox instead |
| 2.1.7 | New passwords are checked against breached lists | Met | `passwordIsBreached()` (Have I Been Pwned range API), `PASSWORD_BREACH_CHECK`; fails open when unreachable |
| 2.1.8 | A password strength meter is shown | Not met | The client shows no meter |
| 2.1.9 | No composition rules | Met | Length, not-the-email and breach checks only |
| 2.1.10 | No periodic rotation or history requirement | Met | None implemented |
| 2.1.11 | Paste and password managers are allowed | Met | Standard inputs with `autocomplete` attributes in `client/src/views/auth/` |
| 2.1.12 | The user can reveal the masked password | Not met | No show-password control |
| 2.2.1 | Anti-automation against guessing | Partial | Lockout after 5 failures stored in the database; per-IP and per-address limits kept in process memory (`services/rate-limit.ts`) |
| 2.2.2 | Weak authenticators (email, SMS) are not a primary factor | Partial | Email sign-in links are a primary factor (on request or with `ENABLE_PASSWORD_LESS_AUTH`); MFA still applies |
| 2.2.3 | The user is notified after changes to authentication details | Not met | No email on password reset, MFA change or new sign-in; entries only in the audit log |
| 2.3.1 | System-generated activation secrets are random and expire | Met | 256-bit login tokens, 15 minutes or 7 days; reset tokens 1 hour (`services/login-token.ts`, `services/mailer.ts`) |
| 2.3.2 | Users can enrol their own authenticator devices | Met | TOTP enrolment in `auth.mfaSetup` / `auth.mfaEnable` |
| 2.3.3 | Renewal instructions are sent for expiring authenticators | N/A | No time-bound authenticators |
| 2.4.1 | Passwords use an approved salted one-way function | Met | scrypt in `services/credentials.ts` (`server/test/credentials.cjs`, `security.cjs`) |
| 2.4.2 | The salt is at least 32 bits and unique | Met | 128-bit random salt per hash |
| 2.4.3 | PBKDF2 iteration count | N/A | scrypt is used |
| 2.4.4 | bcrypt work factor | N/A | scrypt is used (N = 131072, r = 8, p = 1) |
| 2.4.5 | An extra derivation with a secret salt (pepper) | Not met | No pepper |
| 2.5.1 | Recovery secrets are not sent in clear text | Met | Reset link carries a random token stored hashed; no password is ever emailed |
| 2.5.2 | No password hints or knowledge-based questions | Met | None exist |
| 2.5.3 | Recovery does not reveal the current password | Met | Reset sets a new password (`user.resetPassword`) |
| 2.5.4 | No shared or default accounts | Met | No seeded account; the first admin is a promoted sign-up ([First admin](../getting-started/first-admin.md)) |
| 2.5.5 | The user is notified when a factor changes | Not met | No notification email; audit entries `password.reset`, `mfa.enabled`, `mfa.disabled`, `mfa.reset` |
| 2.5.6 | Forgotten-password recovery is secure | Met | Single-use, hashed, 1-hour token; ends every session (`server/test/security.cjs`) |
| 2.5.7 | Lost MFA requires identity proofing | Met | Recovery codes, or an administrator reset (`user.resetMfa`) that ends all sessions |
| 2.6.1 | Lookup secrets are single use | Met | Recovery codes removed atomically on use (`server/test/auth.cjs`) |
| 2.6.2 | Lookup secrets have 112 bits, or are salted and hashed | Not met | Recovery codes have 40 bits and are hashed with unsalted SHA-256 |
| 2.6.3 | Lookup secrets resist offline attacks | Partial | Random, stored hashed; low entropy offsets that (see 2.6.2) |
| 2.7.1 | Clear-text SMS or phone codes are not offered by default | Met | No SMS or phone factor |
| 2.7.2 | Out-of-band codes expire after 10 minutes | Partial | Email sign-in links last 15 minutes |
| 2.7.3 | Out-of-band codes are single use | Met | `consumeLoginToken()` marks the token used in the same statement |
| 2.7.4 | The out-of-band channel is secure and independent | Partial | Email; TLS to the relay only with `SMTP_REQUIRE_TLS=true` or port 465 |
| 2.7.5 | The verifier keeps only a hash of the code | Met | `login_tokens.token_hash` (SHA-256) |
| 2.7.6 | Out-of-band codes come from a CSPRNG with 20+ bits | Met | `randomBytes(32)` |
| 2.8.1 | Time-based OTPs have a defined lifetime | Met | 30-second step, one step of drift (`verifyTotp()` in `services/mfa.ts`) |
| 2.8.2 | OTP seeds are protected | Met | AES-256-GCM, key derived from `APP_SECRET` with HKDF (`server/test/auth.cjs`) |
| 2.8.3 | Approved algorithms generate OTPs | Met | RFC 6238 TOTP (HMAC-SHA1, 6 digits) via `otpauth` |
| 2.8.4 | A TOTP is used only once | Met | `mfa_last_step` refuses an earlier or equal step (`server/test/auth.cjs`) |
| 2.8.5 | A reused TOTP is logged and the user notified | Partial | Recorded as `auth.mfa_failed`, not distinguished as a replay; no notification |
| 2.8.6 | Physical OTP generators can be revoked | N/A | No hardware tokens; an administrator can reset TOTP |
| 2.9.1 | Cryptographic authenticator keys are stored securely | N/A | No cryptographic authenticators (WebAuthn, smart cards) |
| 2.9.2 | Challenge nonces are at least 64 bits | N/A | Same reason |
| 2.9.3 | Approved algorithms for cryptographic authenticators | N/A | Same reason |
| 2.10.1 | Service secrets do not rely on unchanging credentials | Partial | Postgres, S3 and SMTP use static credentials from the environment |
| 2.10.2 | Service accounts do not use default credentials | Partial | `DATABASE_URL` falls back to the development `dam:dam` when unset |
| 2.10.3 | Service passwords are stored with sufficient protection | Met | Environment or `*_FILE` secrets, never in the database |
| 2.10.4 | Secrets are not in source code | Met | `APP_SECRET` validated at startup, rejects the old default (`validateAppSecret()`) |

## V3 Session management

| ID | Requirement | Status | Evidence |
|---|---|---|---|
| 3.1.1 | Session tokens never appear in URLs | Met | Cookie only; email and invitation links are exchanged by POST for a cookie |
| 3.2.1 | A new session token is issued at authentication | Met | `createSession()` creates a fresh random token each sign-in |
| 3.2.2 | Session tokens have at least 64 bits of entropy | Met | 256 bits (`randomBytes(32)`) |
| 3.2.3 | Tokens are stored in the browser securely | Met | HttpOnly cookie; nothing in `localStorage` (`server/test/auth.cjs`) |
| 3.2.4 | Tokens use approved cryptography | Met | CSPRNG token, SHA-256 hash stored |
| 3.3.1 | Logout and expiry invalidate the session | Met | `destroySession()` deletes the row (`server/test/auth.cjs`) |
| 3.3.2 | Re-authentication after idle or absolute time | Met | `SESSION_IDLE_HOURS` (12) and `SESSION_MAX_HOURS` (720) |
| 3.3.3 | Other sessions can be ended after a credential change | Met | Password reset ends all sessions; MFA enrolment ends the others |
| 3.3.4 | Users can view and end their active sessions | Met | `auth.sessions`, `auth.revokeSession`, `auth.revokeOtherSessions` |
| 3.4.1 | Cookies have the `Secure` attribute | Met | Set when `APP_URL`/`API_URL` are HTTPS, or `SameSite=None`; startup warning otherwise |
| 3.4.2 | Cookies have the `HttpOnly` attribute | Met | `cookieOptions()` in `services/session.ts` |
| 3.4.3 | Cookies have the `SameSite` attribute | Met | `Lax` by default, `None` configurable (`SESSION_COOKIE_SAMESITE`) |
| 3.4.4 | Cookies use the `__Host-` prefix | Not met | Cookie is named `damvia_session` |
| 3.4.5 | Cookies use the most precise path | Met | `path=/` on the API origin, which serves only the API |
| 3.5.1 | Users can revoke OAuth tokens of linked apps | N/A | Damvia issues no OAuth tokens to third parties |
| 3.5.2 | Session tokens are used rather than static API keys | Met | No API keys; legacy JWTs are traded once for a session (`server/test/auth.cjs`) |
| 3.5.3 | Stateless tokens are signed and checked | Met | MFA challenge and SSO state are HS256 JWTs with purpose and expiry (`services/sign-in.ts`, `services/oidc.ts`) |
| 3.7.1 | Re-authentication or a valid session before sensitive actions | Partial | MFA disable and recovery code renewal ask for a TOTP or recovery code; account deletion, MFA enrolment, session revocation and an administrator's own email change ask for nothing more |

## V4 Access control

| ID | Requirement | Status | Evidence |
|---|---|---|---|
| 4.1.1 | Access control is enforced on a trusted service layer | Met | Server-side checks on every procedure (`server/test/auth-invariants.cjs`) |
| 4.1.2 | Users cannot manipulate access attributes | Met | Role, region, approval come from the database session, never from input |
| 4.1.3 | Least privilege applies | Met | Managers limited to their region and non-elevated accounts (`managedUser()`, `server/test/security.cjs`) |
| 4.1.5 | Access control fails securely | Met | Middleware throws on missing session or failed predicate; queries return nothing on no match |
| 4.2.1 | Protection against insecure direct object references | Met | Collections and files resolved through the viewer's access queries (`server/test/access.cjs`, `catalogue-access.cjs`, `record-picture-access.cjs`) |
| 4.2.2 | Anti-CSRF protection | Met | `SameSite` cookie plus `Origin` check on non-GET requests in `server/src/server.ts` (`server/test/auth.cjs`) |
| 4.3.1 | Administrative interfaces use MFA | Partial | `MFA_REQUIRED_ROLES` enforces it per role but is empty by default; SSO relies on the provider |
| 4.3.2 | No directory browsing or metadata files | Met | The API serves no static files; client hosting is the operator's |
| 4.3.3 | Step-up for high-value actions | Partial | See 3.7.1 |

## V5 Validation, sanitisation and encoding

| ID | Requirement | Status | Evidence |
|---|---|---|---|
| 5.1.1 | Defence against HTTP parameter pollution | Met | tRPC takes one JSON input per call, validated by zod |
| 5.1.2 | Protection against mass assignment | Met | zod strips unknown keys; updates list their fields explicitly |
| 5.1.3 | All input is validated with allow lists | Met | zod schemas: enums, UUIDs, lengths, regexes |
| 5.1.4 | Structured data is strongly typed | Met | zod types; stable error shape (`server/test/trpc-error-format.cjs`) |
| 5.1.5 | Redirects go only to allowed destinations | Met | `safeRedirect()` keeps SSO redirects on the client (`server/test/auth.cjs`) |
| 5.2.1 | Untrusted HTML is sanitised | Met | `sanitizeBlockHtml()` on page text and licence terms (`server/test/page-blocks.cjs`) |
| 5.2.2 | Unstructured data is sanitised | Met | CSV cells neutralise formulas (`csvCell()`, `server/test/audit.cjs`) |
| 5.2.3 | Input to mail systems is sanitised | Met | Plain-text mail via nodemailer; addresses validated by zod |
| 5.2.4 | No `eval` or dynamic code execution | Met | None in `server/src` or `client/src` |
| 5.2.5 | Protection against template injection | Met | Email templates are written by admins and rendered by a Liquid engine that cannot read files (`include`, `render` and `layout` fail), refuses unknown filters, limits render time and memory, and HTML-escapes every value, `raw` included. Message HTML is sanitised on save. User values are passed as data (`server/src/mail/render.ts`) |
| 5.2.6 | Protection against SSRF | Met | Outbound calls go to configured hosts only (cloud source, OIDC issuer, Have I Been Pwned) |
| 5.2.7 | User SVG is sanitised or not scriptable | Met | SVG logos rasterised to WebP from a buffer (`processClientLogo()`, `server/test/branding.cjs`) |
| 5.2.8 | Markdown, CSS and similar content is sanitised | Met | Styles and classes stripped by the sanitiser |
| 5.3.1 | Output encoding fits the context | Met | Vue escapes by default; `v-html` only on sanitised HTML |
| 5.3.2 | Output keeps the user's character set | Met | UTF-8 JSON |
| 5.3.3 | Context-aware escaping against XSS | Met | Vue templates; `v-html` limited to server-sanitised content |
| 5.3.4 | Parameterised queries | Met | TypeORM parameters; interpolated SQL fragments are constants or validated integers |
| 5.3.5 | Context escaping where queries cannot be parameterised | Met | Same as 5.3.4 |
| 5.3.6 | Protection against JSON injection | Met | JSON built by serialisers, never by concatenation |
| 5.3.7 | Protection against LDAP injection | N/A | No LDAP |
| 5.3.8 | Protection against OS command injection | Met | `execFile()` without a shell; odd extensions replaced (`server/test/sync.cjs`) |
| 5.3.9 | Protection against local or remote file inclusion | Met | Storage keys and temp paths are generated by the server |
| 5.3.10 | Protection against XPath or XML injection | N/A | No XPath or XML queries |
| 5.4.1 | Memory-safe string and buffer handling | Met | JavaScript runtime; native parsing is delegated to libraries (see 14.2.6) |
| 5.4.2 | Format strings cannot be controlled by input | Met | No user-controlled format strings |
| 5.4.3 | Protection against integer overflow | Met | Numeric inputs bounded by zod |
| 5.5.1 | Serialised objects carry integrity checks | Met | Only signed JWTs (MFA challenge, SSO state) cross the client |
| 5.5.2 | XML parsers are restrictive, XXE disabled | Partial | Damvia parses no XML itself; LibreOffice, ImageMagick and the S3 client parse XML with their own settings |
| 5.5.3 | Untrusted data is not deserialised | Partial | JSON only in the app; worker converters open synced office and image files |
| 5.5.4 | `JSON.parse` is used, not `eval` | Met | Client and server |

## V6 Stored cryptography

| ID | Requirement | Status | Evidence |
|---|---|---|---|
| 6.1.1 | Regulated personal data is encrypted at rest | Partial | TOTP secrets encrypted; names and emails rely on the operator's disk or database encryption |
| 6.1.2 | Regulated health data is encrypted at rest | N/A | Damvia stores no health data |
| 6.1.3 | Regulated financial data is encrypted at rest | N/A | Damvia stores no financial data |
| 6.2.1 | Cryptographic modules fail securely | Met | AES-GCM authentication failure throws; signature failures give one generic error |
| 6.2.2 | Proven algorithms and libraries are used | Met | Node `crypto`, `jsonwebtoken`, `openid-client`, `otpauth` |
| 6.2.3 | IVs, cipher modes and padding are secure | Met | AES-256-GCM, random 96-bit IV (`encryptMfaSecret()`) |
| 6.2.4 | Algorithms can be replaced | Met | Versioned formats `v1:` (MFA secrets) and `scrypt$` (passwords) |
| 6.2.5 | No insecure modes or weak algorithms | Met | No ECB, MD5 or DES; SHA-1 only inside TOTP HMAC and the breach-check k-anonymity prefix |
| 6.2.6 | Nonces and IVs are not reused | Met | Fresh random IV per encryption |
| 6.3.1 | Random values come from a CSPRNG | Met | `randomBytes()` for every token, salt and code |
| 6.3.2 | GUIDs are v4 from a CSPRNG | Met | `randomUUID()` and Postgres `uuid_generate_v4()` |
| 6.4.1 | A secrets management solution is used | Partial | `*_FILE` variables read mounted secrets; no vault client |
| 6.4.2 | Key material is isolated from the application | Not met | `APP_SECRET` lives in the process; no HSM or key service |

## V7 Error handling and logging

| ID | Requirement | Status | Evidence |
|---|---|---|---|
| 7.1.1 | No credentials or session tokens are logged | Met | `redact()` in `services/audit.ts`; query strings left out of `http.response` (`server/test/security.cjs`, `audit.cjs`) |
| 7.1.2 | No other sensitive data is logged | Met | Inputs not logged on errors; IP recording switchable with `AUDIT_LOG_IP` |
| 7.1.3 | Security events are logged | Met | Sign-in success and failure, lockout, MFA, sessions, access denials, validation errors (`server/test/audit.cjs`) |
| 7.1.4 | Log events carry enough context | Met | Actor, action, target, before/after, IP, user agent, timestamp, request id |
| 7.2.1 | All authentication decisions are logged | Met | `auth.sign_in_failed`, `auth.locked`, `auth.mfa_failed`, `auth.sso_failed`, `session.created` |
| 7.2.2 | Access control decisions can be logged, failures are | Partial | Refusals logged as `access.denied`; lookups outside the viewer's scope return "not found" unlogged |
| 7.3.1 | Log injection is prevented | Met | Structured Winston fields serialised as JSON |
| 7.3.3 | Security logs are protected from change | Met | Database trigger refuses updates and deletes on `audit_log` (`server/test/audit.cjs`) |
| 7.3.4 | Time sources are synchronised | N/A | Host and database clocks are the operator's |
| 7.4.1 | A generic error with an ID is shown on failure | Partial | Unexpected errors return their original message to the client, without a reference id |
| 7.4.2 | Exceptions are handled throughout | Met | tRPC `onError` handler; typed `TRPCError`s |
| 7.4.3 | A last-resort error handler exists | Partial | tRPC and Fastify catch request errors; worker jobs rely on pg-boss retries |

## V8 Data protection and privacy

| ID | Requirement | Status | Evidence |
|---|---|---|---|
| 8.1.1 | Sensitive data is not cached by server components | Met | No server-side response cache |
| 8.1.2 | Temporary copies are protected and purged | Met | Temp files removed after conversion; archives expire (`downloadProcessExpiredQueue`) |
| 8.1.3 | Request parameters are minimised | Met | Only ids and fields needed per procedure |
| 8.1.4 | Abnormal request volumes are detected | Partial | Limits on sign-in, reset, links, exports; no general request throttling or alerting |
| 8.2.1 | Anti-caching headers on sensitive responses | Not met | The API sends no `Cache-Control: no-store` |
| 8.2.2 | No sensitive data in browser storage | Met | `localStorage` holds UI preferences and recent searches only |
| 8.2.3 | Client data is cleared at sign-out | Met | Query cache cleared in `logout()` (`client/src/stores/globalStore.ts`) |
| 8.3.1 | Sensitive data is sent in bodies or headers, not URLs | Met | Credentials and tokens go in POST bodies; logs drop query strings |
| 8.3.2 | Users can export and delete their data | Met | `user.exportMyData`, `user.removeAccount` (`server/test/privacy.cjs`) |
| 8.3.3 | Users are told what is collected and why | Met | Instance privacy page (`client/src/views/public/public-privacy-policy.vue`) |
| 8.3.4 | Sensitive data is identified with a handling policy | Met | [Privacy and personal data](../configuration/privacy.md) |
| 8.3.5 | Access to sensitive data is audited | Partial | Data exports and access reviews audited; viewing user lists is not |
| 8.3.6 | Sensitive data in memory is overwritten after use | Not met | Not possible to guarantee in the Node runtime |
| 8.3.7 | Encrypted data uses authenticated encryption | Met | AES-256-GCM for TOTP secrets |
| 8.3.8 | Personal data follows a retention schedule | Met | `AUDIT_RETENTION_DAYS`, analytics retention, session and token pruning |

## V9 Communication

| ID | Requirement | Status | Evidence |
|---|---|---|---|
| 9.1.1 | TLS is used for all client connections | Partial | Terminated at the operator's proxy; the API sends HSTS and warns when `APP_URL` or `API_URL` are not HTTPS |
| 9.1.2 | Only strong cipher suites are enabled | N/A | Configured at the reverse proxy |
| 9.1.3 | Only current TLS versions are enabled | N/A | Configured at the reverse proxy |
| 9.2.1 | Outbound TLS uses trusted certificates | Met | Node default verification, never disabled |
| 9.2.2 | Every inbound and outbound connection is encrypted | Partial | S3, SMTP and Postgres TLS are optional; startup warnings for S3 and SMTP |
| 9.2.3 | Connections to external systems are authenticated | Met | HTTPS to cloud sources, OIDC provider and Have I Been Pwned |
| 9.2.4 | Certificate revocation is checked | Not met | No OCSP or CRL checking in outbound clients |
| 9.2.5 | Backend TLS failures are logged | Met | Connection errors logged by the S3, mail and sync jobs |

## V10 Malicious code

| ID | Requirement | Status | Evidence |
|---|---|---|---|
| 10.2.1 | The code does not phone home or collect data | Partial | No telemetry; the client loads Google Fonts, which exposes visitors' IP addresses to Google |
| 10.2.2 | No unnecessary device permissions | Met | No camera, location or contacts access |
| 10.3.1 | Automatic updates use a secure channel | N/A | No auto-update; operators pull images or tags |
| 10.3.2 | Integrity protection such as SRI | Partial | Bundled client; Google Fonts stylesheet has no SRI |
| 10.3.3 | Protection against subdomain takeover | N/A | DNS is the operator's |

## V11 Business logic

| ID | Requirement | Status | Evidence |
|---|---|---|---|
| 11.1.1 | Flows run in the expected order | Met | MFA challenge must precede the session; approval requires a verified email (`server/test/auth.cjs`) |
| 11.1.2 | Flows respect realistic human timing | Partial | Enforced on authentication flows only |
| 11.1.3 | Business actions have limits | Met | Download size caps, export limits, bulk limits (`server/test/download.cjs`) |
| 11.1.4 | Anti-automation against exfiltration and denial of service | Partial | Per-process in-memory limits; no global rate limit |
| 11.1.5 | Business logic limits check likely threats | Met | Licence acceptance, guest restrictions, sync deletion cap (`server/test/download.cjs`, `access.cjs`, `dropbox-sync.cjs`) |
| 11.1.6 | No time-of-check to time-of-use races | Met | Conditional updates for tokens, codes, TOTP steps; concurrency tests (`server/test/security.cjs`) |
| 11.1.7 | Unusual activity is monitored | Partial | Audit log and analytics; no built-in anomaly detection |
| 11.1.8 | Alerts on automated attacks are configurable | Not met | No built-in alerting; `AUDIT_LOG_STREAM=true` feeds an external SIEM |

## V12 Files and resources

Users upload only collection thumbnails, page images and videos, the client logo and the sign-in background. Library files come from the connected cloud folder.

| ID | Requirement | Status | Evidence |
|---|---|---|---|
| 12.1.1 | Large files cannot exhaust storage or memory | Partial | Presigned POST policies cap size; the sign-in background uses an unbounded presigned PUT valid 24 hours (admin only); worker thumbnailing sets `limitInputPixels: 0` for synced files |
| 12.1.2 | Compressed files are checked against bombs | N/A | Uploaded archives are never extracted |
| 12.1.3 | Per-user size quota and file count | Partial | Instance storage quota only; uploads limited to editors and admins |
| 12.2.1 | Uploaded file types are checked by content | Met | Images decoded and re-encoded; videos checked by magic bytes (`finalizeBlockUpload()`); logos validated (`server/test/branding.cjs`) |
| 12.3.1 | File names are not used directly by the file system | Met | Storage keys are server-generated UUIDs |
| 12.3.2 | File metadata cannot cause local file inclusion | Met | Same |
| 12.3.3 | File metadata cannot cause remote inclusion or SSRF | Met | No URLs taken from file metadata |
| 12.3.4 | Protection against reflected file download | Met | API responds `application/json`; files served from the bucket through signed URLs |
| 12.3.5 | File metadata does not reach OS commands | Met | `execFile()` with generated paths (`server/test/sync.cjs`) |
| 12.3.6 | No code from untrusted sources is included | Met | Bundled dependencies from the npm registry |
| 12.4.1 | Untrusted files are stored outside the web root | Met | Private buckets |
| 12.4.2 | Untrusted files are scanned for malware | Not met | No antivirus scanning |
| 12.5.1 | The web tier serves only allowed file types | N/A | The API serves no files; the client is static |
| 12.5.2 | Uploaded files are never executed as HTML or JavaScript | Met | Images re-encoded to WebP, SVG rasterised, videos type-checked, served from the S3 origin |
| 12.6.1 | Outbound requests use an allow list | Partial | Destinations fixed by configuration; no egress allow list in the application |

## V13 API and web service

| ID | Requirement | Status | Evidence |
|---|---|---|---|
| 13.1.1 | All components use the same encodings and parsers | Met | JSON over tRPC end to end |
| 13.1.3 | API URLs do not expose sensitive data | Partial | Session tokens never appear; a download link `/v1/downloads/{id}` is a bearer URL by design, checked against the owner's access |
| 13.1.4 | Authorisation at the route and the resource | Met | Middleware on the procedure plus access queries on the object |
| 13.1.5 | Unexpected content types are rejected | Met | Fastify refuses unsupported body types |
| 13.2.1 | HTTP methods match the action | Met | tRPC queries on GET, mutations on POST only |
| 13.2.2 | JSON schema validation | Met | zod on every input |
| 13.2.3 | Cookie-based APIs are protected from CSRF | Met | `Origin` check and `SameSite` (`server/test/auth.cjs`) |
| 13.2.5 | Incoming `Content-Type` is checked | Partial | Fastify also accepts `text/plain` bodies; the `Origin` check blocks cross-site use |
| 13.2.6 | Messages are protected in transit | N/A | TLS at the reverse proxy (see V9) |
| 13.3.1 | SOAP schema validation | N/A | No SOAP |
| 13.3.2 | SOAP WS-Security | N/A | No SOAP |
| 13.4.1 | GraphQL depth and query limits | N/A | No GraphQL |
| 13.4.2 | GraphQL authorisation in business logic | N/A | No GraphQL |

## V14 Configuration

| ID | Requirement | Status | Evidence |
|---|---|---|---|
| 14.1.1 | Builds and deployments are secure and repeatable | Met | `.github/workflows/ci.yml`, `release.yml`, `server/Dockerfile` |
| 14.1.2 | Compiler hardening flags | N/A | No compiled code of Damvia's own |
| 14.1.3 | Server configuration is hardened | Partial | App settings validated at startup; host hardening is the operator's ([Hardening checklist](../deployment/hardening.md)) |
| 14.1.4 | The stack can be redeployed and restored | Met | Docker image, migrations run at start, [Backups](../deployment/backups.md) |
| 14.2.1 | All components are up to date | Partial | Four moderate advisories remain through `minio` (`stream-json`, `query-string`) |
| 14.2.2 | Unneeded features and tools are removed | Partial | Full `node:22-bookworm` base image rather than a slim one |
| 14.2.3 | External assets use subresource integrity | Partial | Google Fonts loaded without SRI |
| 14.2.4 | Components come from trusted repositories | Met | npm registry and Debian archives, lockfiles committed |
| 14.2.5 | An inventory of components is kept | Met | CycloneDX SBOMs attached to each release |
| 14.2.6 | Third-party libraries are sandboxed | Partial | LibreOffice, ImageMagick, Ghostscript and ffmpeg run in the API container as `node`, without a separate sandbox |
| 14.3.2 | Debug modes are off in production | Met | Stack traces only when `NODE_ENV` is not `production` |
| 14.3.3 | Responses do not reveal versions | Met | Helmet removes `X-Powered-By`; no `Server` version |
| 14.4.1 | Responses carry a safe `Content-Type` and charset | Met | `application/json; charset=utf-8` |
| 14.4.2 | API responses carry `Content-Disposition: attachment` | Not met | Not set on JSON responses |
| 14.4.3 | A Content Security Policy is sent | Partial | API: `default-src 'none'; frame-ancestors 'none'`; the client's CSP is left to the operator's proxy ([Reverse proxy](../deployment/reverse-proxy.md)) |
| 14.4.4 | `X-Content-Type-Options: nosniff` | Met | Helmet in `server/src/server.ts` (`server/test/auth.cjs`) |
| 14.4.5 | `Strict-Transport-Security` | Met | Helmet default |
| 14.4.6 | A suitable `Referrer-Policy` | Met | `no-referrer` |
| 14.4.7 | Framing is restricted | Met | `frame-ancestors 'none'`, `X-Frame-Options` |
| 14.5.1 | Only used HTTP methods are accepted | Partial | Unknown routes and methods get 404; they are not logged as suspicious |
| 14.5.2 | `Origin` is not used for authentication | Met | Used only to refuse cross-site mutations |
| 14.5.3 | CORS uses a strict allow list | Met | Only `APP_URL`'s origin, with credentials |
| 14.5.4 | Proxy-added headers are trusted only from known hops | Met | `TRUST_PROXY` hop count or address list |

## Gaps and planned work

Ordered from highest to lowest risk.

1. **MFA is optional for administrators by default.** `MFA_REQUIRED_ROLES` is empty unless the operator sets it, and SSO sessions skip Damvia's MFA. Set `MFA_REQUIRED_ROLES=admin,manager` in production. Making `admin` the default is planned.
2. **Sensitive actions do not ask for re-authentication.** Deleting one's own account, enrolling MFA, revoking sessions and an administrator's own email change need only the session. There is no in-session password change, and no email is sent when a password, email or second factor changes. A recent-authentication check and security notifications are planned.
3. **Rate limits live in process memory.** Several API replicas each count separately and a restart resets them. Only the account lockout is stored in the database. There is no general request throttling and no built-in alerting. Put a rate limit at the reverse proxy and forward the audit stream to a SIEM.
4. **The client's Content Security Policy is the operator's job.** The API sends a strict policy, but the static client gets whatever the proxy adds. The client also loads Google Fonts without subresource integrity. Bundling the fonts and shipping a default policy are planned.
5. **Unexpected server errors return their original message** and the API sends no `Cache-Control: no-store`. Replacing internal error messages with a generic text and a request id, and adding `no-store` to API responses, are planned.
6. **Upload and conversion limits have holes.** The sign-in background upload has no size or type limit in its presigned URL (admin only, 24 hours), synced images are thumbnailed without a pixel limit, and the converters share the API's container. Size-limited uploads for every path and a sandboxed converter worker are planned.
7. **Recovery codes are short.** Each has 40 bits and is stored as an unsalted SHA-256 hash. Online guessing is limited to 5 tries per 5 minutes; longer, salted codes are planned.
8. **Internal connections may run without TLS.** Postgres, S3 and SMTP accept plain connections (with a startup warning for S3 and SMTP). No outbound client checks certificate revocation.
9. **Dependency advisories.** Four moderate advisories remain in the S3 client's XML parsing dependencies (`minio` → `stream-json`, `query-string`); they concern responses from your own storage. The Docker base image is the full Debian image and is not pinned by digest.
10. **Smaller items.** No SAML, SCIM or single logout; C2PA manifests are detected, not validated; no antivirus scanning of files; the session cookie lacks the `__Host-` prefix; email sign-in links last 15 minutes instead of 10; sign-up reveals that an email is already registered; rotating `APP_SECRET` forces every user to re-enrol MFA; no password strength meter or show-password control.

Current operational limits are tracked in [Known limitations](./known-limitations.md).
