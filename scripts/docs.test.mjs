/* Damvia - Open Source Digital Asset Manager
Copyright (C) 2024  Arnaud DE SAINT JEAN
This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <https://www.gnu.org/licenses/>. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { validDate, readPage, validateFrontmatter, markdownLinks, localTarget, checkHtml, checkSource } from './docs-lib.mjs';
import remarkDocLinks, { rewriteDocLink, validateSourceDate } from './remark-doc-links.mjs';

const fixture = () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'damvia-doc-test-'));
  for (const group of ['configuration', 'reference', '_internal']) mkdirSync(path.join(dir, group));
  for (const file of ['configuration/index.md', 'configuration/server-env.md', 'reference/index.md', 'reference/jobs.md', '_internal/private.md', 'README.md']) writeFileSync(path.join(dir, file), '---\nlastUpdated: 2026-09-16\n---\nfixture');
  return dir;
};

test('dates reject booleans, empty/partial values and impossible calendar days', () => {
  for (const value of [true, false, '', '2026', '2026-02-30', '2025-02-29', '2026-09-16junk', new Date(NaN)]) assert.equal(validDate(value), false);
  for (const value of ['2026-09-16', '2024-02-29', new Date('2026-09-16')]) assert.equal(validDate(value), true);
});

test('frontmatter is parsed as YAML and required fields cannot be borrowed from the body', () => {
  assert.throws(() => readPage('---\ntitle: bad: value\n---\n'));
  assert.throws(() => readPage('title: no delimiter'));
  const { frontmatter } = readPage('---\ntitle: Example\ndescription: Valid\nlastUpdated: true\n---\nsidebar:\n  order: 1');
  const errors = validateFrontmatter(frontmatter, 'index.md');
  assert.ok(errors.some(error => error.includes('lastUpdated')));
  assert.ok(errors.some(error => error.includes('sidebar.order')));
  assert.equal(readPage('---\nlastUpdated: 2026-02-30\n---\n').frontmatter.lastUpdated, '2026-02-30');
});

test('sidebar order must be positive and landing-page order is one', () => {
  const data = { title: 'Test', description: 'Test', lastUpdated: '2026-09-16', sidebar: { order: 1 } };
  assert.deepEqual(validateFrontmatter(data, 'index.md'), []);
  for (const order of [undefined, '1', 0, -1, 1.5, 2]) assert.ok(validateFrontmatter({ ...data, sidebar: { order } }, 'index.md').length);
});

test('Markdown parsing includes reference links and images but ignores code examples', () => {
  const body = '[inline](./a.md)\n![image](./x.png)\n[reference][x]\n\n[x]: ./b.md#target\n\n```md\n[code](./fake.md)\n```';
  assert.deepEqual(markdownLinks(body), ['./a.md', './x.png', './b.md#target']);
});

test('index-page and cross-group links resolve from source file, preserving query and hash', t => {
  const dir = fixture(); t.after(() => rmSync(dir, { recursive: true }));
  const source = path.join(dir, 'configuration/index.md');
  assert.equal(rewriteDocLink('./server-env.md', source, dir), '/docs/configuration/server-env');
  assert.equal(rewriteDocLink('../reference/index.md', source, dir), '/docs/reference');
  assert.equal(rewriteDocLink('../reference/jobs.md?view=all#cron', source, dir), '/docs/reference/jobs?view=all#cron');
  assert.equal(rewriteDocLink('./index.md#top', source, dir), '/docs/configuration#top');
  for (const url of ['https://example.com/page.md', '/docs/reference', '#local', 'mailto:a@example.com']) assert.equal(rewriteDocLink(url, source, dir), url);
});

test('missing, escaping and unpublished links fail rather than being silently rewritten', t => {
  const dir = fixture(); t.after(() => rmSync(dir, { recursive: true }));
  const source = path.join(dir, 'configuration/index.md');
  for (const url of ['./missing.md', '../../outside.md', '../_internal/private.md', '../README.md']) {
    assert.throws(() => rewriteDocLink(url, source, dir));
  }
  assert.throws(() => localTarget('../../outside.md', source, dir));
});

test('remark rewrites definitions and inline links', t => {
  const dir = fixture(); t.after(() => rmSync(dir, { recursive: true }));
  const tree = { type: 'root', children: [{ type: 'definition', url: './server-env.md' }, { type: 'link', url: '../reference/jobs.md' }] };
  remarkDocLinks({ docsRoot: dir })(tree, { path: path.join(dir, 'configuration/index.md') });
  assert.equal(tree.children[0].url, '/docs/configuration/server-env');
  assert.equal(tree.children[1].url, '/docs/reference/jobs');
});

test('generated HTML validation distinguishes valid routes, broken routes and missing anchors', t => {
  const dist = mkdtempSync(path.join(tmpdir(), 'damvia-html-test-')); t.after(() => rmSync(dist, { recursive: true }));
  mkdirSync(path.join(dist, 'docs/configuration'), { recursive: true });
  mkdirSync(path.join(dist, 'docs/reference'), { recursive: true });
  writeFileSync(path.join(dist, 'docs/configuration/index.html'), '<a href="/docs/reference#queues">valid</a><a href="/docs/reference#missing">bad anchor</a><a href="./server-env.md">bad route</a><a href="https://elsewhere.example/missing">external</a>');
  writeFileSync(path.join(dist, 'docs/reference/index.html'), '<h2 id="queues">Queues</h2>');
  const result = checkHtml(dist);
  assert.equal(result.links, 3);
  assert.equal(result.errors.length, 2);
  assert.ok(result.errors.some(error => error.includes('Missing anchor')));
  assert.ok(result.errors.some(error => error.includes('Missing route')));
});

test('raw source dates are checked before YAML can normalise an impossible day', () => {
  assert.throws(() => validateSourceDate('---\nlastUpdated: 2026-02-30\n---\n'));
  assert.throws(() => validateSourceDate('---\nlastUpdated: true\n---\n'));
  validateSourceDate('---\nlastUpdated: "2026-09-16" # checked\n---\n');
});

test('source checker catches variables missing from templates/reference and missing queues', t => {
  const root = mkdtempSync(path.join(tmpdir(), 'damvia-source-test-'));
  t.after(() => rmSync(root, { recursive: true }));
  for (const dir of ['docs/reference', 'server/src', 'client/src']) mkdirSync(path.join(root, dir), { recursive: true });
  writeFileSync(path.join(root, 'docs/reference/environment-variables.md'), '---\ntitle: Env\ndescription: Vars\nsidebar:\n  order: 2\nlastUpdated: 2026-09-16\n---\n');
  writeFileSync(path.join(root, 'docs/reference/background-jobs.md'), '---\ntitle: Jobs\ndescription: Queues\nsidebar:\n  order: 3\nlastUpdated: 2026-09-16\n---\n');
  writeFileSync(path.join(root, 'server/src/worker.ts'), "const queue = { name: 'test/job' }; const setting = process.env.NEW_SETTING;");
  writeFileSync(path.join(root, 'server/.env.template'), '');
  writeFileSync(path.join(root, 'client/.env.template'), '');
  const result = checkSource(root);
  assert.ok(result.errors.includes('Environment reference missing NEW_SETTING'));
  assert.ok(result.errors.includes('Environment templates missing NEW_SETTING'));
  assert.ok(result.errors.includes('Queue reference missing test/job'));
  const page = path.join(root, 'docs/reference/environment-variables.md');
  writeFileSync(page, readFileSync(page, 'utf8') + '\n<<<<<<< Updated upstream\nconflict\n=======\nchange\n>>>>>>> Stashed changes\n');
  assert.ok(checkSource(root).errors.some(error => error.includes('unresolved merge conflict')));
});
