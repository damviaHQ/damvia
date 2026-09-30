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

// Isolated sample data: these tests never call a real Damvia API. Every
// screen starts from this library and a spec overrides what it is about.

const swatches = ['#e6e2dc', '#cfdbd4', '#ded5c9', '#dfdfe2']
const inks = ['#6c5d4d', '#354d45', '#c29570', '#585964']

// A packshot drawn as an SVG, so the thumbnails load without a network.
export function picture(index: number) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">`
    + `<rect width="800" height="600" fill="${swatches[index % 4]}"/>`
    + `<rect x="300" y="120" width="200" height="370" rx="20" fill="${inks[index % 4]}"/>`
    + `<rect x="320" y="265" width="160" height="110" fill="#faf8f4"/>`
    + `<text x="400" y="310" text-anchor="middle" fill="#333" font-family="sans-serif" font-size="23">STUDIO</text>`
    + `<text x="400" y="340" text-anchor="middle" fill="#555" font-family="sans-serif" font-size="12">ESSENTIALS / ${index + 1}</text>`
    + `</svg>`
  return 'data:image/svg+xml,' + encodeURIComponent(svg)
}

export const assetType = {
  id: 'photo',
  name: 'Photography',
  defaultDisplay: 'grid',
  attributes: [],
  productAttributes: [],
  listDisplayItems: ['size', 'dimensions', 'format'],
}

const fileNames = [
  'Campaign — Sand.jpg',
  'Botanical — Front.jpg',
  'Essentials — Detail.jpg',
  'Studio — Edition.jpg',
  'Campaign — Packaging.jpg',
  'Botanical — Collection.jpg',
  'Essentials — Natural.jpg',
  'Studio — Hero.jpg',
]

export const files = fileNames.map((name, index) => ({
  id: `file-${index}`,
  name,
  size: '2400000',
  dimensions: { width: 800, height: 600 },
  updatedAt: '2026-09-01T10:00:00Z',
  createdAt: '2026-09-01T10:00:00Z',
  mimeType: 'image/jpeg',
  thumbnailURL: picture(index),
  fileURL: picture(index),
  collectionId: 'campaign',
  assetTypeId: 'photo',
  assetType,
  attributes: [],
  licenses: [],
}))

export type SampleFile = typeof files[number]

export const collection = {
  id: 'campaign',
  name: 'Autumn essentials',
  description: 'Campaign photography, product images and approved brand assets.',
  files,
  children: [] as unknown[],
  canEdit: false,
  synchronized: true,
  page: null as unknown,
  parent: { id: 'library', name: 'Brand library', parent: null },
  licenses: [],
  isPublic: true,
}

export const user = {
  id: 'preview-user',
  name: 'Alex Morgan',
  email: 'alex@example.test',
  role: 'member',
  approved: true,
  emailVerified: true,
}

export const env = {
  appName: 'Studio Library',
  regions: [],
  passwordLessAuthentication: false,
  recordLabel: { singular: 'Product', plural: 'Products' },
}

export const menuItems = ['Autumn essentials', 'Brand guidelines', 'Product photography', 'Social media'].map((name, index) => ({
  id: `menu-${index}`,
  type: 'collection',
  hasAccess: true,
  collectionId: index ? `collection-${index}` : 'campaign',
  collectionName: name,
  children: [],
  position: index,
}))

// An empty search: the shape the search screens expect, with nothing found.
export const emptySearch = {
  total: 0,
  page: 1,
  totalPages: 0,
  previousPage: null,
  nextPage: null,
  results: [],
  facets: { assetTypes: {}, fileTypes: {}, extensions: {}, recordViews: {}, attributes: {}, metadata: {}, metadataRanges: {}, variantAxes: {} },
  rangeResults: [],
  rangeTotal: 0,
}

// What the administration shows in its sidebar and on its dashboard.
export const dashboardSummary = {
  assets: { byStatus: { up_to_date: 120 } },
  users: { total: 8, pendingApproval: 0, maintenanceContacts: 1 },
  downloads: { last7DaysByStatus: { completed: 12 } },
  collections: { total: 6 },
  jobs: { downloading: 0, measuring: 0 },
  storage: { usedBytes: 1024, quotaBytes: 10240, percent: 10, serverContactEmails: [], disk: null },
  recentUsers: [],
  recentInvitations: [],
  recentFiles: [],
  recentDownloads: [],
  sync: { paused: false },
  sources: [{ id: 'source-1', name: 'Dropbox', state: 'ok', lastSyncedAt: null }],
}

// The answers every screen of the library gets unless a spec says otherwise.
export const defaults: Record<string, unknown> = {
  'env': env,
  'user.me': user,
  'settings.getClientLogo': { imageUrl: null },
  'settings.getBrandTheme': { accentColor: null, brandName: null },
  'collection.tree': [],
  'collection.ListPrivateCollections': [],
  'collection.findById': collection,
  'collection.search': emptySearch,
  'collection.searchNotFound': [],
  'menuItem.list': menuItems,
  'favorite.list': [],
  'favorite.listCollections': [],
  'assetType.list': [assetType],
  'download.list': [],
  'recordAttribute.listFacets': [],
  'metadataField.listFacets': [],
  'variantAxis.listFacets': [],
  'asset.listRecordViews': [],
  'analytics.trackView': null,
  'catalogue.fileRecords': { keyColumnName: null, cardTitleField: null, fields: [], records: [], ranges: [] },
  'settings.getAuthBackgroundImage': { imageUrl: null, exists: false },
  // The administration layout, for admins and managers.
  'dashboard.summary': dashboardSummary,
  'settings.getAdminBranding': { useClientLogo: false },
  'collection.listOrphaned': [],
  'collection.treeAdmin': [],
  'enrichment.badges': { unmatched: 0, unnamedAxes: 0 },
  'group.list': [],
  'page.list': [],
  'asset.tree': [],
}
