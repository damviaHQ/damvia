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
import { expect, test, type MockTrpc } from './lib/trpc'

const bannerKey = 'blocks/page-1/11111111-1111-4111-8111-111111111111'
const bannerUrl = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22600%22 height=%22200%22%3E%3Crect width=%22600%22 height=%22200%22 fill=%22%23666%22/%3E%3C/svg%3E'
const emptyAssets = { uploads: { [bannerKey]: bannerUrl }, files: {}, collections: {}, pages: {} }
const textBlock = { id: 'block-text', type: 'text', pageId: 'page-1', position: 0, size: 'full', data: { html: '<p>Welcome</p>' } }
const imageBlock = { id: 'block-image', type: 'image', pageId: 'page-1', position: 1, size: 'half', data: { media: null, height: 'medium', alt: '', caption: '', link: null } }
const heroBlock = { id: 'block-hero', type: 'hero', pageId: 'page-1', position: 3, size: 'full', data: { media: { source: 'upload', s3key: bannerKey }, focus: { x: 50, y: 50 }, title: 'Autumn', subtitle: '', button: null } }
const listBlock = { id: 'block-list', type: 'collections', pageId: 'page-1', position: 2, size: 'full', data: { title: null, layout: null, collectionsId: null } }
const filesBlock = { id: 'block-files', type: 'files', pageId: 'page-1', position: 0, size: 'full', data: { title: null, layout: null, masonrySize: null, collectionId: null } }
const libraryFile = { id: 'file-1', name: 'Campaign.jpg', mimeType: 'image/jpeg', thumbnailURL: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22400%22 height=%22100%22%3E%3Crect width=%22400%22 height=%22100%22 fill=%22%23888%22/%3E%3C/svg%3E', fileURL: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22400%22 height=%22100%22%3E%3Crect width=%22400%22 height=%22100%22 fill=%22%23444%22/%3E%3C/svg%3E', assetTypeId: 'photo', attributes: [], licenses: [], size: '1000', collectionId: 'campaign', createdAt: '2026-09-01T10:00:00Z', updatedAt: '2026-09-01T10:00:00Z', dimensions: { width: 400, height: 100 } }
const collection = {
  id: 'campaign', name: 'Autumn essentials', public: true, ownerId: 'preview-user', canEdit: true,
  children: [], files: [], sampleFiles: [], numberOfFiles: 0, parent: null, parentId: null, synchronized: false,
  invitations: [], limitedToGroupIds: [],
  page: { id: 'page-1', name: null, blocks: [textBlock, imageBlock, listBlock, heroBlock], assets: emptyAssets },
}

// A collection whose layout has never been arranged has no page of its own.
async function fixture(mockTrpc: MockTrpc, { withPage = true, blocks }: { withPage?: boolean; blocks?: any[] } = {}) {
  const page1 = blocks ? { ...collection.page, blocks } : collection.page
  const subject = withPage ? { ...collection, page: page1 } : { ...collection, page: null }
  const api = await mockTrpc({
    'collection.findById': subject,
    'collection.tree': [subject],
    'page.createForCollection': { id: 'page-1', name: null, blocks: [], assets: emptyAssets },
    'page.remove': { id: 'page-1', name: null, blocks: [], assets: emptyAssets },
    'collection.search': { total: 1, page: 1, totalPages: 1, previousPage: null, nextPage: null, facets: {}, results: [libraryFile] },
    'page.save': (body: { blocks: any[] }) => ({
      id: 'page-1', name: null, assets: emptyAssets,
      blocks: body.blocks.map((block, index) => ({ ...block, id: block.id ?? `new-${index}`, pageId: 'page-1', position: index })),
    }),
  })
  return {
    api,
    get saves() { return api.inputs('page.save') },
    get creates() { return api.inputs('page.createForCollection') },
    get removes() { return api.inputs('page.remove') },
  }
}

test('the page editor is a screen of its own, with the block library in place of the menu', async ({ page, mockTrpc }) => {
  await fixture(mockTrpc)
  await page.goto('/collections/campaign/edit')

  await expect(page.getByRole('heading', { name: 'Editing Autumn essentials collection' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Add content' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Banner' })).toBeVisible()
  // The navigation tree belongs to the reading screens, not to the editor.
  await expect(page.getByRole('navigation', { name: 'Collections' })).toHaveCount(0)
  await expect(page.getByText('Welcome')).toBeVisible()
})

