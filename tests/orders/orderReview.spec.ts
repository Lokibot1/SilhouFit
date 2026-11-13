import { expect, test, type Page } from '@playwright/test'
import { apiShipment, mockOrders, order, orderId } from '../shared/ordersApi'
import { apiPhotos, apiReview, mockReviews, type ApiPending, type ApiReview, type ReviewsMock } from '../shared/reviewsApi'
import { mockAuth, signedIn } from '../shared/session'

// "Your reviews" on /orders/:id for a DELIVERED order: one row per product, Review / Edit review (within 30 days), photos up to 5.
// The orders and reviews APIs and the Supabase `reviews` bucket are mocked (tests/shared/reviewsApi.ts).

const PAID_AT = '2026-10-02T03:00:00.000Z'
const DELIVERED = 7
const SHIPPED = 5
const num = (n: number) => `SHF-20261001-${String(n).padStart(6, '0')}`
const PRODUCT = 'Heritage Polo'
const PRODUCT_ID = '00000000-0000-4000-8000-000000000555'
const GOOD_TEXT = 'Fits well and arrived on time.'
const DAY = 24 * 60 * 60 * 1000
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString()

const orders = () => [
  order(SHIPPED, { status: 'DISPATCHED', paymentStatus: 'PAID', paidAt: PAID_AT, shipment: apiShipment({ status: 'PICKED_UP' }) }),
  order(DELIVERED, {
    status: 'DELIVERED',
    paymentStatus: 'PAID',
    paidAt: PAID_AT,
    shipment: apiShipment({ status: 'COMPLETED', deliveredAt: '2026-10-08T05:00:00.000Z' }),
  }),
]

const pendingRow = (): ApiPending => ({
  orderId: orderId(DELIVERED),
  orderNumber: num(DELIVERED),
  deliveredAt: '2026-10-08T05:00:00.000Z',
  product: { id: PRODUCT_ID, name: PRODUCT, slug: 'heritage-polo', primaryImage: null },
  variations: [{ orderItemId: '00000000-0000-4000-8000-000000000101', variantId: '00000000-0000-4000-8000-000000000201', size: 'M', color: 'Navy', quantity: 2 }],
})

/** The customer's own review of the polo (its sku matches the order line, which is how the row finds its name). */
const mine = (over: Partial<ApiReview> = {}) =>
  apiReview(1, { orderId: orderId(DELIVERED), productId: PRODUCT_ID, rating: 4, comment: 'Soft cotton and a good cut.', purchasedVariants: [{ size: 'M', color: 'Navy', sku: 'POLO-M-NAVY' }], createdAt: ago(2), ...over })

// A valid 1x1 PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
const png = (name: string) => ({ name, mimeType: 'image/png', buffer: PNG })
const photos = (count: number) => Array.from({ length: count }, (_, i) => png(`photo-${i + 1}.png`))

let reviews: ReviewsMock

test.beforeEach(async ({ page }) => {
  await mockAuth(page)
  await signedIn(page)
  await page.addInitScript(() => localStorage.setItem('silhoufit-cookie-consent', 'accepted'))
})

/** Mocks the APIs and opens the order. `needsSession` also gives the Supabase client a session, which a photo upload reads. */
async function openOrder(page: Page, { pending = [pendingRow()], reviewed = [] as ApiReview[], n = DELIVERED, needsSession = false } = {}) {
  await mockOrders(page, orders())
  reviews = await mockReviews(page, { pending, mine: reviewed })
  await page.goto(`/orders/${orderId(n)}`)
  await expect(page.getByRole('heading', { level: 1, name: num(n) })).toBeVisible({ timeout: 15000 })
  if (needsSession) {
    await page.evaluate(async () => {
      const enc = (v: object) => btoa(JSON.stringify(v)).replace(/=+$/, '')
      const token = `${enc({ alg: 'HS256', typ: 'JWT' })}.${enc({ sub: 'user-1', role: 'authenticated', exp: 4_102_444_800 })}.sig`
      const modulePath = '/src/service/supabase.ts' // a variable, so tsc doesn't try to resolve a browser-only URL
      const { getSupabase } = await import(/* @vite-ignore */ modulePath)
      const supabase = await getSupabase()
      await supabase.auth.setSession({ access_token: token, refresh_token: 'refresh' })
    })
  }
}

