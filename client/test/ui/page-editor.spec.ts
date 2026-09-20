import { expect, test, type Page } from '@playwright/test'
import { responses } from './client-fixtures'

const bannerKey = 'blocks/page-1/11111111-1111-4111-8111-111111111111'
const bannerUrl = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22600%22 height=%22200%22%3E%3Crect width=%22600%22 height=%22200%22 fill=%22%23666%22/%3E%3C/svg%3E'
const emptyAssets = { uploads: { [bannerKey]: bannerUrl }, files: {}, collections: {}, pages: {} }
const textBlock = { id: 'block-text', type: 'text', pageId: 'page-1', position: 0, size: 'full', data: { html: '<p>Welcome</p>' } }
const imageBlock = { id: 'block-image', type: 'image', pageId: 'page-1', position: 1, size: 'half', data: { media: null, height: 'medium', alt: '', caption: '', link: null } }
const heroBlock = { id: 'block-hero', type: 'hero', pageId: 'page-1', position: 3, size: 'full', data: { media: { source: 'upload', s3key: bannerKey }, focus: { x: 50, y: 50 }, title: 'Autumn', subtitle: '', button: null } }
const listBlock = { id: 'block-list', type: 'collections', pageId: 'page-1', position: 2, size: 'full', data: { title: null, layout: null, collectionsId: null } }
const libraryFile = { id: 'file-1', name: 'Campaign.jpg', mimeType: 'image/jpeg', thumbnailURL: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22400%22 height=%22100%22%3E%3Crect width=%22400%22 height=%22100%22 fill=%22%23888%22/%3E%3C/svg%3E', fileURL: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22400%22 height=%22100%22%3E%3Crect width=%22400%22 height=%22100%22 fill=%22%23444%22/%3E%3C/svg%3E', assetTypeId: 'photo', attributes: [], licenses: [], size: '1000', collectionId: 'campaign', createdAt: '2026-09-01T10:00:00Z', updatedAt: '2026-09-01T10:00:00Z', dimensions: { width: 400, height: 100 } }
const collection = {
  id: 'campaign', name: 'Autumn essentials', public: true, ownerId: 'preview-user', canEdit: true,
  children: [], files: [], sampleFiles: [], numberOfFiles: 0, parent: null, parentId: null, synchronized: false,
  invitations: [], limitedToGroupIds: [],
  page: { id: 'page-1', name: null, blocks: [textBlock, imageBlock, listBlock, heroBlock], assets: emptyAssets },
}

async function fixture(page: Page) {
  const saves: any[] = []
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.context().addCookies([{ name: 'dam_token', value: 'local-preview-fixture', domain: '127.0.0.1', path: '/' }])
  await page.route('**/trpc/**', async route => {
    const name = new URL(route.request().url()).pathname.split('/trpc/')[1]
    let data: unknown = responses[name] ?? []
    if (name === 'collection.findById') data = collection
    if (name === 'collection.tree') data = [collection]
    if (name === 'collection.search') data = { total: 1, page: 1, totalPages: 1, previousPage: null, nextPage: null, facets: {}, results: [libraryFile] }
    if (name === 'page.save') {
      const body = route.request().postDataJSON()
      saves.push(body)
      data = {
        id: 'page-1', name: null, assets: emptyAssets,
        blocks: body.blocks.map((block: any, index: number) => ({ ...block, id: block.id ?? `new-${index}`, pageId: 'page-1', position: index })),
      }
    }
    await route.fulfill({ json: { result: { data } } })
  })
  return { saves, errors }
}

test('the page editor is a screen of its own, with the block library in place of the menu', async ({ page }) => {
  const { errors } = await fixture(page)
  await page.goto('/collections/campaign/edit')

  await expect(page.getByRole('heading', { name: 'Editing Autumn essentials collection' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Add content' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Banner' })).toBeVisible()
  // The navigation tree belongs to the reading screens, not to the editor.
  await expect(page.getByRole('navigation', { name: 'Collections' })).toHaveCount(0)
  await expect(page.getByText('Welcome')).toBeVisible()
  expect(errors).toEqual([])
})

test('a block is added, resized and saved, and only then does the page stop being dirty', async ({ page }) => {
  const { saves, errors } = await fixture(page)
  await page.goto('/collections/campaign/edit')

  await expect(page.getByText('Saved')).toBeVisible()
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
  await expect(page.getByText('Saved')).toBeVisible()
  await expect(save).toBeDisabled()
  expect(saves).toHaveLength(1)
  expect(saves[0].blocks.map((block: any) => [block.type, block.size])).toEqual([
    ['text', 'full'], ['image', 'half'], ['collections', 'full'], ['hero', 'full'], ['hero', 'half'],
  ])
  expect(errors).toEqual([])
})