test('a block is added, resized and saved, and only then does the page stop being dirty', async ({ page, mockTrpc }) => {
  const run = await fixture(mockTrpc)
  await page.goto('/collections/campaign/edit')

  await expect(page.getByText('Saved', { exact: true })).toBeVisible()
  const save = page.getByRole('button', { name: 'Save', exact: true })
  await expect(save).toBeDisabled()

  await page.getByRole('button', { name: 'Banner' }).click()
  await expect(page.getByText('Unsaved changes')).toBeVisible()
  await expect(save).toBeEnabled()

  // Width is the one layout choice an author makes, and it is one click.
  const banner = page.locator('[data-block-index="4"]')
  await banner.hover()
  await banner.getByRole('button', { name: 'Half width' }).click()
  await expect(banner.getByRole('button', { name: 'Half width' })).toHaveAttribute('aria-pressed', 'true')

  await save.click()
  await expect(page.getByText('Saved', { exact: true })).toBeVisible()
  await expect(save).toBeDisabled()
  expect(run.saves).toHaveLength(1)
  expect(run.saves[0].blocks.map((block: any) => [block.type, block.size])).toEqual([
    ['text', 'full'], ['image', 'half'], ['collections', 'full'], ['hero', 'full'], ['hero', 'half'],
  ])
})

test('a collection with no layout of its own opens on the default one, and is only created when saved', async ({ page, mockTrpc }) => {
  const run = await fixture(mockTrpc, { withPage: false })
  await page.goto('/collections/campaign/edit')

  // What readers already get: the sub-collections, then the files.
  await expect(page.locator('[data-block-index="0"]')).toContainText('Collections')
  await expect(page.locator('[data-block-index="1"]')).toContainText('Files')
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled()
  expect(run.creates).toEqual([])

  await page.getByRole('button', { name: 'Text Titles and paragraphs' }).click()
  await page.getByRole('button', { name: 'Save', exact: true }).click()

  await expect(page.getByText('Unsaved changes')).toHaveCount(0)
  expect(run.creates).toHaveLength(1)
  expect(run.saves[0].blocks.map((block: any) => block.type)).toEqual(['collections', 'files', 'text'])
})

test('leaving a collection that never had a layout writes nothing', async ({ page, mockTrpc }) => {
  const run = await fixture(mockTrpc, { withPage: false })
  await page.goto('/collections/campaign/edit')

  await page.getByRole('button', { name: 'Exit' }).click()
  await expect(page).toHaveURL(/\/collections\/campaign$/)
  expect(run.creates).toEqual([])
  expect(run.saves).toEqual([])
})

test('a page can be reset to the default layout from the editor', async ({ page, mockTrpc }) => {
  const run = await fixture(mockTrpc)
  await page.goto('/collections/campaign/edit')

  await page.locator('header').getByRole('button', { name: 'Reset to default layout' }).click()
  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toContainText('Reset to the default layout?')
  await dialog.getByRole('button', { name: 'Reset to default layout' }).click()

  await expect(page).toHaveURL(/\/collections\/campaign$/)
  expect(run.removes).toEqual([{ pageId: 'page-1' }])
})

test('blocks cannot be browsed while the page is being edited', async ({ page, mockTrpc }) => {
  await fixture(mockTrpc)
  await page.goto('/collections/campaign/edit')

  // A listing is arranged, not used: its links and checkboxes are inert.
  const listing = page.locator('[data-block-index="2"] [inert]')
  await expect(listing).toHaveCount(1)
})

test('an empty listing explains what will fill it rather than saying nothing was found', async ({ page, mockTrpc }) => {
  await fixture(mockTrpc)
  await page.goto('/collections/campaign/edit')

  const block = page.locator('[data-block-index="2"]')
  await expect(block).toContainText('Collections')
  await expect(block).toContainText('appears as a card')
  await expect(block).toContainText('sub-collections of this collection')
  await expect(block).not.toContainText('No collections found')
})