const section = (page: Page) => page.getByRole('region', { name: 'Your reviews' })
const dialog = (page: Page) => page.getByRole('dialog', { name: /review/i })
const star = (page: Page, n: number) => dialog(page).getByRole('radio', { name: new RegExp(`^${n} stars?:`) })
const textBox = (page: Page) => dialog(page).getByLabel('Your review')
const files = (page: Page) => dialog(page).getByLabel('Choose photo files')
const toast = (page: Page, text: string) => page.getByRole('status').filter({ hasText: text })
const reviewButton = (page: Page) => section(page).getByRole('button', { name: `Review ${PRODUCT}` })
const editButton = (page: Page) => section(page).getByRole('button', { name: `Edit review of ${PRODUCT}` })

/** Rate by clicking the star's label (the radio itself is visually hidden). */
async function rate(page: Page, n: number) {
  await star(page, n).locator('xpath=ancestor::label[1]').click()
  await expect(star(page, n)).toBeChecked()
}

async function openForm(page: Page) {
  await reviewButton(page).click()
  await expect(page.getByRole('dialog', { name: `Review ${PRODUCT}` })).toBeVisible()
}

test.describe('visibility', () => {
  test('a delivered order lists the product to review with a Review button', async ({ page }) => {
    await openOrder(page)
    await expect(section(page).getByRole('heading', { level: 2, name: 'Your reviews' })).toBeVisible()
    await expect(section(page).getByRole('heading', { level: 3, name: PRODUCT })).toBeVisible()
    await expect(reviewButton(page)).toBeVisible()
    await expect(editButton(page)).toHaveCount(0)
  })

  test('an order that is not delivered has no review section and loads no reviews', async ({ page }) => {
    await openOrder(page, { n: SHIPPED })
    await expect(page.getByRole('heading', { level: 2, name: 'Your reviews' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^Review / })).toHaveCount(0)
  })

  test('an order with nothing left to review says so', async ({ page }) => {
    await openOrder(page, { pending: [] })
    await expect(section(page).getByText('There is nothing to review on this order.', { exact: false })).toBeVisible()
  })

  test('a failing load shows an error with Try again, the order stays, and Try again recovers', async ({ page }) => {
    await mockOrders(page, orders())
    reviews = await mockReviews(page, { pending: [pendingRow()] })
    let fail = true
    reviews.on.pending = () => (fail ? { status: 500, json: { statusCode: 500, message: 'Internal server error' } } : undefined)
    await page.goto(`/orders/${orderId(DELIVERED)}`)
    await expect(section(page).getByRole('alert')).toContainText("We couldn't load your reviews")
    await expect(page.getByRole('heading', { level: 1, name: num(DELIVERED) })).toBeVisible()
    fail = false
    await section(page).getByRole('button', { name: 'Try again' }).click()
    await expect(reviewButton(page)).toBeVisible()
  })

  test('a slow load shows a loading status, then the rows', async ({ page }) => {
    await mockOrders(page, orders())
    reviews = await mockReviews(page, { pending: [pendingRow()] })
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    await page.route((url) => url.pathname === '/reviews/pending' && url.origin !== 'http://localhost:5173', async (route) => {
      await gate
      await route.fallback()
    })
    await page.goto(`/orders/${orderId(DELIVERED)}`)
    await expect(section(page).getByRole('status', { name: 'Loading your reviews' })).toBeVisible()
    release()
    await expect(reviewButton(page)).toBeVisible()
    await expect(section(page).getByRole('status', { name: 'Loading your reviews' })).toHaveCount(0)
  })
})

