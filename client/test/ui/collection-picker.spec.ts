import { expect, test, type Page } from '@playwright/test'
import { responses } from './client-fixtures'

// The picker is shared by the page editor, the admin collection dialogs and the
// menu editor, so it is exercised here through the page editor alone.
const child = { id: 'child', name: 'Child collection', public: true, canEdit: true, children: [], files: [], sampleFiles: [], numberOfFiles: 0, parent: null, parentId: 'parent', synchronized: false, invitations: [], limitedToGroupIds: [], page: null }
const parent = { ...child, id: 'parent', name: 'Parent collection', parentId: null, children: [child] }
const listBlock = { id: 'block-list', type: 'collections', pageId: 'page-1', position: 0, size: 'full', data: { title: null, layout: null, collectionsId: null } }
const subject = {
  ...child, id: 'campaign', name: 'Autumn essentials', ownerId: 'preview-user',
  page: { id: 'page-1', name: null, blocks: [listBlock], assets: { uploads: {}, files: {}, collections: {}, pages: {} } },
}

async function fixture(page: Page) {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.context().addCookies([{ name: 'dam_token', value: 'local-preview-fixture', domain: '127.0.0.1', path: '/' }])
  await page.route('**/trpc/**', async route => {
    const name = new URL(route.request().url()).pathname.split('/trpc/')[1]
    let data: unknown = responses[name] ?? []
    if (name === 'collection.findById') data = subject
    if (name === 'collection.tree') data = [parent]
    await route.fulfill({ json: { result: { data } } })
  })
  return { errors }
}

// A global style set the padding on every option, which overrode the padding
// the library applies one step per level, so every collection looked like a
// root and the tree could not be read.
test('the collection picker indents a child under its parent', async ({ page }) => {
  const { errors } = await fixture(page)
  await page.goto('/collections/campaign/edit')

  const block = page.locator('[data-block-index="0"]')
  await block.hover()
  await block.getByRole('button', { name: 'Block settings' }).click()
  await page.getByRole('dialog').locator('.vue-treeselect__control').click()

  const parentOption = page.locator('.vue-treeselect__option', { hasText: 'Parent collection' }).first()
  await expect(parentOption).toBeVisible()
  await parentOption.locator('.vue-treeselect__option-arrow-container').click()

  const childOption = page.locator('.vue-treeselect__option', { hasText: 'Child collection' }).first()
  await expect(childOption).toBeVisible()

  const parentBox = await parentOption.locator('.vue-treeselect__label').boundingBox()
  const childBox = await childOption.locator('.vue-treeselect__label').boundingBox()
  expect(childBox!.x).toBeGreaterThan(parentBox!.x + 10)
  expect(errors).toEqual([])
})

// Collections chosen from elsewhere in the library used to render as blank
// cards, because they were read from the collection tree, which is built
// without the sample files a card previews.
test('a collection chosen from elsewhere shows its preview', async ({ page }) => {
  const preview = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2240%22 height=%2240%22%3E%3Crect width=%2240%22 height=%2240%22 fill=%22%23c33%22/%3E%3C/svg%3E'
  const chosen = {
    id: 'outside', name: 'Outside collection', numberOfFiles: 3, draft: false, canEdit: false,
    thumbnailURL: null, sampleFiles: [{ id: 'sample-1', name: 'One.jpg', thumbnailURL: preview }],
  }
  const withChoice = {
    ...subject,
    page: {
      ...subject.page,
      blocks: [{ ...listBlock, data: { title: null, layout: 'grid', collectionsId: ['outside'] } }],
      assets: { uploads: {}, files: {}, collections: { outside: chosen }, pages: {} },
    },
  }
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.context().addCookies([{ name: 'dam_token', value: 'local-preview-fixture', domain: '127.0.0.1', path: '/' }])
  await page.route('**/trpc/**', async route => {
    const name = new URL(route.request().url()).pathname.split('/trpc/')[1]
    let data: unknown = responses[name] ?? []
    if (name === 'collection.findById') data = withChoice
    if (name === 'collection.tree') data = [parent]
    await route.fulfill({ json: { result: { data } } })
  })

  await page.goto('/collections/campaign')
  await expect(page.getByText('Outside collection')).toBeVisible()
  await expect(page.locator(`img[src="${preview}"]`)).toBeVisible()
  expect(errors).toEqual([])
})