test('blocks cannot be browsed while the page is being edited', async ({ page }) => {
  const { errors } = await fixture(page)
  await page.goto('/collections/campaign/edit')

  // A listing is arranged, not used: its links and checkboxes are inert.
  const listing = page.locator('[data-block-index="2"] [inert]')
  await expect(listing).toHaveCount(1)
  expect(errors).toEqual([])
})

test('an empty listing explains what will fill it rather than saying nothing was found', async ({ page }) => {
  const { errors } = await fixture(page)
  await page.goto('/collections/campaign/edit')

  const block = page.locator('[data-block-index="2"]')
  await expect(block).toContainText('Collections')
  await expect(block).toContainText('appears as a card')
  await expect(block).toContainText('sub-collections of this collection')
  await expect(block).not.toContainText('No collections found')
  expect(errors).toEqual([])
})

test('a picture chosen from the library shows at once, before the page is saved', async ({ page }) => {
  const { saves, errors } = await fixture(page)
  await page.goto('/collections/campaign/edit')

  const imageBlockFrame = page.locator('[data-block-index="1"]')
  await imageBlockFrame.getByRole('button', { name: 'Add a picture' }).click()
  await page.getByRole('button', { name: 'Campaign.jpg' }).click()

  await expect(imageBlockFrame.locator('img')).toBeVisible()
  expect(saves).toEqual([])
  expect(errors).toEqual([])
})

test('the settings menu stays anchored to its block when the pointer enters it', async ({ page }) => {
  const { errors } = await fixture(page)
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
  expect(errors).toEqual([])
})

test('discarding restores the page as it was last saved', async ({ page }) => {
  const { saves, errors } = await fixture(page)
  await page.goto('/collections/campaign/edit')

  await page.getByRole('button', { name: 'Text Titles and paragraphs' }).click()
  await expect(page.locator('[data-block-index="4"]')).toBeVisible()

  await page.getByRole('button', { name: 'Discard' }).click()
  await expect(page.locator('[data-block-index="4"]')).toHaveCount(0)
  await expect(page.getByText('Saved')).toBeVisible()
  expect(saves).toEqual([])
  expect(errors).toEqual([])
})

test('leaving with unsaved changes asks before losing them', async ({ page }) => {
  const { errors } = await fixture(page)
  await page.goto('/collections/campaign/edit')

  await page.getByRole('button', { name: 'Text Titles and paragraphs' }).click()
  await page.getByRole('button', { name: 'Exit' }).click()

  await expect(page.getByRole('alertdialog')).toContainText('Leave without saving?')
  await page.getByRole('button', { name: 'Keep editing' }).click()
  await expect(page).toHaveURL(/\/collections\/campaign\/edit$/)

  await page.getByRole('button', { name: 'Exit' }).click()
  await page.getByRole('button', { name: 'Leave without saving' }).click()
  await expect(page).toHaveURL(/\/collections\/campaign$/)
  expect(errors).toEqual([])
})

test('the part of a banner picture that stays in frame can be moved', async ({ page }) => {
  const { saves, errors } = await fixture(page)
  await page.goto('/collections/campaign/edit')

  const banner = page.locator('[data-block-index="3"]')
  await expect(banner.locator('img')).toHaveAttribute('style', /object-position:\s*50% 50%/)

  await banner.getByRole('button', { name: 'Move picture' }).click()
  await expect(banner).toContainText('Drag the picture to choose what stays in frame')

  const frame = await banner.locator('img').boundingBox()
  await page.mouse.move(frame!.x + frame!.width / 2, frame!.y + frame!.height / 2)
  await page.mouse.down()
  await page.mouse.move(frame!.x + frame!.width * 0.8, frame!.y + frame!.height * 0.2, { steps: 5 })
  await page.mouse.up()

  await expect(banner.locator('img')).not.toHaveAttribute('style', /object-position:\s*50% 50%/)
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  const hero = saves[0].blocks.find((block: any) => block.type === 'hero')
  expect(hero.data.focus.x).toBeGreaterThan(55)
  expect(hero.data.focus.y).toBeLessThan(45)
  expect(errors).toEqual([])
})

test('a picture is held to a chosen height instead of filling the page', async ({ page }) => {
  const { errors } = await fixture(page)
  await page.goto('/collections/campaign/edit')

  const imageBlock = page.locator('[data-block-index="1"]')
  await imageBlock.getByRole('button', { name: 'Add a picture' }).click()
  await page.getByRole('button', { name: 'Campaign.jpg' }).click()

  const picture = imageBlock.locator('img')
  await expect(picture).toHaveAttribute('style', /max-height:\s*420px/)
  await expect(picture).toHaveClass(/object-contain/)
  expect(errors).toEqual([])
})
