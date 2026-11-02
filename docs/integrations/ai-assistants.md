---
title: AI assistants (MCP)
description: Let people search the library, open products and look at pictures from Claude through the Model Context Protocol, with exactly their own access rights.
sidebar:
  order: 9
lastUpdated: 2026-11-02
---

Damvia includes a Model Context Protocol (MCP) server. A person adds it to their AI assistant as a connector, agrees once on a Damvia page, and can then ask in plain language: "show me the packshots of 02351-008", "which of these references do not exist?", "find a campaign visual with a clear sky on the left". The assistant only ever sees what that person sees in the library.

Claude is supported first. ChatGPT and other MCP clients use the same standard endpoint and will be validated next.

## Turn it on

Set `MCP_ENABLED=true` on the server and restart it. The endpoint is then `API_URL/v1/mcp`, for example `https://api.dam.example.com/v1/mcp`. Off by default, the routes below do not exist.

The reverse proxy must pass these paths to the API: `/v1/*`, which existing configurations already send, and `/.well-known/oauth-authorization-server` and `/.well-known/oauth-protected-resource*`, which assistants read to find how to sign in. See [Reverse proxy](../deployment/reverse-proxy.md).

## Connect Claude

1. In Claude, open the connector settings and add a custom connector with the address `API_URL/v1/mcp`. On a Team or Enterprise plan, an owner can add it for the whole organisation.
2. Claude opens Damvia's **Connect an AI assistant** page. A person who is signed out signs in first, with a password, single sign-on and two-step verification as usual, and comes back to the page.
3. The page names the assistant, the account, the site the person returns to and what the assistant will be able to do. **Allow** sends them back to Claude, connected; **Cancel** refuses.

Only approved, verified `admin`, `manager` and `member` accounts can connect an assistant. Guest accounts, created by invitations, are refused. A role listed in `MFA_REQUIRED_ROLES` must have set up two-step verification first.

## What the assistant can do

Reading only, for now. Every tool calls the same procedures as the web interface, as the person who connected it, so collection visibility, groups, drafts, licence dates and regions, and hidden fields apply unchanged.

| Tool | What it does |
|---|---|
| `get_context` | The library's vocabulary: what records are called, the asset types with their descriptions and whether they are product pictures, the filterable fields and their values, the variant axes, the person's role |
| `search_products` | Products by text, by several references at once and by field filters, optionally inside one collection |
| `lookup_references` | A pasted list of references: found, missing, and close matches for the missing ones |
| `get_product` | One product: visible fields, files grouped by asset type, products of the same model |
| `search_files` | Files by text, asset types, file kind, extension, product fields, views, variant axes and file metadata, inside a collection or not, with counts to refine the search |
| `view_files` | The previews of up to 10 files as images, or 16 on one numbered contact sheet, so the assistant can look at them and choose |
| `get_variants` | The versions of one creative (formats, languages, durations) |
| `list_collections`, `get_collection` | The collections the person can open, and what one holds |
| `whats_new` | The latest files, globally or inside a collection |

Results carry links to the matching Damvia pages. They never carry the address of an original file: originals leave Damvia through [downloads](../administration/downloads.md), where licences are accepted.

## What leaves Damvia

The assistant's provider receives what the tools return: names, field values, licence names and terms, and, for `view_files`, previews of at most 1,024 pixels. The person chooses that provider; Damvia calls no AI service itself. Looking at a preview needs no licence acceptance, as in the web interface, and records an `asset_view` event with `channel: mcp` in [analytics](../administration/analytics.md).

Names and values are returned as data. A file name written as an instruction is not one: the server's guidance tells the assistant so, and no tool can share, download or change anything yet.

## How long a connection lasts

Each connection is a session of method `mcp`, listed with the assistant's name in **Account → Security**, where the person can end it. It lasts `SESSION_MAX_HOURS` (30 days by default) from the moment the person allowed it, then they allow it again. Idleness does not end it, since assistants call in bursts.

Ending the session, signing out of every other session, a password reset, an admin's `user.revokeSessions`, a suspension or deleting the account all end the connection at once.

## Security

- OAuth 2.1 with PKCE (S256 only), served by Damvia itself. Assistants register through dynamic client registration (RFC 7591); the consent page shows the host they return to, so a person can spot an unexpected one. Return addresses must be HTTPS, or HTTP on the loopback for local tools.
- Authorization codes last one minute and work once, whatever happens on the first try. Access tokens last one hour. Refresh tokens change at every use; presenting an old one ends the connection.
- Tokens, codes and client secrets are stored as SHA-256 hashes. The endpoint accepts only a bearer token, never the session cookie.
- Registration, token and MCP calls are rate limited. `assistant.authorized` and `session.created` (method `mcp`) are written to the [audit log](../administration/audit-log.md).

## Known limitations

- Client ID metadata documents are not supported; assistants must use dynamic client registration.
- Signing in with an email link opens the library in a new tab, without the consent page: start again from the assistant once signed in.
- Downloads, collections, sharing and administration tools are planned, not available.
