import { expect, test, type Page } from '@playwright/test'
import { DRESS, NAVY_M, setupShop, TROUSERS } from '../shared/checkoutShop'
import type { CartMock } from '../shared/products'
import { signedIn } from '../shared/session'

// Feature "Cart – Remove selected" (DELETE /cart/items with { itemIds }): one request for every ticked line, Undo puts them back one POST per line.

let cart: CartMock
const TROUSERS_VARIANT = TROUSERS.variants[0].id
const DRESS_VARIANT = DRESS.variants[0].id
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }

test.beforeEach(async ({ page }) => {
  ;({ cart } = await setupShop(page))
})

const bulkDeletes = (c: CartMock) => c.calls.filter((x) => x.method === 'DELETE' && x.itemId === null && x.body !== null)
const itemDeletes = (c: CartMock) => c.calls.filter((x) => x.method === 'DELETE' && x.itemId !== null)
const clears = (c: CartMock) => c.calls.filter((x) => x.method === 'DELETE' && x.itemId === null && x.body === null)
const posts = (c: CartMock) => c.calls.filter((x) => x.method === 'POST')
const idOf = (c: CartMock, variantId: string) => c.items.find((i) => i.variantId === variantId)!.id

// The tick lives in a label around the (visually hidden) checkbox, so a user clicks the label.
const tick = (page: Page, name: string) => page.locator('label', { has: page.getByRole('checkbox', { name: `Select ${name}` }) }).click()
const checkbox = (page: Page, name: string) => page.getByRole('checkbox', { name: `Select ${name}` })
const heading = (page: Page, name: string) => page.getByRole('heading', { name })
const removeDialog = (page: Page) => page.getByRole('dialog', { name: 'Remove selected pieces?' })

// On a phone, Remove selected lives in the bottom bar's edit mode; from sm up it is in the toolbar.
async function openRemoveDialog(page: Page) {
  const edit = page.getByRole('button', { name: 'Edit cart' })
  if (await edit.isVisible()) await edit.click()
  await page.getByRole('button', { name: 'Remove selected' }).click()
}

async function openCart(page: Page, lines: [string, number][]) {
  await signedIn(page)
  for (const [variantId, qty] of lines) cart.seed(variantId, qty)
  await page.goto('/cart')
  await expect(heading(page, 'Heritage Polo')).toBeVisible({ timeout: 15000 })
}

async function threeLines(page: Page) {
  await openCart(page, [
    [NAVY_M.id, 1],
    [TROUSERS_VARIANT, 2],
    [DRESS_VARIANT, 1],
  ])
  await expect(heading(page, 'Wool Trousers')).toBeVisible()
  await expect(heading(page, 'Garden Print Dress')).toBeVisible()
}

/** Stops the cart API's bulk DELETE and answers it with `handler` (counts every attempt). */
async function interceptBulk(page: Page, handler: (route: import('@playwright/test').Route) => Promise<void> | void) {
  const seen = { count: 0 }
  await page.route(
    (url) => url.origin !== 'http://localhost:5173' && url.pathname === '/cart/items',
    (route) => {
      const req = route.request()
      if (req.method() !== 'DELETE') return route.fallback()
      seen.count++
      return handler(route)
    },
  )
  return seen
}

