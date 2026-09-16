# Damvia documentation

**`docs/` is the source of the public documentation site.** Every Markdown file here, except this one and `_internal/`, is rendered by the Damvia website with [Astro Starlight](https://starlight.astro.build). The website pulls this repository in as a git submodule, so the docs are versioned with the code and edited in the same pull request as the behaviour they describe.

Audience: people who **install, configure, run and administer** a Damvia instance, plus a Contributing group for developers changing the code. End-user instructions belong in a separate guide. Keep this site technical: configuration, API rules, administrative procedures and operating runbooks.

## The maintenance rule

**When you change behaviour in `server/` or `client/`, update the page that describes it in the same commit, and set that page's `lastUpdated` to today.** [`_internal/page-map.md`](_internal/page-map.md) says which page covers which part of the code. Typical triggers: a new or renamed environment variable, a new queue or cron, a new admin screen, a change to a sync driver, a mail template, the CLI, the Dockerfile or docker-compose.

A new environment variable is added in three places: the code, `server/.env.template` (or `client/.env.template`), and `reference/environment-variables.md`. `scripts/check-docs.sh` checks both the templates and the reference for dot-notation variables detected in the source.

## Folder layout

| Folder | Sidebar group | Holds |
|---|---|---|
| `introduction/` | Introduction | What Damvia is, core concepts, roles |
| `getting-started/` | Getting started | Requirements, local setup, first admin |
| `configuration/` | Configuration | Env walkthrough, email templates, branding |
| `integrations/` | Integrations | Dropbox, OneDrive, SMTP, object storage |
| `deployment/` | Deployment | Docker, client build, reverse proxy, worker, upgrades, backups |
| `administration/` | Administration | Every admin screen and the rules behind it |
| `reference/` | Reference | Tables: env vars, jobs, CLI, ports, troubleshooting |
| `contributing/` | Contributing | For developers: architecture, data model, API, jobs, storage drivers |
| `assets/` | (not a group) | Images referenced relatively from pages |
| `_internal/` | (excluded) | Repo-only notes, never published |

A folder is a sidebar group. `index.md` is the group's landing page. Files are kebab-case, one topic per file.

## Frontmatter contract

Every public page starts with:

```yaml
---
title: Dropbox
description: Create the Dropbox app, obtain a refresh token, and choose member or team root.
sidebar:
  order: 2
lastUpdated: 2026-09-16
---
```

| Field | Rule |
|---|---|
| `title` | Short noun phrase. Shown in the sidebar and the tab. |
| `description` | One sentence. Required: the site build fails without it. Used for search and social cards. |
| `sidebar.order` | Position inside the group. `index.md` is always `1`. |
| `lastUpdated` | `YYYY-MM-DD`, the date the page was last checked against the code. Required. Write a date, never `true`: git history does not cross the submodule boundary. |

Optional: `sidebar.label` (shorter sidebar text), `sidebar.badge: { text: Beta }`. `draft: true` hides a page from production. Custom `slug` values require a matching change to the route resolver and are currently rejected by the source check. Repository-only material belongs under `_internal/`.

## Writing rules

Write for a person maintaining Damvia. Describe what happens, what they can see and why it matters before naming the supporting function or field. Prefer “the dialog shows the download status” to “the component consumes status”. Keep useful interface descriptions, such as labels, disabled buttons and status changes: they help a maintainer check the behaviour. Step-by-step tutorials for everyday users belong in the separate user guide.

- One topic per page, 300 to 1,200 words.
- Open with one or two sentences that say what the page lets the reader do.
- Headings state a fact or a task: "Managers only see their own region", not "Managers".
- Backticks for every env var, path, column, enum value and queue name. Exact numbers ("every 5 minutes", "7 days").
- Label executable examples and unexecuted operational procedures honestly. A source review or compilation does not prove a live integration; record actual results in `reference/validation-status.md`.
- Never cite line numbers. Name files and symbols instead: they are greppable and their absence is detectable.
- Plain Markdown. Starlight asides are fine (`:::note`, `:::tip`, `:::caution`). No custom components, no imports, so the files stay readable on GitHub.
- Cross-link with relative paths: `[Licenses](../administration/licenses.md)`. The website remark plugin resolves the target against the source file before converting it to an absolute `/docs/...` route; keep the `.md` links readable on GitHub.
- Images go in `assets/` and are referenced relatively: `![Admin users](../assets/admin-users.png)`.

## How the website consumes this folder

The website repository (`github.com/damviaHQ/website`, Astro 7 + Starlight) already contains this wiring; it is documented here so it can be reproduced or moved.

- `damvia/` is a git submodule of the website (`git submodule add https://github.com/damviaHQ/damvia.git damvia`).
- `src/content/docs/docs` is a symlink to `../../../damvia/docs`, committed to the website repo. The extra `docs/` directory level is what puts every page under `https://damvia.com/docs/...`; Starlight itself has no URL prefix option.
- `src/content.config.ts` declares the `docs` collection with Astro's `glob()` loader on `./src/content/docs`, the same base and pattern as Starlight's `docsLoader()`, plus two exclusions: `!docs/README.md` and `!docs/_internal/**`. `docsSchema({ extend })` requires a non-empty `description`, a dated `lastUpdated` (not a boolean), and a positive integer `sidebar.order`. The source checker also validates exact calendar dates, unique orders and landing-page order.
- `astro.config.mjs` registers `starlight()` with one autogenerated sidebar group per folder (`autogenerate: { directory: 'docs/<folder>' }`), `editLink.baseUrl` pointing at `https://github.com/damviaHQ/damvia/edit/main/`, `lastUpdated: true` (dates come from the frontmatter), `customCss: ['./src/styles/docs.css']`, and a redirect from `/docs` to `/docs/introduction`.
- `scripts/remark-doc-links.mjs`, registered through the explicit `unified` processor from `@astrojs/markdown-remark` in the website Markdown configuration, transforms relative Markdown page links and link definitions to routes, including `index.md` and anchors. It rejects missing or unpublished targets.
- `npm run build` in the website runs Astro followed by `scripts/check-doc-links.mjs`, which parses the generated documentation HTML and checks same-origin routes and anchors.
- `src/routeData.ts` is a Starlight route middleware that rewrites `/src/content/docs/docs/` to `/docs/` in the edit URL, so "Edit this page" opens the file in this repository.

Publishing newer docs is a submodule bump in the website repo:

```bash
git submodule update --remote damvia && git add damvia && git commit -m "docs: bump damvia"
```

Netlify and Vercel check out public HTTPS submodules automatically; any other build pipeline must run `git submodule update --init --recursive` before `astro build`. A fresh clone of the website needs the same command once. If the symlink is a problem on Windows, replace it with a prebuild step that copies `damvia/docs/` into a gitignored `src/content/docs/docs/`.

Why a symlink and not `glob({ base: './damvia/docs' })`: Starlight's autogenerated sidebar derives each page's directory by stripping `src/content/docs/` from the file path. A different base renders the pages but empties every `autogenerate` group.

## Checking the docs

```bash
npm ci --prefix scripts
scripts/check-docs.sh
node --test scripts/docs.test.mjs
```

Parses YAML and Markdown to check required fields, valid calendar dates, sidebar order, relative targets, environment-name coverage in templates/reference, and queue-name coverage. Code examples are excluded from link checks. Dynamic environment lookups and the semantics of permissions/defaults still require review.

`.github/workflows/docs.yml` runs source checks and their regression tests on pull requests and pushes to `main`. The website has a separate build workflow with recursive submodule checkout and generated-link checks. These workflows do not publish the site. The website renderer is also kept in `scripts/remark-doc-links.mjs` here for regression tests; when changing it, update the website copy in the same release.

To check a website build explicitly from this repository: `scripts/check-docs.sh --html /absolute/path/to/website/dist`. Advance the website submodule only after the desired documentation commit exists; local edits in this checkout are not automatically visible to it.