test('a files block can be tiled as masonry, at a size its author sets', async ({ page, mockTrpc }) => {
  const run = await fixture(mockTrpc, { blocks: [filesBlock] })
  await page.goto('/collections/campaign/edit')

  const block = page.locator('[data-block-index="0"]')
  await block.hover()
  await block.getByRole('button', { name: 'Block settings' }).click()
  const panel = page.getByRole('dialog')

  // The size only matters once the tiling is chosen, so it appears with it.
  await expect(panel.getByRole('slider')).toHaveCount(0)
  await panel.getByLabel('Display').click()
  await page.getByRole('option', { name: 'Masonry' }).click()
  const slider = panel.getByRole('slider')
  await expect(slider).toBeVisible()
  await expect(panel).toContainText('Large')

  await slider.focus()
  await page.keyboard.press('ArrowLeft')
  await expect(panel).toContainText('Medium')

  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect.poll(() => run.saves.length).toBe(1)
  expect(run.saves[0].blocks[0].data).toMatchObject({ layout: 'masonry', masonrySize: 2 })
})

test('a picture chosen from the library shows at once, before the page is saved', async ({ page, mockTrpc }) => {
  const run = await fixture(mockTrpc)
  await page.goto('/collections/campaign/edit')

  const imageBlockFrame = page.locator('[data-block-index="1"]')
  await imageBlockFrame.getByRole('button', { name: 'Add a picture' }).click()
  await page.getByRole('button', { name: 'Campaign.jpg' }).click()

  await expect(imageBlockFrame.locator('img')).toBeVisible()
  // Library originals are print-resolution: a page draws the rendition instead.
  await expect(imageBlockFrame.locator('img')).toHaveAttribute('src', libraryFile.thumbnailURL)

  // The control sits in the corner of the picture and is there to be seen,
  // with no hovering: the pointer has not moved since the page loaded.
  const change = imageBlockFrame.getByRole('button', { name: 'Change picture' })
  await expect(change).toBeVisible()
  await expect(change).toHaveCSS('opacity', '1')
  const picture = await imageBlockFrame.locator('img').boundingBox()
  const button = await change.boundingBox()
  expect(button!.x).toBeGreaterThanOrEqual(picture!.x)
  expect(button!.y).toBeGreaterThanOrEqual(picture!.y)
  expect(button!.y + button!.height).toBeLessThanOrEqual(picture!.y + picture!.height)
  expect(run.saves).toEqual([])
})

test('a picture is made taller or shorter on the picture itself, and the height is saved', async ({ page, mockTrpc }) => {
  const run = await fixture(mockTrpc)
  await page.goto('/collections/campaign/edit')

  const imageBlockFrame = page.locator('[data-block-index="1"]')
  await imageBlockFrame.getByRole('button', { name: 'Add a picture' }).click()
  await page.getByRole('button', { name: 'Campaign.jpg' }).click()

  // The fixed sizes in the settings menu are gone; the handle replaces them.
  await imageBlockFrame.hover()
  await imageBlockFrame.getByRole('button', { name: 'Block settings' }).click()
  await expect(page.getByRole('dialog')).not.toContainText('Size on the page')
  await page.keyboard.press('Escape')

  const handle = imageBlockFrame.getByRole('slider', { name: 'Picture height' })
  await handle.focus()
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowUp')
  const height = Number(await handle.getAttribute('aria-valuenow'))
  expect(height).toBeLessThan(420)

  await page.getByRole('button', { name: 'Save' }).click()
  await expect.poll(() => run.saves.length).toBe(1)
  const saved = run.saves[0].blocks.find((block: any) => block.type === 'image')
  expect(saved.data.height).toBe(height)
})

test('the settings menu stays anchored to its block when the pointer enters it', async ({ page, mockTrpc }) => {
  await fixture(mockTrpc)
  await page.goto('/collections/campaign/edit')

  const block = page.locator('[data-block-index="2"]')
  await block.hover()
  await block.getByRole('button', { name: 'Block settings' }).click()
  const panel = page.getByRole('dialog')
  await expect(panel).toBeVisible()

  // Moving onto the panel must not strand it in the corner of the screen.
  await panel.hover()
  await expect(panel).toBeVisible()
  const box = await panel.boundingBox()
  expect(box!.x).toBeGreaterThan(50)
  expect(box!.y).toBeGreaterThan(50)
})

test('discarding restores the page as it was last saved', async ({ page, mockTrpc }) => {
  const run = await fixture(mockTrpc)
  await page.goto('/collections/campaign/edit')

  await page.getByRole('button', { name: 'Text Titles and paragraphs' }).click()
  await expect(page.locator('[data-block-index="4"]')).toBeVisible()

  await page.getByRole('button', { name: 'Discard' }).click()
  await expect(page.locator('[data-block-index="4"]')).toHaveCount(0)
  await expect(page.getByText('Saved', { exact: true })).toBeVisible()
  expect(run.saves).toEqual([])
})

