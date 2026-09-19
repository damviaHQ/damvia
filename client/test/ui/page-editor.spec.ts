import { expect, test, type Page } from '@playwright/test'
import { responses } from './client-fixtures'

const emptyAssets = { uploads: {}, files: {}, collections: {}, pages: {} }
const textBlock = { id: 'block-text', type: 'text', pageId: 'page-1', position: 0, size: 'full', data: { html: '<p>Welcome</p>' } }
const imageBlock = { id: 'block-image', type: 'image', pageId: 'page-1', position: 1, size: 'half', data: { media: null, alt: '', caption: '', link: null } }
const collection = {
  id: 'campaign', name: 'Autumn essentials', public: true, ownerId: 'preview-user', canEdit: true,
  children: [], files: [], sampleFiles: [], numberOfFiles: 0, parent: null, parentId: null, synchronized: false,
  invitations: [], limitedToGroupIds: [],
  page: { id: 'page-1', name: null, blocks: [textBlock, imageBlock], assets: emptyAssets },
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
  const banner = page.locator('[data-block-index="2"]')
  await banner.hover()
  await banner.getByRole('button', { name: 'Half width' }).click()
  await expect(banner.getByRole('button', { name: 'Half width' })).toHaveAttribute('aria-pressed', 'true')

  await save.click()
  await expect(page.getByText('Saved')).toBeVisible()
  await expect(save).toBeDisabled()
  expect(saves).toHaveLength(1)
  expect(saves[0].blocks.map((block: any) => [block.type, block.size])).toEqual([
    ['text', 'full'], ['image', 'half'], ['hero', 'half'],
  ])
  expect(errors).toEqual([])
})

test('discarding restores the page as it was last saved', async ({ page }) => {
  const { saves, errors } = await fixture(page)
  await page.goto('/collections/campaign/edit')

  await page.getByRole('button', { name: 'Text Titles and paragraphs' }).click()
  await expect(page.locator('[data-block-index="2"]')).toBeVisible()

  await page.getByRole('button', { name: 'Discard' }).click()
  await expect(page.locator('[data-block-index="2"]')).toHaveCount(0)
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