test.describe('writing a review', () => {
  test('an empty form names the rating and the text inline, and focuses the stars', async ({ page }) => {
    await openOrder(page)
    await openForm(page)
    await dialog(page).getByRole('button', { name: 'Post review' }).click()
    await expect(dialog(page).getByRole('alert').filter({ hasText: 'Choose 1 to 5 stars.' })).toBeVisible()
    await expect(dialog(page).getByRole('alert').filter({ hasText: 'A review needs some text.' })).toBeVisible()
    await expect(star(page, 1)).toBeFocused()
    expect(reviews.creates).toHaveLength(0)
  })

  test('a too-short comment is rejected inline, nothing is sent, and the message clears once long enough', async ({ page }) => {
    await openOrder(page)
    await openForm(page)
    await rate(page, 5)
    await textBox(page).fill('Too short')
    await textBox(page).blur()
    await expect(dialog(page).getByRole('alert').filter({ hasText: 'too short' })).toContainText('at least 10 characters')
    await expect(textBox(page)).toHaveAttribute('aria-invalid', 'true')
    await dialog(page).getByRole('button', { name: 'Post review' }).click()
    await expect(textBox(page)).toBeFocused()
    expect(reviews.creates).toHaveLength(0)
    await textBox(page).fill('Long enough now.')
    await expect(dialog(page).getByRole('alert')).toHaveCount(0)
  })

  test('a sixth photo is rejected inline and the first five stay', async ({ page }) => {
    await openOrder(page)
    await openForm(page)
    await files(page).setInputFiles(photos(5))
    await expect(dialog(page).getByRole('button', { name: /^Remove photo-/ })).toHaveCount(5)
    await files(page).setInputFiles(png('sixth.png'))
    await expect(dialog(page).getByRole('alert').filter({ hasText: 'sixth.png' })).toContainText('5 photos at most')
    await expect(dialog(page).getByRole('button', { name: /^Remove / })).toHaveCount(5)
  })

  test('a gif is rejected and a removed photo drops its tile', async ({ page }) => {
    await openOrder(page)
    await openForm(page)
    await files(page).setInputFiles({ name: 'party.gif', mimeType: 'image/gif', buffer: Buffer.from('GIF89a') })
    await expect(dialog(page).getByRole('alert').filter({ hasText: 'party.gif' })).toBeVisible()
    await expect(dialog(page).getByRole('button', { name: 'Remove party.gif' })).toHaveCount(0)
    await files(page).setInputFiles(png('front.png'))
    await expect(dialog(page).getByRole('img', { name: 'Photo 1: front.png' })).toBeVisible()
    await dialog(page).getByRole('button', { name: 'Remove front.png' }).click()
    await expect(dialog(page).getByRole('img', { name: 'Photo 1: front.png' })).toHaveCount(0)
    await expect(dialog(page).getByRole('button', { name: 'Add photos' })).toBeFocused()
  })

  test('posting shows the success toast, the row becomes reviewed and the request carries rating and comment', async ({ page }) => {
    await openOrder(page)
    await openForm(page)
    await rate(page, 4)
    await textBox(page).fill(GOOD_TEXT)
    await dialog(page).getByRole('button', { name: 'Post review' }).click()
    await expect(toast(page, 'Review posted.')).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(section(page).getByRole('img', { name: 'Rated 4 out of 5' })).toBeVisible()
    await expect(section(page).getByText(GOOD_TEXT)).toBeVisible()
    await expect(section(page).getByText(/^Reviewed \w{3} \d{1,2}, \d{1,2}:\d{2} (AM|PM)$/)).toBeVisible()
    await expect(reviewButton(page)).toHaveCount(0)
    await expect(editButton(page)).toBeVisible()
    await expect(editButton(page)).toBeFocused()
    expect(reviews.creates).toEqual([{ orderId: orderId(DELIVERED), productId: PRODUCT_ID, body: { rating: 4, comment: GOOD_TEXT } }])
  })

  test('posting with photos uploads them to the reviews bucket and sends their URLs', async ({ page }) => {
    await openOrder(page, { needsSession: true })
    await openForm(page)
    await rate(page, 5)
    await textBox(page).fill(GOOD_TEXT)
    await files(page).setInputFiles(photos(2))
    await dialog(page).getByRole('button', { name: 'Post review' }).click()
    await expect(toast(page, 'Review posted.')).toBeVisible()
    expect(reviews.uploads).toHaveLength(2)
    expect(reviews.uploads[0]).toMatch(/\/storage\/v1\/object\/reviews\/user-1\/[\w-]+\.png$/)
    const urls = reviews.creates[0].body.imageUrls as string[]
    expect(urls).toHaveLength(2)
    for (const url of urls) expect(url).toContain('/storage/v1/object/public/reviews/user-1/')
    await expect(section(page).getByRole('img', { name: `Photo 1: ${PRODUCT}` })).toBeVisible()
    await expect(section(page).getByRole('img', { name: `Photo 2: ${PRODUCT}` })).toBeVisible()
  })

  test('the Post button is disabled while saving, so a double click posts once', async ({ page }) => {
    await openOrder(page)
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    await page.route((url) => /^\/orders\/[^/]+\/products\/[^/]+\/reviews$/.test(url.pathname) && url.origin !== 'http://localhost:5173', async (route) => {
      await gate
      await route.fallback()
    })
    await openForm(page)
    await rate(page, 4)
    await textBox(page).fill(GOOD_TEXT)
    const post = dialog(page).getByRole('button', { name: 'Post review' })
    await post.click()
    await expect(post).toBeDisabled()
    release()
    await expect(toast(page, 'Review posted.')).toBeVisible()
    expect(reviews.creates).toHaveLength(1)
  })

  test('a 409 shows the already-reviewed copy in the dialog and the list then shows the saved review', async ({ page }) => {
    await openOrder(page)
    reviews.on.create = () => {
      // Another tab got there first.
      reviews.on.create = undefined
      reviews.pending = []
      reviews.mine.push(mine())
      return { status: 409, json: { statusCode: 409, message: 'You have already reviewed this product for this order', error: 'Conflict' } }
    }
    await openForm(page)
    await rate(page, 5)
    await textBox(page).fill(GOOD_TEXT)
    await dialog(page).getByRole('button', { name: 'Post review' }).click()
    await expect(dialog(page).getByRole('alert').filter({ hasText: 'You already reviewed this product on this order' })).toBeVisible()
    await expect(dialog(page)).toBeVisible()
    await expect(toast(page, 'Review posted.')).toHaveCount(0)
    await dialog(page).getByRole('button', { name: 'Cancel' }).click()
    await expect(section(page).getByText('Soft cotton and a good cut.')).toBeVisible()
    await expect(editButton(page)).toBeVisible()
  })

  test('a dropped connection keeps the form and what was typed, with the connection copy', async ({ page }) => {
    await openOrder(page)
    reviews.on.create = () => 'abort'
    await openForm(page)
    await rate(page, 5)
    await textBox(page).fill(GOOD_TEXT)
    await dialog(page).getByRole('button', { name: 'Post review' }).click()
    await expect(dialog(page).getByRole('alert').filter({ hasText: "We couldn't save your review" })).toContainText('Check your connection')
    await expect(star(page, 5)).toBeChecked()
    await expect(textBox(page)).toHaveValue(GOOD_TEXT)
    await expect(dialog(page).getByRole('button', { name: 'Post review' })).toBeEnabled()
  })

  test('a 500 keeps the form and shows an error in the dialog with friendly copy, not the server text', async ({ page }) => {
    await openOrder(page)
    reviews.on.create = () => ({ status: 500, json: { statusCode: 500, message: 'Internal server error' } })
    await openForm(page)
    await rate(page, 5)
    await textBox(page).fill(GOOD_TEXT)
    await dialog(page).getByRole('button', { name: 'Post review' }).click()
    await expect(dialog(page).getByRole('alert').filter({ hasText: "Something went wrong on our side and your review wasn't posted" })).toBeVisible()
    await expect(dialog(page).getByText('Internal server error')).toHaveCount(0)
    await expect(textBox(page)).toHaveValue(GOOD_TEXT)
    await expect(dialog(page).getByRole('button', { name: 'Post review' })).toBeEnabled()
    await expect(toast(page, 'Review posted.')).toHaveCount(0)
  })

  test('write a review with the keyboard only', async ({ page }) => {
    await openOrder(page)
    await reviewButton(page).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('dialog', { name: `Review ${PRODUCT}` })).toBeVisible()
    await expect(star(page, 1)).toBeFocused()
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight')
    await expect(star(page, 4)).toBeChecked()
    await page.keyboard.press('Tab')
    await expect(textBox(page)).toBeFocused()
    await page.keyboard.type(GOOD_TEXT)
    await expect(dialog(page).getByText(`${GOOD_TEXT.length}/1000`)).toBeVisible()
    const post = dialog(page).getByRole('button', { name: 'Post review' })
    await post.focus()
    await page.keyboard.press('Enter')
    await expect(toast(page, 'Review posted.')).toBeVisible()
    await expect(editButton(page)).toBeFocused()
    // Escape closes the edit dialog without saving.
    await page.keyboard.press('Enter')
    await expect(page.getByRole('dialog', { name: `Edit review: ${PRODUCT}` })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect(reviews.updates).toHaveLength(0)
  })
})

