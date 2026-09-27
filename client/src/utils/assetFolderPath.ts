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

export type AssetFolderNode = {
  id: string
  name: string
  children?: AssetFolderNode[]
}

// Accepts what people paste from Finder, Explorer or a Dropbox link: quotes,
// backslashes, leading or trailing slashes, a https://www.dropbox.com/home/… URL.
export function pathSegments(input: string): string[] {
  let path = input.trim().replace(/^(['"`])(.*)\1$/s, '$2').trim()
  if (/^https?:\/\//i.test(path)) {
    try {
      path = new URL(path).pathname.replace(/^\/home(?=\/|$)/, '')
    } catch {
      return []
    }
  }
  if (/%[0-9a-f]{2}/i.test(path)) {
    try {
      path = decodeURIComponent(path)
    } catch {
      // keep the path as pasted
    }
  }
  return path.split(/[\\/]+/).map(segment => segment.trim()).filter(Boolean)
}

const findChild = (folder: AssetFolderNode, name: string) => {
  const children = folder.children ?? []
  return children.find(child => child.name.trim() === name)
    ?? children.find(child => child.name.trim().toLowerCase() === name.toLowerCase())
}

const walk = (root: AssetFolderNode, segments: string[]) => {
  const trail: AssetFolderNode[] = []
  let current = root
  for (const segment of segments) {
    const next = findChild(current, segment)
    if (!next) break
    trail.push(next)
    current = next
  }
  return trail
}

// Resolves a pasted path inside one cloud source. The path may start at the
// source root, include the source name, or carry the provider path above the
// source (/Team/Brand/SS26/…): leading segments are dropped until the rest
// matches. Returns the deepest folder reached and the segments left unmatched.
export function resolveAssetFolderPath(root: AssetFolderNode, input: string): { folder: AssetFolderNode, missing: string[] } | null {
  const segments = pathSegments(input)
  if (!segments.length) return null

  let best = { folder: root, matched: 0, missing: segments }
  for (let start = 0; start < segments.length; start++) {
    const rest = segments.slice(start)
    const trail = walk(root, rest)
    if (trail.length === rest.length) return { folder: trail[trail.length - 1], missing: [] }
    if (trail.length > best.matched) best = { folder: trail[trail.length - 1], matched: trail.length, missing: rest.slice(trail.length) }
  }
  if (!best.matched && segments[segments.length - 1].toLowerCase() === root.name.trim().toLowerCase()) return { folder: root, missing: [] }
  return { folder: best.folder, missing: best.missing }
}
