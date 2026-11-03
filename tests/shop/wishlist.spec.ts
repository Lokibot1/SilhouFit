import { expect, test, type Page, type Request } from '@playwright/test'
import { DEMO, mockAuth, signedIn } from '../shared/session'
import { mockCart, mockProducts, seedCatalogue, type ProductsMock } from '../shared/products'

// The wishlist on the API: GET /wishlist/ids, POST /wishlist { productId }, DELETE /wishlist/:productId, answered by a small in-memory
// server below. Signed in is the seeded session (signedIn) or a real sign-in through the mocked Supabase (DEMO only).
// Guests keep their list in localStorage 'silhoufit-wishlist'. Products come from seedCatalogue(): Linen Shirt, Wool Trousers, Cotton Tee.

const API = 'http://localhost:5173'
const KEY = 'silhoufit-wishlist'
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }

interface Wishlist {
  /** The ids the server holds for the account that is signed in. */
  ids: string[]
  /** Every POST and DELETE that reached it, in order, as "POST id" / "DELETE id". */
  writes: string[]
  /** Answers writes with this status (or aborts the connection) instead of saving them. */
  failWith: number | 'abort' | null
  /** Holds each POST back this long, so a second click lands while the first is in flight. */
  postDelayMs: number
  /** While set, every write waits for it before the server answers, so a test can look at the screen mid-request. */
  writeGate: Promise<void> | null
  /** While set, GET /wishlist/ids waits for it before answering. */
  idsGate: Promise<void> | null
  /** Answers GET /wishlist/ids with this status (or aborts it). */
  idsFailWith: number | 'abort' | null
  /** How many GET /wishlist/ids requests reached the server. */
  idsCalls: number
  /** Feature "Wishlist – Saved list": when each id was saved (ISO). GET /wishlist answers newest first. */
  savedAt: Record<string, string>
  /** Answers GET /wishlist with this status instead of the list. */
  listFailWith: number | null
}

/** A gate a test opens later: `await` it in the mock, call `open()` from the test. */
function gate() {
  let open!: () => void
  const promise = new Promise<void>((resolve) => (open = resolve))
  return { promise, open }
}

async function mockWishlist(page: Page, ids: string[] = []): Promise<Wishlist> {
  const server: Wishlist = { ids, writes: [], failWith: null, postDelayMs: 0, writeGate: null, idsGate: null, idsFailWith: null, idsCalls: 0, savedAt: {}, listFailWith: null }
  await page.route((url) => url.origin !== API && /^\/wishlist(\/|$)/.test(url.pathname), async (route) => {
    const request: Request = route.request()
    const method = request.method()
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    const rest = new URL(request.url()).pathname.split('/').slice(2)
    if (method === 'GET' && rest[0] === 'ids') {
      server.idsCalls++
      if (server.idsGate) await server.idsGate
      if (server.idsFailWith === 'abort') return route.abort('failed')
      if (server.idsFailWith) return route.fulfill({ status: server.idsFailWith, json: { message: 'Internal server error' }, headers: CORS })
      return route.fulfill({ json: { productIds: server.ids }, headers: CORS })
    }
    if (method === 'GET') {
      if (server.listFailWith) return route.fulfill({ status: server.listFailWith, json: { message: 'Internal server error' }, headers: CORS })
      const at = (id: string) => server.savedAt[id] ?? '2026-11-01T12:00:00.000Z'
      const items = server.ids.map((productId) => ({ productId, createdAt: at(productId) })).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      return route.fulfill({ json: { items }, headers: CORS })
    }
    // DELETE /wishlist with no id empties the list; it is recorded as "DELETE all", apart from "DELETE <id>".
    const id = method === 'DELETE' && rest.length === 0 ? 'all' : method === 'POST' ? (request.postDataJSON() as { productId: string }).productId : decodeURIComponent(rest[0])
    server.writes.push(`${method} ${id}`)
    if (server.writeGate) await server.writeGate
    if (server.failWith === 'abort') return route.abort('failed')
    if (server.failWith) return route.fulfill({ status: server.failWith, json: { message: 'Internal server error' }, headers: CORS })
    if (method === 'POST') {
      if (server.postDelayMs) await new Promise((resolve) => setTimeout(resolve, server.postDelayMs))
      if (!server.ids.includes(id)) server.ids.push(id)
    } else {
      server.ids = id === 'all' ? [] : server.ids.filter((x) => x !== id)
    }
    return route.fulfill({ status: method === 'POST' ? 201 : 200, json: {}, headers: CORS })
  })
  return server
}

