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