test.describe('editing a review', () => {
  test('Edit review opens with the saved values and a save sends a PATCH', async ({ page }) => {
    await openOrder(page, { pending: [], reviewed: [mine()] })
    await expect(section(page).getByRole('img', { name: 'Rated 4 out of 5' })).toBeVisible()
    await editButton(page).click()
    await expect(page.getByRole('dialog', { name: `Edit review: ${PRODUCT}` })).toBeVisible()
    await expect(star(page, 4)).toBeChecked()
    await expect(textBox(page)).toHaveValue('Soft cotton and a good cut.')
    await rate(page, 5)
    await textBox(page).fill('Even better after a few washes.')
    await dialog(page).getByRole('button', { name: 'Save review' }).click()
    await expect(toast(page, 'Review updated.')).toBeVisible()
    expect(reviews.updates).toHaveLength(1)
    expect(reviews.updates[0].id).toBe(mine().id)
    expect(reviews.updates[0].body).toMatchObject({ rating: 5, comment: 'Even better after a few washes.' })
    await expect(section(page).getByText('Even better after a few washes.')).toBeVisible()
    await expect(section(page).getByRole('img', { name: 'Rated 5 out of 5' })).toBeVisible()
  })

  test('removing a saved photo sends imageUrls of the kept photos only', async ({ page }) => {
    const saved = mine({ images: apiPhotos(2, 'saved') })
    const keptUrl = saved.images[1].url // the mock rewrites `saved` once the PATCH lands
    await openOrder(page, { pending: [], reviewed: [saved] })
    await expect(section(page).getByRole('img', { name: `Photo 1: ${PRODUCT}` })).toBeVisible()
    await expect(section(page).getByRole('img', { name: `Photo 2: ${PRODUCT}` })).toBeVisible()
    await editButton(page).click()
    await dialog(page).getByRole('button', { name: 'Remove Saved photo 1' }).click()
    await expect(dialog(page).getByRole('button', { name: /^Remove Saved photo/ })).toHaveCount(1)
    await dialog(page).getByRole('button', { name: 'Save review' }).click()
    await expect(toast(page, 'Review updated.')).toBeVisible()
    expect(reviews.updates[0].body.imageUrls).toEqual([keptUrl])
    await expect(section(page).getByRole('img', { name: /^Photo \d: / })).toHaveCount(1)
  })

  test('a new photo added while editing is uploaded and sent after the kept ones', async ({ page }) => {
    const saved = mine({ images: apiPhotos(1, 'saved') })
    await openOrder(page, { pending: [], reviewed: [saved], needsSession: true })
    await editButton(page).click()
    await files(page).setInputFiles(png('extra.png'))
    await dialog(page).getByRole('button', { name: 'Save review' }).click()
    await expect(toast(page, 'Review updated.')).toBeVisible()
    const urls = reviews.updates[0].body.imageUrls as string[]
    expect(urls).toHaveLength(2)
    expect(urls[0]).toBe(saved.images[0].url)
    expect(urls[1]).toContain('/storage/v1/object/public/reviews/user-1/')
    expect(reviews.uploads).toHaveLength(1)
  })

  test('the edit button is absent for a review older than 30 days', async ({ page }) => {
    await openOrder(page, { pending: [], reviewed: [mine({ createdAt: ago(40) })] })
    await expect(section(page).getByText('Soft cotton and a good cut.')).toBeVisible()
    await expect(section(page).getByText('That time has passed.', { exact: false })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Edit review/ })).toHaveCount(0)
  })

  test('a review just inside the 30 days can still be edited', async ({ page }) => {
    await openOrder(page, { pending: [], reviewed: [mine({ createdAt: ago(29) })] })
    await expect(editButton(page)).toBeVisible()
  })

  test('a server refusal for an expired window shows the edit-window copy', async ({ page }) => {
    await openOrder(page, { pending: [], reviewed: [mine()] })
    reviews.on.update = () => ({ status: 400, json: { statusCode: 400, message: 'Reviews can only be edited within 30 days of posting', error: 'Bad Request' } })
    await editButton(page).click()
    await textBox(page).fill('Trying to change this text now.')
    await dialog(page).getByRole('button', { name: 'Save review' }).click()
    await expect(dialog(page).getByRole('alert').filter({ hasText: 'Reviews can only be edited within 30 days' })).toBeVisible()
    await expect(toast(page, 'Review updated.')).toHaveCount(0)
  })
})

