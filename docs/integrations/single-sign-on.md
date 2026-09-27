---
title: Single sign-on
description: Let users sign in with an OpenID Connect identity provider such as Microsoft Entra ID, Google Workspace, Okta or Keycloak.
sidebar:
  order: 8
lastUpdated: 2026-09-27
---

Damvia can hand sign-in to an OpenID Connect (OIDC) identity provider. Users click a button on the sign-in page, authenticate at the provider, and come back signed in. Passwords, email links and invitations keep working unless you turn them off with `OIDC_ONLY`. SAML is not supported.

## How the sign-in works

1. The button opens `API_URL/v1/auth/oidc/start`. The API discovers the provider from `OIDC_ISSUER`, creates a PKCE verifier, a `state` and a `nonce`, stores them in a signed HttpOnly cookie valid 10 minutes, and redirects to the provider.
2. The provider redirects back to `API_URL/v1/auth/oidc/callback`. The API exchanges the code, checks the state, the nonce and the ID token signature, and reads the ID token's claims.
3. The API finds or creates the Damvia account (see below), opens a session with the method `sso`, and redirects to the client.

Sessions opened this way follow `SESSION_IDLE_HOURS` and `SESSION_MAX_HOURS` like any other. They are exempt from Damvia's two-step verification, because the provider applies its own policy. Enforce MFA at the provider.

## Configure the provider

Register a confidential web application with:

| Setting | Value |
|---|---|
| Redirect URI | `API_URL/v1/auth/oidc/callback`, for example `https://api.dam.example.com/v1/auth/oidc/callback` |
| Grant type | Authorization code, with PKCE (S256) |
| Scopes | `openid email profile` (or `OIDC_SCOPES`) |
| Client authentication | Client secret |

Then set the variables on the server and restart it.

| Variable | Default | Purpose |
|---|---|---|
| `OIDC_ISSUER` | unset | Issuer URL; Damvia reads `/.well-known/openid-configuration` under it. Setting it, `OIDC_CLIENT_ID` and `OIDC_CLIENT_SECRET` turns single sign-on on. Setting only some of the three stops the server at startup. |
| `OIDC_CLIENT_ID` | unset | Client id from the provider. |
| `OIDC_CLIENT_SECRET` | unset | Client secret. Can come from a file with `OIDC_CLIENT_SECRET_FILE`. |
| `OIDC_LABEL` | `Single sign-on` | Text of the sign-in button. |
| `OIDC_SCOPES` | `openid email profile` | Scopes requested. Add the scope that carries groups if your provider needs one. |
| `OIDC_TRUST_EMAIL` | `false` | `true` treats the `email` claim as verified even without `email_verified: true`. Only for a provider where users cannot choose their own address (see below). |
| `OIDC_AUTO_CREATE` | `false` | `true` creates an approved member account on first sign-in when no account matches. |
| `OIDC_DEFAULT_REGION` | first region by name | Region name for accounts created by `OIDC_AUTO_CREATE`. |
| `OIDC_GROUPS_CLAIM` | unset | Name of the ID token claim that lists the user's groups, for example `groups`. |
| `OIDC_GROUP_MAP` | unset | JSON object mapping provider group values to Damvia group names, for example `{"3f2a…":"Design","sales":"Sales"}`. |
| `OIDC_ONLY` | `false` | `true` makes single sign-on the only way in for everyone except guests. |

## How accounts are matched

- An account already linked to the provider is found by its subject (`sub`), stored with the issuer as `users.oidc_subject`.
- Otherwise an account with the same email (case-insensitive) is linked on first sign-in, but only if the provider marks the email verified (`email_verified: true`) or `OIDC_TRUST_EMAIL=true`. Some providers let users put any address on their profile. Linking on an unverified email would let someone take over the account that owns that address.
- An account already linked to another subject is never relinked. The user sees "already linked to another single sign-on identity".
- Without a match, the account is created only with `OIDC_AUTO_CREATE=true` and a trusted email. It is an approved `member` in `OIDC_DEFAULT_REGION`, with a verified email and no password. Without a groups mapping, it joins the region's default group.
- A suspended account cannot sign in this way either.

Roles are not taken from the provider. Change them in Damvia as usual.

### Microsoft Entra ID

- Issuer: `https://login.microsoftonline.com/<tenant id>/v2.0`.
- Entra ID does not send `email_verified`. Existing accounts are linked by email only with `OIDC_TRUST_EMAIL=true`. Set it only if the tenant's `email` values come from your own directory (members of your organisation, no guest accounts with self-asserted addresses). Otherwise invite users so their accounts are created first, and link them by a verified address.
- For groups, add the optional `groups` claim to the ID token (Token configuration > Add groups claim). It carries group object ids, so map those ids in `OIDC_GROUP_MAP`.

### Google Workspace, Okta, Keycloak

These send `email_verified`. Keycloak and Okta can add a `groups` claim with a client scope or a groups claim mapper.

## Groups

With `OIDC_GROUPS_CLAIM` and `OIDC_GROUP_MAP` set, every sign-in makes the user's membership of the **mapped** Damvia groups match the claim. Groups that appear nowhere in the map keep the memberships admins set by hand. A mapped Damvia group that does not exist is ignored; create it first.

## OIDC_ONLY

With `OIDC_ONLY=true`:

- the sign-in page shows only the single sign-on button, and a note for guests;
- password sign-in, email sign-in links and password resets are refused for every account except guests;
- sign-up is closed.

Guests have no account at the provider. They keep signing in through their invitation links and, when passwords are enabled, through email links.

## Errors

After a failed attempt the user lands on the sign-in page with a message. The server logs `oidc.callback` with the reason.

| Reason | Meaning |
|---|---|
| `no_account` | No matching account and `OIDC_AUTO_CREATE` is off. Invite or create the user first. |
| `email_unverified` | An account matches by email but the provider did not confirm the address. See `OIDC_TRUST_EMAIL`. |
| `conflict` | The matching account is already linked to another subject. |
| `suspended` | The account is suspended. |
| `failed` | Anything else: expired or forged state, a provider error, a discovery failure. The log line carries the error. |

## Limits

- Signing out of Damvia does not sign out of the provider, and signing out of the provider does not end Damvia sessions. When someone leaves, disable them at the provider **and** suspend them in Damvia (Users > Suspend), which ends their sessions immediately.
- There is no SCIM provisioning. Accounts appear at first sign-in (with `OIDC_AUTO_CREATE`) or are created or invited in Damvia.