let catalogue: ProductsMock
let shirt: string
let trousers: string
let tee: string

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('silhoufit-cookie-consent', 'accepted'))
  await mockAuth(page)
  catalogue = await mockProducts(page, seedCatalogue())
  await mockCart(page, catalogue)
  ;[shirt, trousers, tee] = [catalogue.rows[0].id, catalogue.rows[1].id, catalogue.rows[2].id]
})

const heart = (page: Page, name: string) => page.getByRole('button', { name: `Save ${name} to wishlist` })

test.describe('shop heart', () => {
  test('saves at once, survives a reload, and removing offers Undo that saves again', async ({ page }) => {
    await signedIn(page)
    const server = await mockWishlist(page)
    await page.goto('/shop')

    await heart(page, 'Linen Shirt').click()
    await expect(heart(page, 'Linen Shirt')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByText('Saved to wishlist')).toBeVisible()
    await expect.poll(() => server.writes).toEqual([`POST ${shirt}`])

    await page.reload()
    await expect(heart(page, 'Linen Shirt')).toHaveAttribute('aria-pressed', 'true')
    await expect(heart(page, 'Cotton Tee')).toHaveAttribute('aria-pressed', 'false')

    await heart(page, 'Linen Shirt').click()
    await expect(heart(page, 'Linen Shirt')).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByText('Removed from wishlist')).toBeVisible()
    await expect.poll(() => server.writes).toEqual([`POST ${shirt}`, `DELETE ${shirt}`])

    await page.getByRole('button', { name: 'Undo' }).click()
    await expect(heart(page, 'Linen Shirt')).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(() => server.writes).toEqual([`POST ${shirt}`, `DELETE ${shirt}`, `POST ${shirt}`])
    expect(server.ids).toEqual([shirt])
  })

  test('a guest who taps the heart is asked to sign in and nothing is sent', async ({ page }) => {
    const server = await mockWishlist(page)
    await page.goto('/shop')
    await heart(page, 'Linen Shirt').click()
    await expect(page).toHaveURL(/\/login/)
    expect(server.writes).toEqual([])
  })
})

test.describe('product page heart', () => {
  test('saves, survives a reload, and Undo saves again', async ({ page }) => {
    await signedIn(page)
    const server = await mockWishlist(page)
    await page.goto(`/shop/${catalogue.rows[0].slug}`)

    await heart(page, 'Linen Shirt').click()
    await expect(heart(page, 'Linen Shirt')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByText('Saved to wishlist')).toBeVisible()
    await expect.poll(() => server.writes).toEqual([`POST ${shirt}`])

    await page.reload()
    await expect(heart(page, 'Linen Shirt')).toHaveAttribute('aria-pressed', 'true')

    await heart(page, 'Linen Shirt').click()
    await expect(page.getByText('Removed from wishlist')).toBeVisible()
    await page.getByRole('button', { name: 'Undo' }).click()
    await expect(heart(page, 'Linen Shirt')).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(() => server.writes).toEqual([`POST ${shirt}`, `DELETE ${shirt}`, `POST ${shirt}`])
  })

  test('two quick clicks end matching the last one, in order', async ({ page }) => {
    await signedIn(page)
    const server = await mockWishlist(page)
    server.postDelayMs = 400
    await page.goto(`/shop/${catalogue.rows[0].slug}`)

    await heart(page, 'Linen Shirt').click()
    await heart(page, 'Linen Shirt').click()
    await expect(heart(page, 'Linen Shirt')).toHaveAttribute('aria-pressed', 'false')
    await expect.poll(() => server.writes).toEqual([`POST ${shirt}`, `DELETE ${shirt}`])
    expect(server.ids).toEqual([])
    await page.reload()
    await expect(heart(page, 'Linen Shirt')).toHaveAttribute('aria-pressed', 'false')
  })
})

async function signIn(page: Page) {
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill(DEMO.email)
  await page.getByLabel('Password', { exact: true }).fill(DEMO.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).not.toHaveURL(/\/login/)
}