test.describe('layout and dark mode', () => {
  for (const width of [320, 1280]) {
    test(`no horizontal scroll at ${width}px with the form open and five photos`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 })
      await openOrder(page, { reviewed: [mine({ images: apiPhotos(5, 'wide') })] })
      const overflows = () => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
      expect(await overflows()).toBe(false)
      await openForm(page)
      await files(page).setInputFiles(photos(5))
      await expect(dialog(page).getByRole('button', { name: /^Remove photo-/ })).toHaveCount(5)
      await dialog(page).getByRole('button', { name: 'Post review' }).click() // errors show
      await expect(dialog(page).getByRole('alert').filter({ hasText: 'Choose 1 to 5 stars.' })).toBeVisible()
      expect(await overflows()).toBe(false)
      const box = await dialog(page).boundingBox()
      expect(box!.x).toBeGreaterThanOrEqual(0)
      expect(box!.x + box!.width).toBeLessThanOrEqual(width)
    })
  }

  test('dark mode renders the rows and the dialog', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await openOrder(page, { reviewed: [mine()] })
    await expect(page.locator('html')).toHaveClass(/dark/)
    await expect(reviewButton(page)).toBeVisible()
    await expect(editButton(page)).toBeVisible()
    await openForm(page)
    await expect(dialog(page)).toBeVisible()
    const dark = await dialog(page).evaluate((el) => {
      let bg = 'rgba(0, 0, 0, 0)'
      for (let n: Element | null = el; n; n = n.parentElement) {
        const v = getComputedStyle(n).backgroundColor
        if (v !== 'rgba(0, 0, 0, 0)') { bg = v; break }
      }
      return bg.match(/\d+/g)!.slice(0, 3).map(Number)
    })
    expect(Math.max(...dark), `dialog background rgb(${dark})`).toBeLessThan(110)
  })
})