// Choosing a collection used to leave the block empty until the page was
// saved, because its card was only resolved when the page was read back.
test('a collection appears in the block as soon as it is chosen', async ({ page }) => {
  const preview = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2240%22 height=%2240%22%3E%3Crect width=%2240%22 height=%2240%22 fill=%22%2339c%22/%3E%3C/svg%3E'
  const card = {
    id: 'child', name: 'Child collection', numberOfFiles: 2, draft: false, canEdit: false,
    thumbnailURL: null, sampleFiles: [{ id: 'sample-1', name: 'One.jpg', thumbnailURL: preview }],
  }
  const saves: any[] = []
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.context().addCookies([{ name: 'dam_token', value: 'local-preview-fixture', domain: '127.0.0.1', path: '/' }])
  await page.route('**/trpc/**', async route => {
    const name = new URL(route.request().url()).pathname.split('/trpc/')[1]
    let data: unknown = responses[name] ?? []
    if (name === 'collection.findById') data = subject
    if (name === 'collection.tree') data = [parent]
    if (name === 'page.collectionPreviews') data = { child: card }
    if (name === 'page.save') saves.push(route.request().postDataJSON())
    await route.fulfill({ json: { result: { data } } })
  })

  await page.goto('/collections/campaign/edit')
  const block = page.locator('[data-block-index="0"]')
  await block.hover()
  await block.getByRole('button', { name: 'Block settings' }).click()
  await page.getByRole('dialog').locator('.vue-treeselect__control').click()

  const parentOption = page.locator('.vue-treeselect__option', { hasText: 'Parent collection' }).first()
  await parentOption.locator('.vue-treeselect__option-arrow-container').click()
  await page.locator('.vue-treeselect__option', { hasText: 'Child collection' }).first().click()

  await expect(block.getByText('Child collection')).toBeVisible()
  await expect(block.locator(`img[src="${preview}"]`)).toBeVisible()
  expect(saves).toEqual([])
  expect(errors).toEqual([])
})

// Picking the collection the page belongs to would put a card on the page
// leading back to itself.
test('the collection being edited cannot be chosen as one of its own cards', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.context().addCookies([{ name: 'dam_token', value: 'local-preview-fixture', domain: '127.0.0.1', path: '/' }])
  await page.route('**/trpc/**', async route => {
    const name = new URL(route.request().url()).pathname.split('/trpc/')[1]
    let data: unknown = responses[name] ?? []
    if (name === 'collection.findById') data = subject
    // The page's own collection sits in the tree, with a child of its own.
    if (name === 'collection.tree') data = [{ ...subject, children: [child] }]
    await route.fulfill({ json: { result: { data } } })
  })

  await page.goto('/collections/campaign/edit')
  const block = page.locator('[data-block-index="0"]')
  await block.hover()
  await block.getByRole('button', { name: 'Block settings' }).click()
  await page.getByRole('dialog').locator('.vue-treeselect__control').click()

  const itself = page.locator('.vue-treeselect__option', { hasText: 'Autumn essentials' }).first()
  await expect(itself).toHaveClass(/vue-treeselect__option--disabled/)

  // Its children stay reachable, which is why it is disabled and not removed.
  await itself.locator('.vue-treeselect__option-arrow-container').click()
  await expect(page.locator('.vue-treeselect__option', { hasText: 'Child collection' }).first()).toBeVisible()
  expect(errors).toEqual([])
})

// Clearing a custom selection otherwise means noticing the small cross in the
// field, and it is not obvious that emptying it restores the default.
test('a custom selection can be handed back to the sub-collections', async ({ page }) => {
  const card = {
    id: 'child', name: 'Child collection', numberOfFiles: 0, draft: false, canEdit: false,
    thumbnailURL: null, sampleFiles: [],
  }
  const chosen = {
    ...subject,
    page: {
      ...subject.page,
      blocks: [{ ...listBlock, data: { title: null, layout: null, collectionsId: ['child'] } }],
      assets: { uploads: {}, files: {}, collections: { child: card }, pages: {} },
    },
  }
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.context().addCookies([{ name: 'dam_token', value: 'local-preview-fixture', domain: '127.0.0.1', path: '/' }])
  await page.route('**/trpc/**', async route => {
    const name = new URL(route.request().url()).pathname.split('/trpc/')[1]
    let data: unknown = responses[name] ?? []
    if (name === 'collection.findById') data = chosen
    if (name === 'collection.tree') data = [parent]
    await route.fulfill({ json: { result: { data } } })
  })

  await page.goto('/collections/campaign/edit')
  const block = page.locator('[data-block-index="0"]')
  await block.hover()
  await block.getByRole('button', { name: 'Block settings' }).click()
  await expect(block.getByText('Child collection')).toBeVisible()

  const reset = page.getByRole('button', { name: 'Show the sub-collections instead' })
  await expect(reset).toBeVisible()
  await reset.click()

  await expect(reset).toHaveCount(0)
  await expect(block.getByText('Child collection')).toHaveCount(0)
  expect(errors).toEqual([])
})