test('leaving with unsaved changes asks before losing them', async ({ page, mockTrpc }) => {
  await fixture(mockTrpc)
  await page.goto('/collections/campaign/edit')

  await page.getByRole('button', { name: 'Text Titles and paragraphs' }).click()
  await page.getByRole('button', { name: 'Exit' }).click()

  await expect(page.getByRole('alertdialog')).toContainText('Leave without saving?')
  await page.getByRole('button', { name: 'Keep editing' }).click()
  await expect(page).toHaveURL(/\/collections\/campaign\/edit$/)

  await page.getByRole('button', { name: 'Exit' }).click()
  await page.getByRole('button', { name: 'Leave without saving' }).click()
  await expect(page).toHaveURL(/\/collections\/campaign$/)
})

test('the banner picture controls stay out of the way of the block toolbar', async ({ page, mockTrpc }) => {
  await fixture(mockTrpc)
  await page.goto('/collections/campaign/edit')

  const banner = page.locator('[data-block-index="3"]')
  const move = banner.getByRole('button', { name: 'Move the picture' })
  const change = banner.getByRole('button', { name: 'Change the picture' })
  // No hovering: they are on the picture whatever the pointer is doing.
  await expect(move).toBeVisible()
  await expect(change).toBeVisible()
  await expect(move.locator('xpath=..')).toHaveCSS('opacity', '1')

  // They are compact and sit on the left, clear of the toolbar on the right.
  const bannerBox = await banner.boundingBox()
  const moveBox = await move.boundingBox()
  expect(moveBox!.width).toBeLessThan(40)
  expect(moveBox!.x).toBeLessThan(bannerBox!.x + bannerBox!.width / 2)
})

test('the part of a banner picture that stays in frame can be moved', async ({ page, mockTrpc }) => {
  const run = await fixture(mockTrpc)
  await page.goto('/collections/campaign/edit')

  const banner = page.locator('[data-block-index="3"]')
  await expect(banner.locator('img')).toHaveAttribute('style', /object-position:\s*50% 50%/)

  await banner.getByRole('button', { name: 'Move the picture' }).click()
  await expect(banner).toContainText('Drag the picture to choose what stays in frame')

  const frame = await banner.locator('img').boundingBox()
  await page.mouse.move(frame!.x + frame!.width / 2, frame!.y + frame!.height / 2)
  await page.mouse.down()
  await page.mouse.move(frame!.x + frame!.width * 0.8, frame!.y + frame!.height * 0.2, { steps: 5 })
  await page.mouse.up()

  await expect(banner.locator('img')).not.toHaveAttribute('style', /object-position:\s*50% 50%/)
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect.poll(() => run.saves.length).toBe(1)
  const hero = run.saves[0].blocks.find((block: any) => block.type === 'hero')
  expect(hero.data.focus.x).toBeGreaterThan(55)
  expect(hero.data.focus.y).toBeLessThan(45)
})

test('a picture is held to a chosen height instead of filling the page', async ({ page, mockTrpc }) => {
  await fixture(mockTrpc)
  await page.goto('/collections/campaign/edit')

  const imageBlock = page.locator('[data-block-index="1"]')
  await imageBlock.getByRole('button', { name: 'Add a picture' }).click()
  await page.getByRole('button', { name: 'Campaign.jpg' }).click()

  const picture = imageBlock.locator('img')
  await expect(picture).toHaveAttribute('style', /max-height:\s*420px/)
  await expect(picture).toHaveClass(/object-contain/)
})

test('the live page keeps the layout the author arranged, empty blocks included', async ({ page, mockTrpc }) => {
  await fixture(mockTrpc)

  await page.goto('/collections/campaign/edit')
  await expect(page.getByRole('heading', { name: /Editing/ })).toBeVisible()
  const arranged = await page.locator('[data-block-index]').count()
  expect(arranged).toBe(4)

  // The reader sees a cell for every block, in the same widths, even though
  // the picture and the collections list have nothing to show yet.
  await page.goto('/collections/campaign')
  const live = page.locator('.page-renderer > div')
  await expect(live).toHaveCount(arranged)
  await expect(live.nth(0)).toHaveClass(/col-span-6/)
  await expect(live.nth(1)).toHaveClass(/col-span-3/)
})

