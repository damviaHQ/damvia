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
import { existsSync, realpathSync, readFileSync } from 'node:fs';
import path from 'node:path';

export function validDate(value) {
  if (value instanceof Date) return Number.isFinite(value.getTime()) && value.toISOString().endsWith('T00:00:00.000Z');
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00.000Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function validateSourceDate(source) {
  const frontmatter = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
  const value = frontmatter?.match(/^lastUpdated:\s*(["']?)(\d{4}-\d{2}-\d{2})\1\s*(?:#.*)?$/m)?.[2];
  if (!validDate(value)) throw new Error('lastUpdated must be a real YYYY-MM-DD date in frontmatter');
}

// Resolve the Markdown file first: index.md links cannot be resolved against a
// slashless published URL, and removing .md alone leaves the wrong directory.
export function rewriteDocLink(url, source, docsRoot) {
  if (/^(?:[a-z][a-z\d+.-]*:|\/|#)/i.test(url)) return url;
  const match = url.match(/^([^?#]+\.(?:md|mdx))([?#].*)?$/i);
  if (!match) return url;
  const target = path.resolve(path.dirname(source), decodeURIComponent(match[1]));
  const relative = path.relative(docsRoot, target);
  if (relative === '..' || relative.startsWith('../') || path.isAbsolute(relative)) throw new Error(`Documentation link escapes root: ${url}`);
  if (relative.split(path.sep).some(part => part.startsWith('_') || part === 'README.md')) throw new Error(`Documentation link targets unpublished content: ${url}`);
  if (!existsSync(target)) throw new Error(`Missing documentation link target: ${url}`);
  const route = relative.split(path.sep).join('/').replace(/\.(md|mdx)$/i, '').replace(/(^|\/)index$/, '').replace(/\/$/, '');
  return '/docs' + (route ? '/' + route.split('/').map(encodeURIComponent).join('/') : '') + (match[2] ?? '');
}

export default function remarkDocLinks({ docsRoot }) {
  const root = realpathSync(docsRoot);
  return (tree, file) => {
    if (!file.path) return;
    const source = realpathSync(file.path);
    const relative = path.relative(root, source);
    if (relative.startsWith('../') || relative === '..' || path.isAbsolute(relative)) return;
    validateSourceDate(readFileSync(source, 'utf8'));
    const walk = node => {
      if (node.type === 'link' || node.type === 'definition') node.url = rewriteDocLink(node.url, source, root);
      for (const child of node.children ?? []) walk(child);
    };
    walk(tree);
  };
}
