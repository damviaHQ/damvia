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
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { load, JSON_SCHEMA } from 'js-yaml';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { parse } from 'parse5';
import { validDate } from './remark-doc-links.mjs';
export { validDate };

export function walk(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(root, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}

export function visit(node, callback) {
  callback(node);
  for (const child of node.children ?? node.childNodes ?? []) visit(child, callback);
}

export function readPage(source) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) throw new Error('Missing or unclosed YAML frontmatter');
  return { frontmatter: load(match[1], { schema: JSON_SCHEMA }), body: source.slice(match[0].length) };
}

export function validateFrontmatter(data, filename) {
  const errors = [];
  for (const key of ['title', 'description']) {
    if (typeof data?.[key] !== 'string' || !data[key].trim()) errors.push(`${key} must be a non-empty string`);
  }
  if (!validDate(data?.lastUpdated)) errors.push('lastUpdated must be a real YYYY-MM-DD date');
  const order = data?.sidebar?.order;
  if (!Number.isInteger(order) || order < 1) errors.push('sidebar.order must be a positive integer');
  if (path.basename(filename) === 'index.md' && order !== 1) errors.push('index.md must have sidebar.order: 1');
  if (data?.slug !== undefined) errors.push('Custom slugs require updating the route resolver; currently unsupported');
  if (data?.draft !== undefined && typeof data.draft !== 'boolean') errors.push('draft must be a boolean');
  return errors;
}

export function markdownLinks(body) {
  const tree = fromMarkdown(body);
  const links = [];
  visit(tree, node => {
    if (['link', 'image', 'definition'].includes(node.type)) links.push(node.url);
  });
  return links;
}

export function localTarget(url, file, docsRoot) {
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(url)) return null;
  if (url.startsWith('/')) return null; // Published routes are checked after the website build.
  const pathname = decodeURIComponent(url.split(/[?#]/, 1)[0]);
  const target = path.resolve(path.dirname(file), pathname);
  const relative = path.relative(docsRoot, target);
  if (relative === '..' || relative.startsWith('../') || path.isAbsolute(relative)) throw new Error(`Link escapes docs: ${url}`);
  if (relative.split(path.sep).some(segment => segment.startsWith('_') || segment === 'README.md')) throw new Error(`Link targets unpublished content: ${url}`);
  return target;
}

export function checkSource(root) {
  const docsRoot = path.join(root, 'docs');
  const files = walk(docsRoot).filter(file => /\.mdx?$/.test(file) && !path.relative(docsRoot, file).split(path.sep).some(part => part.startsWith('_') || part === 'README.md'));
  const errors = [];
  const orders = new Set();
  for (const file of files) {
    try {
      const source = readFileSync(file, 'utf8');
      if (/^(?:<{7}|={7}|>{7})(?: |$)/m.test(source)) errors.push(`${file}: unresolved merge conflict`);
      const { frontmatter, body } = readPage(source);
      for (const error of validateFrontmatter(frontmatter, file)) errors.push(`${path.relative(root, file)}: ${error}`);
      const orderKey = `${path.dirname(file)}:${frontmatter?.sidebar?.order}`;
      if (orders.has(orderKey)) errors.push(`${file}: duplicate sidebar.order in group`);
      orders.add(orderKey);
      for (const link of markdownLinks(body)) {
        const target = localTarget(link, file, docsRoot);
        if (target && (!existsSync(target) || !statSync(target).isFile())) errors.push(`${file}: missing target ${link}`);
      }
    } catch (error) { errors.push(`${file}: ${error.message}`); }
  }
  const envDoc = readFileSync(path.join(docsRoot, 'reference/environment-variables.md'), 'utf8');
  const sourceFiles = ['server/src', 'client/src'].flatMap(dir => walk(path.join(root, dir))).concat(readdirSync(path.join(root, 'client'), { withFileTypes: true }).filter(entry => entry.isFile()).map(entry => path.join(root, 'client', entry.name))).filter(file => /\.(?:ts|js|mjs|vue)$/.test(file));
  const vars = new Set();
  for (const file of sourceFiles) {
    for (const match of readFileSync(file, 'utf8').matchAll(/(?:process\.env|import\.meta\.env)\.([A-Z][A-Z\d_]*)/g)) vars.add(match[1]);
  }
  const templates = readFileSync(path.join(root, 'server/.env.template'), 'utf8') + '\n' + readFileSync(path.join(root, 'client/.env.template'), 'utf8');
  const templateVars = new Set([...templates.matchAll(/^([A-Z][A-Z\d_]*)=/gm)].map(match => match[1]));
  for (const variable of vars) {
    if (!envDoc.includes('`' + variable + '`')) errors.push(`Environment reference missing ${variable}`);
    if (!templateVars.has(variable) && !['DEV', 'PROD', 'MODE', 'BASE_URL', 'SSR'].includes(variable)) errors.push(`Environment templates missing ${variable}`);
  }
  const jobsDoc = readFileSync(path.join(docsRoot, 'reference/background-jobs.md'), 'utf8');
  const queues = [...readFileSync(path.join(root, 'server/src/worker.ts'), 'utf8').matchAll(/name:\s*['"]([^'"]+)['"]/g)].map(match => match[1]);
  for (const queue of queues) if (!jobsDoc.includes('`' + queue + '`')) errors.push(`Queue reference missing ${queue}`);
  return { pages: files.length, variables: vars.size, queues: queues.length, errors };
}

export function checkHtml(dist, origin = 'https://damvia.com') {
  const pages = walk(path.join(dist, 'docs')).filter(file => file.endsWith('.html'));
  const cache = new Map();
  const read = file => {
    if (cache.has(file)) return cache.get(file);
    const ids = new Set(), hrefs = [];
    visit(parse(readFileSync(file, 'utf8')), node => {
      for (const attr of node.attrs ?? []) {
        if (attr.name === 'id') ids.add(attr.value);
        if (node.tagName === 'a' && attr.name === 'href') hrefs.push(attr.value);
      }
    });
    const result = { ids, hrefs };
    cache.set(file, result);
    return result;
  };
  const errors = [];
  let links = 0;
  for (const file of pages) {
    const route = '/' + path.relative(dist, file).split(path.sep).join('/').replace(/\/?index\.html$/, '').replace(/\.html$/, '');
    for (const href of read(file).hrefs) {
      try {
        const url = new URL(href, origin + (route || '/'));
        if (url.origin !== origin || !/^https?:$/.test(url.protocol)) continue;
        links++;
        const base = path.resolve(dist, '.' + decodeURIComponent(url.pathname));
        if (!base.startsWith(path.resolve(dist) + path.sep) && base !== path.resolve(dist)) throw new Error('Path outside build');
        const target = [base, base + '.html', path.join(base, 'index.html')].find(candidate => existsSync(candidate) && statSync(candidate).isFile());
        if (!target) throw new Error('Missing route');
        if (url.hash && target.endsWith('.html') && !read(target).ids.has(decodeURIComponent(url.hash.slice(1)))) throw new Error('Missing anchor');
      } catch (error) { errors.push(`${route}: ${href} (${error.message})`); }
    }
  }
  if (!pages.length) errors.push('No documentation HTML pages found');
  return { pages: pages.length, links, errors };
}