test.describe('guest to signed in', () => {
  test('saved pieces are sent to the account on sign-in and the local copy is removed', async ({ page }) => {
    await page.addInitScript(([key, ids]) => !localStorage.getItem('silhoufit-session') && localStorage.setItem(key, JSON.stringify(ids)), [KEY, ['x', 'y']] as const)
    const server = await mockWishlist(page)
    await signIn(page)

    await expect.poll(() => server.writes.sort()).toEqual(['POST x', 'POST y'])
    await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), KEY)).toBeNull()
  })
})

test.describe('wishlist page', () => {
  test('removes one piece with Undo, then several at once with Undo', async ({ page }) => {
    await signedIn(page)
    const server = await mockWishlist(page, [shirt, trousers, tee])
    await page.goto('/wishlist')
    await expect(page.getByText('3 pieces saved')).toBeVisible()

    await heart(page, 'Linen Shirt').click()
    await expect(page.getByText('Removed Linen Shirt from wishlist')).toBeVisible()
    await expect(page.getByText('2 pieces saved')).toBeVisible()
    await expect.poll(() => server.writes).toEqual([`DELETE ${shirt}`])
    await page.getByRole('button', { name: 'Undo' }).click()
    await expect(page.getByText('3 pieces saved')).toBeVisible()
    await expect.poll(() => server.writes).toEqual([`DELETE ${shirt}`, `POST ${shirt}`])

    server.writes.length = 0
    await page.getByRole('button', { name: 'Select all' }).click()
    await page.getByRole('button', { name: 'Remove', exact: true }).click()
    await expect(page.getByText('Removed 3 pieces from wishlist')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Nothing saved yet' })).toBeVisible()
    await expect.poll(() => server.writes.sort()).toEqual([`DELETE ${shirt}`, `DELETE ${tee}`, `DELETE ${trousers}`].sort())

    server.writes.length = 0
    await page.getByRole('button', { name: 'Undo' }).click()
    await expect(page.getByText('3 pieces saved')).toBeVisible()
    await expect.poll(() => server.writes.sort()).toEqual([`POST ${shirt}`, `POST ${tee}`, `POST ${trousers}`].sort())
  })

  test('Clear all asks first, Cancel changes nothing, confirming sends one DELETE and Undo saves every piece again', async ({ page }) => {
    await signedIn(page)
    const server = await mockWishlist(page, [shirt, trousers, tee])
    await page.goto('/wishlist')
    await expect(page.getByText('3 pieces saved')).toBeVisible()

    await page.getByRole('button', { name: 'Clear all' }).click()
    const dialog = page.getByRole('dialog', { name: 'Clear your wishlist?' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByText('3 pieces saved')).toBeVisible()
    expect(server.writes).toEqual([])

    await page.getByRole('button', { name: 'Clear all' }).click()
    await dialog.getByRole('button', { name: 'Clear wishlist' }).click()
    await expect(page.getByText('Cleared your wishlist')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Nothing saved yet' })).toBeVisible()
    await expect.poll(() => server.writes).toEqual(['DELETE all'])

    server.writes.length = 0
    await page.getByRole('button', { name: 'Undo' }).click()
    await expect(page.getByText('3 pieces saved')).toBeVisible()
    await expect.poll(() => server.writes.sort()).toEqual([`POST ${shirt}`, `POST ${tee}`, `POST ${trousers}`].sort())
  })

  test('a failed Clear all brings the list back and says what to do', async ({ page }) => {
    await signedIn(page)
    const server = await mockWishlist(page, [shirt, tee])
    await page.goto('/wishlist')
    await expect(page.getByText('2 pieces saved')).toBeVisible()

    server.failWith = 500
    await page.getByRole('button', { name: 'Clear all' }).click()
    await page.getByRole('dialog', { name: 'Clear your wishlist?' }).getByRole('button', { name: 'Clear wishlist' }).click()
    await expect(page.getByText(/Couldn't update your wishlist\. The request failed.*Check your connection, then try again\./)).toBeVisible()
    server.failWith = null
    await expect(page.getByText('2 pieces saved')).toBeVisible()
    expect(server.ids).toEqual([shirt, tee])
  })

  test('moving a piece to the cart removes it from the server list', async ({ page }) => {
    await signedIn(page)
    const server = await mockWishlist(page, [shirt, tee])
    await page.goto('/wishlist')
    await page.getByRole('checkbox', { name: 'Select Linen Shirt' }).check({ force: true })
    await page.getByRole('checkbox', { name: 'Select Cotton Tee' }).check({ force: true })
    await page.getByRole('button', { name: 'Add to cart', exact: true }).first().click()

    // One sheet per piece, in turn: "Choose options (1 of 2)", then "(2 of 2)".
    const first = page.getByRole('dialog', { name: 'Choose options (1 of 2)' })
    await expect(first.getByRole('button', { name: 'Next piece' })).toBeInViewport({ ratio: 1 })
    await first.getByRole('radio', { name: 'M', exact: true }).check({ force: true })
    await first.getByRole('radio', { name: 'Navy', exact: true }).check({ force: true })
    await first.getByRole('button', { name: 'Next piece' }).click()
    const second = page.getByRole('dialog', { name: 'Choose options (2 of 2)' })
    await expect(second.getByRole('heading', { name: 'Cotton Tee' })).toBeVisible()
    await expect(second.getByRole('button', { name: 'Add to cart' })).toBeInViewport({ ratio: 1 })
    await second.getByRole('radio', { name: 'S', exact: true }).check({ force: true })
    await second.getByRole('button', { name: 'Add to cart' }).click()

    await expect(page.getByText('Added 2 pieces to cart')).toBeVisible()
    await expect.poll(() => server.writes.sort()).toEqual([`DELETE ${shirt}`, `DELETE ${tee}`].sort())
    expect(server.ids).toEqual([])
  })
})

test.describe('when the server fails', () => {
  for (const failWith of [500, 'abort'] as const) {
    test(`a ${failWith} flips the heart back and explains what to do`, async ({ page }) => {
      await signedIn(page)
      const server = await mockWishlist(page)
      server.failWith = failWith
      await page.goto('/shop')

      await heart(page, 'Linen Shirt').click()
      await expect(page.getByText("Couldn't update your wishlist", { exact: false })).toBeVisible()
      await expect(page.getByText(/The request failed, most likely because the connection dropped\. Check your connection, then try again\./)).toBeVisible()
      await expect(heart(page, 'Linen Shirt')).toHaveAttribute('aria-pressed', 'false')
      expect(server.ids).toEqual([])
    })
  }
})

test.describe('accounts', () => {
  test('signing out and in as someone else shows only their list', async ({ page }) => {
    const server = await mockWishlist(page, [shirt])
    await signIn(page)
    await page.goto('/shop')
    await expect(heart(page, 'Linen Shirt')).toHaveAttribute('aria-pressed', 'true')

    await page.getByRole('button', { name: /^Account, / }).click()
    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page).toHaveURL(/\/login/)
    await page.goto('/shop')
    await expect(heart(page, 'Linen Shirt')).toHaveAttribute('aria-pressed', 'false')
    expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBeNull()

    // The mocked sign-in only knows one login, so the "other account" is the server returning a different list for it.
    server.ids = [tee]
    await signIn(page)
    await page.goto('/shop')
    await expect(heart(page, 'Cotton Tee')).toHaveAttribute('aria-pressed', 'true')
    await expect(heart(page, 'Linen Shirt')).toHaveAttribute('aria-pressed', 'false')
  })
})

const navbarCount = (page: Page, count: number) => page.getByRole('link', { name: `Wishlist, ${count} saved` })
const errorToast = (page: Page) => page.getByText(/Couldn't update your wishlist\. The request failed.*Check your connection, then try again\./)

test.describe('Wishlist – Add and Clear all, when the follow-up read also fails', () => {
  test('a failed save whose GET /wishlist/ids also fails still reverts the heart and the navbar count and shows the error', async ({ page }) => {
    await signedIn(page)
    const server = await mockWishlist(page, [tee])
    await page.goto('/shop')
    await expect(heart(page, 'Cotton Tee')).toHaveAttribute('aria-pressed', 'true')
    await expect(navbarCount(page, 1)).toBeVisible()

    server.failWith = 500
    server.idsFailWith = 500
    const before = server.idsCalls
    await heart(page, 'Linen Shirt').click()

    await expect(errorToast(page)).toBeVisible()
    // The refetch really was tried, and really failed.
    await expect.poll(() => server.idsCalls).toBeGreaterThan(before)
    await expect(heart(page, 'Linen Shirt')).toHaveAttribute('aria-pressed', 'false')
    await expect(heart(page, 'Cotton Tee')).toHaveAttribute('aria-pressed', 'true')
    await expect(navbarCount(page, 1)).toBeVisible()
    await expect(page.getByText('Saved to wishlist')).toHaveCount(0)
  })

  test('a failed Clear all whose GET /wishlist/ids also fails brings the list back', async ({ page }) => {
    await signedIn(page)
    const server = await mockWishlist(page, [shirt, tee])
    await page.goto('/wishlist')
    await expect(page.getByText('2 pieces saved')).toBeVisible()

    server.failWith = 500
    server.idsFailWith = 500
    const before = server.idsCalls
    await page.getByRole('button', { name: 'Clear all' }).click()
    await page.getByRole('dialog', { name: 'Clear your wishlist?' }).getByRole('button', { name: 'Clear wishlist' }).click()

    await expect(errorToast(page)).toBeVisible()
    await expect.poll(() => server.idsCalls).toBeGreaterThan(before)
    await expect(page.getByText('2 pieces saved')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Nothing saved yet' })).toHaveCount(0)
    await expect(page.getByText('Cleared your wishlist')).toHaveCount(0)
  })
})

test.describe('Wishlist – Get saved ids', () => {
  test('a heart clicked while the ids are still loading stays filled and the server ends up holding it', async ({ page }) => {
    await signedIn(page)
    const server = await mockWishlist(page, [tee])
    const ids = gate()
    server.idsGate = ids.promise
    // Record every value the heart's aria-pressed takes, to catch a flip-back that is gone before an assertion could see it.
    await page.addInitScript(() => {
      const seen: string[] = []
      ;(window as unknown as { __pressed: string[] }).__pressed = seen
      new MutationObserver((records) => {
        for (const r of records) {
          const el = r.target as HTMLElement
          if (el.getAttribute('aria-label') === 'Save Linen Shirt to wishlist') seen.push(el.getAttribute('aria-pressed') ?? '')
        }
      }).observe(document, { subtree: true, attributes: true, attributeFilter: ['aria-pressed'] })
    })
    await page.goto('/shop')

    await heart(page, 'Linen Shirt').click()
    await expect(heart(page, 'Linen Shirt')).toHaveAttribute('aria-pressed', 'true')
    ids.open()

    await expect.poll(() => server.writes).toEqual([`POST ${shirt}`])
    await expect(page.getByText('Saved to wishlist')).toBeVisible()
    await expect(heart(page, 'Linen Shirt')).toHaveAttribute('aria-pressed', 'true')
    await expect(heart(page, 'Cotton Tee')).toHaveAttribute('aria-pressed', 'true')
    expect(await page.evaluate(() => (window as unknown as { __pressed: string[] }).__pressed)).not.toContain('false')
    expect([...server.ids].sort()).toEqual([shirt, tee].sort())
    await page.reload()
    await expect(heart(page, 'Linen Shirt')).toHaveAttribute('aria-pressed', 'true')
  })

  test('the wishlist page shows the skeleton while the ids load', async ({ page }) => {
    await signedIn(page)
    const server = await mockWishlist(page, [shirt, tee])
    const ids = gate()
    server.idsGate = ids.promise
    await page.goto('/wishlist')

    await expect(page.getByRole('status', { name: 'Loading your wishlist' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Nothing saved yet' })).toHaveCount(0)
    ids.open()
    await expect(page.getByText('2 pieces saved')).toBeVisible()
    await expect(page.getByRole('status', { name: 'Loading your wishlist' })).toHaveCount(0)
  })

  test('a 500 shows "Your wishlist did not load" with Try again, never "Nothing saved yet", and Try again loads the list', async ({ page }) => {
    await signedIn(page)
    const server = await mockWishlist(page, [shirt, tee])
    server.idsFailWith = 500
    await page.goto('/wishlist')

    const block = page.getByRole('alert').filter({ hasText: 'Your wishlist did not load' })
    await expect(block).toBeVisible()
    await expect(block.getByText(/Your saved pieces are kept\. Check your connection, then try again\./)).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Nothing saved yet' })).toHaveCount(0)

    server.idsFailWith = null
    await block.getByRole('button', { name: 'Try again' }).click()
    await expect(page.getByText('2 pieces saved')).toBeVisible()
    await expect(block).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Nothing saved yet' })).toHaveCount(0)
  })
})

test.describe('Wishlist – Add and Remove toasts', () => {
  test('"Saved to wishlist" and "Removed from wishlist" appear only after the server accepts', async ({ page }) => {
    await signedIn(page)
    const server = await mockWishlist(page)
    await page.goto('/shop')

    const saving = gate()
    server.writeGate = saving.promise
    await heart(page, 'Linen Shirt').click()
    await expect(heart(page, 'Linen Shirt')).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(() => server.writes).toEqual([`POST ${shirt}`])
    await expect(page.getByText('Saved to wishlist')).toHaveCount(0)
    saving.open()
    await expect(page.getByText('Saved to wishlist')).toBeVisible()

    const removing = gate()
    server.writeGate = removing.promise
    await heart(page, 'Linen Shirt').click()
    await expect(heart(page, 'Linen Shirt')).toHaveAttribute('aria-pressed', 'false')
    await expect.poll(() => server.writes).toEqual([`POST ${shirt}`, `DELETE ${shirt}`])
    await expect(page.getByText('Removed from wishlist')).toHaveCount(0)
    removing.open()
    await expect(page.getByText('Removed from wishlist')).toBeVisible()
  })

  test('a failed save shows only the error toast', async ({ page }) => {
    await signedIn(page)
    const server = await mockWishlist(page)
    server.failWith = 500
    await page.goto(`/shop/${catalogue.rows[0].slug}`)

    await heart(page, 'Linen Shirt').click()
    await expect(errorToast(page)).toBeVisible()
    await expect(page.getByText('Saved to wishlist')).toHaveCount(0)
    await expect(heart(page, 'Linen Shirt')).toHaveAttribute('aria-pressed', 'false')
  })

  for (const width of [320, 390, 640, 768, 1024, 1280])
  test(`on a ${width}px screen the toast does not cover the product page heart`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await signedIn(page)
    const server = await mockWishlist(page)
    await page.goto(`/shop/${catalogue.rows[0].slug}`)

    await heart(page, 'Linen Shirt').click()
    await expect(page.getByText('Saved to wishlist')).toBeVisible()

    const target = heart(page, 'Linen Shirt')
    const reachable = await target.evaluate((el) => {
      const box = el.getBoundingClientRect()
      const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
      return !!top && el.contains(top)
    })
    expect(reachable).toBe(true)

    // A second real click, with the first toast still up, lands on the heart.
    await target.click()
    await expect(target).toHaveAttribute('aria-pressed', 'false')
    await expect.poll(() => server.writes).toEqual([`POST ${shirt}`, `DELETE ${shirt}`])
  })
})

test.describe('Wishlist – Saved list', () => {
  test('each card shows when it was saved, newest saved first', async ({ page }) => {
    await signedIn(page)
    const server = await mockWishlist(page, [shirt, trousers, tee])
    server.savedAt = { [shirt]: '2026-10-20T12:00:00.000Z', [trousers]: '2026-11-01T12:00:00.000Z', [tee]: '2026-11-03T12:00:00.000Z' }
    await page.goto('/wishlist')

    const cards = page.getByRole('listitem').filter({ has: page.getByRole('checkbox') })
    await expect(cards).toHaveCount(3)
    await expect(cards.nth(0)).toContainText('Cotton Tee')
    await expect(cards.nth(0)).toContainText('Saved Nov 3, 2026')
    await expect(cards.nth(1)).toContainText('Wool Trousers')
    await expect(cards.nth(1)).toContainText('Saved Nov 1, 2026')
    await expect(cards.nth(2)).toContainText('Linen Shirt')
    await expect(cards.nth(2)).toContainText('Saved Oct 20, 2026')
  })

  test('when GET /wishlist fails the pieces still show, without dates and without an error banner', async ({ page }) => {
    await signedIn(page)
    const server = await mockWishlist(page, [shirt, tee])
    server.listFailWith = 500
    await page.goto('/wishlist')

    await expect(page.getByText('2 pieces saved')).toBeVisible()
    await expect(heart(page, 'Linen Shirt')).toBeVisible()
    await expect(heart(page, 'Cotton Tee')).toBeVisible()
    await expect(page.getByText(/^Saved \d/)).toHaveCount(0)
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(page.getByText('Your wishlist did not load')).toHaveCount(0)
  })
})