// A library needs its width, so the page takes whatever room it is given.
// What must not change is the arrangement: blocks placed side by side stay
// side by side however narrow the window gets, and their content reflows.
test('blocks placed side by side stay side by side at any width', async ({ page, mockTrpc }) => {
  const run = await fixture(mockTrpc)
  const sideBySide = [
    heroBlock,
    { ...imageBlock, position: 1, size: 'half' },
    { ...listBlock, id: 'block-list-2', position: 2, size: 'half' },
  ]
  run.api.set({ 'collection.findById': { ...collection, page: { ...collection.page, blocks: sideBySide } } })
  await page.goto('/collections/campaign')

  const cells = page.locator('.page-renderer > div')
  await expect(cells).toHaveCount(3)
  for (const width of [1400, 1000, 800]) {
    await page.setViewportSize({ width, height: 900 })
    const boxes = await cells.evaluateAll((nodes) =>
      nodes.map((node) => {
        const box = (node as HTMLElement).getBoundingClientRect()
        return { top: Math.round(box.top), width: Math.round(box.width) }
      })
    )
    // The picture and the collections block are both half width: same line,
    // and each one is about half of the full-width banner above them.
    expect(boxes[1].top).toBe(boxes[2].top)
    expect(boxes[1].width).toBeCloseTo(boxes[2].width, -1)
    expect(boxes[1].width).toBeLessThan(boxes[0].width * 0.55)
  }
})

test('a page uses the room it is given rather than a fixed width', async ({ page, mockTrpc }) => {
  await fixture(mockTrpc)
  await page.setViewportSize({ width: 1800, height: 900 })
  await page.goto('/collections/campaign')

  const read = await page.locator('.page-renderer').evaluate(
    (element) => (element as HTMLElement).getBoundingClientRect().width
  )
  expect(read).toBeGreaterThan(1200)
})

test('the Products source excludes file-only collections and keeps nested catalogues reachable', async ({ page, mockTrpc }) => {
  const productsBlock = { ...filesBlock, id: 'block-products', type: 'products' }
  const run = await fixture(mockTrpc, { blocks: [productsBlock, filesBlock] })
  run.api.set({ 'collection.tree': [
    { id: 'files-only', name: 'File-only source', catalogueMode: 'files', numberOfRecords: 0, children: [] },
    { id: 'folder', name: 'Catalogue folder', catalogueMode: 'files', numberOfRecords: 0, children: [
      { id: 'winter', name: 'Winter products', catalogueMode: 'products', numberOfRecords: 0, children: [] },
    ] },
    { id: 'mixed', name: 'Mixed source', catalogueMode: 'both', numberOfRecords: 0, children: [] },
    { id: 'personal', name: 'Personal products', catalogueMode: 'files', numberOfRecords: 2, children: [] },
  ], 'catalogue.list': { products: [], total: 0, fields: [], cardTitleField: null } })
  await page.goto('/collections/campaign/edit')
  const block = page.locator('[data-block-index="0"]')
  await block.hover()
  await block.getByRole('button', { name: 'Block settings' }).click()
  const panel = page.getByRole('dialog')
  await panel.locator('.vue-treeselect__control').click()
  await expect(panel.getByText('File-only source', { exact: true })).toHaveCount(0)
  await expect(panel.getByText('Mixed source', { exact: true })).toBeVisible()
  await expect(panel.getByText('Personal products', { exact: true })).toBeVisible()
  await expect(panel.locator('.vue-treeselect__option--disabled').filter({ hasText: 'Catalogue folder' })).toBeVisible()
  await panel.locator('.vue-treeselect__option').filter({ hasText: 'Catalogue folder' }).locator('.vue-treeselect__option-arrow-container').click()
  await panel.getByText('Winter products', { exact: true }).click()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect.poll(() => run.saves.at(-1)?.blocks[0].data.collectionId).toBe('winter')

  const files = page.locator('[data-block-index="1"]')
  await files.hover()
  await files.getByRole('button', { name: 'Block settings' }).click()
  await panel.locator('.vue-treeselect__control').click()
  await expect(panel.getByText('File-only source', { exact: true })).toBeVisible()
})