const errorToast = (page: Page) => page.getByText(/Couldn't update your cart\. The request failed.*Check your connection, then try again\./)

test.describe('Cart – Remove selected', () => {
  test('Cancel sends nothing; confirming sends one bulk DELETE for the ticked lines only; Undo posts each line back', async ({ page }) => {
    await threeLines(page)
    const poloId = idOf(cart, NAVY_M.id)
    const trousersId = idOf(cart, TROUSERS_VARIANT)
    const dressId = idOf(cart, DRESS_VARIANT)

    await tick(page, 'Heritage Polo')
    await tick(page, 'Wool Trousers')
    await openRemoveDialog(page)
    const dialog = removeDialog(page)
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('Are you sure?')).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Remove 2 items' })).toBeVisible()

    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toBeHidden()
    for (const name of ['Heritage Polo', 'Wool Trousers', 'Garden Print Dress']) await expect(heading(page, name)).toBeVisible()
    expect(cart.calls.filter((c) => c.method === 'DELETE')).toHaveLength(0)
    await expect(checkbox(page, 'Heritage Polo')).toBeChecked() // the ticks survive a Cancel
    await expect(checkbox(page, 'Wool Trousers')).toBeChecked()

    // Confirm.
    await page.getByRole('button', { name: 'Remove selected' }).click()
    await dialog.getByRole('button', { name: 'Remove 2 items' }).click()
    await expect(page.getByText('Removed 2 items from cart')).toBeVisible()
    await expect(heading(page, 'Heritage Polo')).toHaveCount(0)
    await expect(heading(page, 'Wool Trousers')).toHaveCount(0)
    await expect(heading(page, 'Garden Print Dress')).toBeVisible()
    await expect(dialog).toBeHidden()

    const bulk = bulkDeletes(cart)
    expect(bulk).toHaveLength(1)
    expect(bulk[0].body).toEqual({ itemIds: expect.arrayContaining([poloId, trousersId]) })
    expect((bulk[0].body!.itemIds as string[]).slice().sort()).toEqual([poloId, trousersId].sort())
    expect(itemDeletes(cart)).toHaveLength(0)
    expect(clears(cart)).toHaveLength(0)
    expect(cart.items.map((i) => i.id)).toEqual([dressId])

    // Undo: one POST per removed line, then the lines are back.
    await page.getByRole('button', { name: 'Undo' }).click()
    await expect(page.getByText('Put your cart back')).toBeVisible()
    await expect(heading(page, 'Heritage Polo')).toBeVisible()
    await expect(heading(page, 'Wool Trousers')).toBeVisible()
    await expect(heading(page, 'Garden Print Dress')).toBeVisible()
    expect(posts(cart).map((c) => c.body)).toEqual([
      { variantId: NAVY_M.id, quantity: 1 },
      { variantId: TROUSERS_VARIANT, quantity: 2 },
    ])
    expect(cart.items.map((i) => [i.variantId, i.quantity]).sort()).toEqual(
      [
        [NAVY_M.id, 1],
        [TROUSERS_VARIANT, 2],
        [DRESS_VARIANT, 1],
      ].sort(),
    )
    expect(bulkDeletes(cart)).toHaveLength(1) // Undo did not delete anything more
    expect(itemDeletes(cart)).toHaveLength(0)
  })

  test('removing one ticked line names it in the toast', async ({ page }) => {
    await threeLines(page)
    await tick(page, 'Garden Print Dress')
    await openRemoveDialog(page)
    await removeDialog(page).getByRole('button', { name: 'Remove 1 item' }).click()
    await expect(page.getByText('Removed Garden Print Dress from cart')).toBeVisible()
    await expect(heading(page, 'Garden Print Dress')).toHaveCount(0)
    expect(bulkDeletes(cart).map((c) => c.body)).toEqual([{ itemIds: [expect.any(String)] }])
  })

  test('the dialog is pending while the server has not answered, and no toast shows until it does', async ({ page }) => {
    await threeLines(page)
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    const seen = await interceptBulk(page, async (route) => {
      await gate
      await route.fallback()
    })

    await tick(page, 'Heritage Polo')
    await tick(page, 'Wool Trousers')
    await openRemoveDialog(page)
    const dialog = removeDialog(page)
    await dialog.getByRole('button', { name: 'Remove 2 items' }).click()

    await expect.poll(() => seen.count).toBe(1)
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    await expect(dialog.getByRole('button', { name: /Remove 2 items/ })).toBeDisabled()
    // The close X and Escape do nothing while the request is out.
    await dialog.getByRole('button', { name: 'Close Remove selected pieces?' }).click()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeVisible()
    await expect(page.getByText(/^Removed .* from cart$/)).toHaveCount(0)
    await expect(heading(page, 'Heritage Polo')).toBeVisible()
    expect(cart.items).toHaveLength(3) // the request is still held

    release()
    await expect(page.getByText('Removed 2 items from cart')).toBeVisible()
    await expect(dialog).toBeHidden()
    await expect(heading(page, 'Heritage Polo')).toHaveCount(0)
    expect(seen.count).toBe(1) // no second request
    expect(bulkDeletes(cart)).toHaveLength(1)
    expect(cart.items.map((i) => i.variantId)).toEqual([DRESS_VARIANT])
  })

  for (const [label, fail] of [
    ['a 500', (route: import('@playwright/test').Route) => route.fulfill({ status: 500, json: { message: 'Internal server error' }, headers: CORS })],
    ['a dropped connection', (route: import('@playwright/test').Route) => route.abort('connectionreset')],
  ] as const) {
    test(`${label} keeps the lines and the ticks and shows an error toast`, async ({ page }) => {
      await threeLines(page)
      const seen = await interceptBulk(page, fail)

      await tick(page, 'Heritage Polo')
      await tick(page, 'Wool Trousers')
      await openRemoveDialog(page)
      await removeDialog(page).getByRole('button', { name: 'Remove 2 items' }).click()

      await expect(errorToast(page)).toBeVisible()
      await expect(removeDialog(page)).toBeHidden()
      for (const name of ['Heritage Polo', 'Wool Trousers', 'Garden Print Dress']) await expect(heading(page, name)).toBeVisible()
      await expect(page.getByText(/^Removed .* from cart$/)).toHaveCount(0)
      await expect(checkbox(page, 'Heritage Polo')).toBeChecked()
      await expect(checkbox(page, 'Wool Trousers')).toBeChecked()
      await expect(checkbox(page, 'Garden Print Dress')).not.toBeChecked()
      // Settled: still there after the cart reloads itself.
      await expect(page.getByText(/^Removed .* from cart$/)).toHaveCount(0)
      expect(seen.count).toBe(1)
      expect(itemDeletes(cart)).toHaveLength(0)
      expect(cart.items).toHaveLength(3)
    })
  }

  test('a 404 for the batch refetches once and removes only the ids still in the cart, with no error', async ({ page }) => {
    await threeLines(page)
    const poloId = idOf(cart, NAVY_M.id)
    const dressId = idOf(cart, DRESS_VARIANT)
    const trousersId = idOf(cart, TROUSERS_VARIANT)

    await tick(page, 'Heritage Polo')
    await tick(page, 'Garden Print Dress')
    await openRemoveDialog(page)
    cart.remove(dressId) // removed on another device while the dialog is open
    const before = cart.calls.length
    await removeDialog(page).getByRole('button', { name: 'Remove 2 items' }).click()

    // Only the polo was removed here; the dress went elsewhere, so it is not counted or put back.
    await expect(page.getByText('Removed Heritage Polo from cart')).toBeVisible()
    await expect(heading(page, 'Heritage Polo')).toHaveCount(0)
    await expect(heading(page, 'Garden Print Dress')).toHaveCount(0)
    await expect(heading(page, 'Wool Trousers')).toBeVisible()
    await expect(page.getByText(/Couldn't update your cart/)).toHaveCount(0)

    const after = cart.calls.slice(before).map((c) => [c.method, c.itemId, c.body])
    expect(after).toHaveLength(3)
    expect(after[0][0]).toBe('DELETE')
    expect((after[0][2] as { itemIds: string[] }).itemIds.slice().sort()).toEqual([poloId, dressId].sort())
    expect(after[1]).toEqual(['GET', null, null])
    expect(after[2]).toEqual(['DELETE', null, { itemIds: [poloId] }])
    expect(itemDeletes(cart)).toHaveLength(0)
    expect(cart.items.map((i) => i.id)).toEqual([trousersId])

    await page.getByRole('button', { name: 'Undo' }).click()
    await expect(page.getByText('Put your cart back')).toBeVisible()
    await expect(heading(page, 'Heritage Polo')).toBeVisible()
    await expect(heading(page, 'Garden Print Dress')).toHaveCount(0)
    expect(posts(cart).map((c) => c.body)).toEqual([{ variantId: NAVY_M.id, quantity: 1 }])
  })

  test('the single Remove on a row sends one bulk DELETE with one id', async ({ page }) => {
    await threeLines(page)
    const trousersId = idOf(cart, TROUSERS_VARIANT)

    // The kebab is visually hidden below sm until focused (swiping is the touch way), so focus it first.
    const kebab = page.getByRole('button', { name: 'More actions for Wool Trousers' })
    await kebab.focus()
    await kebab.click()
    await page.getByRole('menuitem', { name: 'Remove' }).click()

    await expect(page.getByText('Removed Wool Trousers from cart')).toBeVisible()
    await expect(heading(page, 'Wool Trousers')).toHaveCount(0)
    await expect(heading(page, 'Heritage Polo')).toBeVisible()
    await expect(heading(page, 'Garden Print Dress')).toBeVisible()
    expect(bulkDeletes(cart).map((c) => c.body)).toEqual([{ itemIds: [trousersId] }])
    expect(itemDeletes(cart)).toHaveLength(0)
    expect(cart.items).toHaveLength(2)
  })

  test('selecting every line and removing shows the empty cart', async ({ page }) => {
    await threeLines(page)
    const ids = cart.items.map((i) => i.id).sort()

    await page.locator('label', { has: page.getByRole('checkbox', { name: 'Select all items' }) }).click()
    await openRemoveDialog(page)
    await removeDialog(page).getByRole('button', { name: 'Remove 3 items' }).click()

    await expect(page.getByRole('heading', { name: 'Your cart is currently empty' })).toBeVisible()
    await expect(page.getByText('Removed 3 items from cart')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Cart, 0 items' })).toBeVisible()
    const bulk = bulkDeletes(cart)
    expect(bulk).toHaveLength(1)
    expect((bulk[0].body!.itemIds as string[]).slice().sort()).toEqual(ids)
    expect(clears(cart)).toHaveLength(0)
    expect(itemDeletes(cart)).toHaveLength(0)
    expect(cart.items).toHaveLength(0)
  })
})
