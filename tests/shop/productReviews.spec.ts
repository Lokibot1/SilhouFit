import { expect, test, type Page } from '@playwright/test'
import { mockProducts, seedCatalogue } from '../shared/products'
import { apiPhotos, apiReview, mockReviews, type ApiReview, type ReviewsMock } from '../shared/reviewsApi'
import { mockAuth } from '../shared/session'

// Reviews at the bottom of the product page (/shop/linen-shirt): summary, filters, sort, pages and the failure and empty states.
// 23 reviews: ratings cycle 5,4,3,2,1 so each star has 4 or 5 reviews; every fourth one has photos.

const LINEN_SHIRT_ID = '00000000-0000-4000-8000-000000000101'
const many = (): ApiReview[] =>
  Array.from({ length: 23 }, (_, i) => {
    const n = i + 1
    return apiReview(n, { rating: 5 - (i % 5), images: n % 4 === 0 ? apiPhotos(2, `r${n}`) : [] })
  })

let reviews: ReviewsMock

async function start(page: Page, list: ApiReview[] = many()) {
  await page.addInitScript(() => localStorage.setItem('silhoufit-cookie-consent', 'accepted'))
  await mockAuth(page)
  await mockProducts(page, seedCatalogue())
  reviews = await mockReviews(page, { list })
}

const section = (page: Page) => page.getByRole('region', { name: 'Reviews' })
const chips = (page: Page) => section(page).getByRole('group', { name: 'Filter reviews' })
const items = (page: Page) => section(page).getByRole('listitem').filter({ has: page.getByText(/^Reviewer Number/) })
const overflows = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
const lastQuery = () => reviews.listQueries[reviews.listQueries.length - 1]

/** Opens the product and scrolls (with the wheel, as a shopper would) until the reviews are on screen. */
async function openReviews(page: Page) {
  await page.goto('/shop/linen-shirt')
  await expect(page.getByRole('heading', { level: 1, name: 'Linen Shirt' })).toBeVisible({ timeout: 15000 })
  await expect(async () => {
    await page.mouse.wheel(0, 700)
    await expect(page.getByRole('heading', { level: 2, name: 'Reviews' })).toBeInViewport()
  }).toPass({ timeout: 15000 })
}

test.describe('loaded list', () => {
  test('shows the summary, the distribution and the first ten reviews', async ({ page }) => {
    await start(page)
    await openReviews(page)
    // Ratings 5,4,3,2,1 repeating over 23 reviews: five 5s, five 4s, five 3s, four 2s, four 1s.
    await expect(section(page).getByText('23 reviews')).toBeVisible()
    await expect(section(page).getByText('3.1', { exact: true })).toBeVisible()
    const rows = section(page).getByRole('list', { name: 'Reviews by rating' }).getByRole('listitem')
    await expect(rows).toHaveCount(5)
    await expect(rows.nth(0)).toContainText('5 stars')
    await expect(rows.nth(0)).toContainText('5')
    await expect(rows.nth(4)).toContainText('1 star')
    await expect(items(page)).toHaveCount(10)
    await expect(items(page).first()).toContainText('Reviewer Number1')
    await expect(items(page).first()).toContainText('Review number 1, fits true to size.')
    await expect(items(page).first()).toContainText('Size M · Black')
    expect(reviews.listQueries[0].get('page')).toBe('1')
    expect(reviews.listQueries[0].get('limit')).toBe('10')
    expect(reviews.listQueries[0].get('sortBy')).toBe('newest')
    expect(reviews.listQueries[0].has('rating')).toBe(false)
    expect(reviews.listQueries[0].has('hasImages')).toBe(false)
    await expect(page.getByText('Displaying 1–10 of 23')).toBeVisible()
  })

  test('review photos and the admin reply render', async ({ page }) => {
    await start(page, [apiReview(1, { images: apiPhotos(2, 'ph'), adminReply: 'Thanks for the kind words!', adminRepliedAt: '2026-11-02T03:00:00.000Z' })])
    await openReviews(page)
    await expect(section(page).getByRole('img', { name: 'Photo 1 from Reviewer Number1' })).toBeVisible()
    await expect(section(page).getByRole('img', { name: 'Photo 2 from Reviewer Number1' })).toBeVisible()
    await expect(section(page).getByText('Reply from SilhouFit')).toBeVisible()
    await expect(section(page).getByText('Thanks for the kind words!')).toBeVisible()
  })
})

test.describe('filters, sort and pages', () => {
  test('a star chip sends the rating param, resets to page 1 and toggles off', async ({ page }) => {
    await start(page)
    await openReviews(page)
    await section(page).getByRole('navigation', { name: 'Pagination' }).getByRole('button', { name: 'Next' }).click()
    await expect(page.getByText('Displaying 11–20 of 23')).toBeVisible()
    expect(lastQuery().get('page')).toBe('2')

    const four = chips(page).getByRole('button', { name: '4 stars' })
    await four.click()
    await expect(four).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByText('Displaying 1–5 of 5')).toHaveCount(0) // one page: no pagination
    await expect(items(page)).toHaveCount(5)
    expect(lastQuery().get('rating')).toBe('4')
    expect(lastQuery().get('page')).toBe('1')
    // The summary stays on the whole product, not the filter.
    await expect(section(page).getByText('23 reviews')).toBeVisible()

    await four.click()
    await expect(four).toHaveAttribute('aria-pressed', 'false')
    await expect(items(page)).toHaveCount(10)
    expect(lastQuery().has('rating')).toBe(false)
  })

  test('a filter change from page 3 returns to page 1', async ({ page }) => {
    await start(page)
    await openReviews(page)
    const next = section(page).getByRole('button', { name: 'Next' })
    await next.click()
    await expect(page.getByText('Displaying 11–20 of 23')).toBeVisible()
    await next.click()
    await expect(page.getByText('Displaying 21–23 of 23')).toBeVisible()
    await chips(page).getByRole('button', { name: '5 stars' }).click()
    await expect(items(page)).toHaveCount(5)
    expect(lastQuery().get('page')).toBe('1')
  })

  test('With photos sends hasImages=true and lists only reviews with photos', async ({ page }) => {
    await start(page)
    await openReviews(page)
    const photos = chips(page).getByRole('button', { name: 'With photos' })
    await photos.click()
    await expect(photos).toHaveAttribute('aria-pressed', 'true')
    await expect(items(page)).toHaveCount(5) // reviews 4, 8, 12, 16, 20
    expect(lastQuery().get('hasImages')).toBe('true')
    await expect(section(page).getByRole('img', { name: /^Photo 1 from / })).toHaveCount(5)
  })

  test('sort sends sortBy and the order follows', async ({ page }) => {
    await start(page)
    await openReviews(page)
    await section(page).getByRole('combobox', { name: /Sort reviews/ }).click()
    await page.getByRole('option', { name: 'Lowest rating' }).click()
    await expect(items(page).first()).toContainText('Reviewer Number5')
    expect(lastQuery().get('sortBy')).toBe('lowest_rating')
    expect(lastQuery().get('page')).toBe('1')

    await section(page).getByRole('combobox', { name: /Sort reviews/ }).click()
    await page.getByRole('option', { name: 'Oldest' }).click()
    await expect(items(page).first()).toContainText('Reviewer Number23')
    expect(lastQuery().get('sortBy')).toBe('oldest')
  })

  test('pagination moves between pages and disables Prev and Next at the ends', async ({ page }) => {
    await start(page)
    await openReviews(page)
    const nav = section(page).getByRole('navigation', { name: 'Pagination' })
    await expect(nav.getByRole('button', { name: 'Prev' })).toBeDisabled()
    // The numbered buttons show from 640px up; below that the nav says "Page N of M".
    const numbered = (n: number) => nav.getByRole('button', { name: `Page ${n}` })
    const wide = (page.viewportSize()?.width ?? 0) >= 640
    if (wide) await expect(numbered(1)).toHaveAttribute('aria-current', 'page')
    else await expect(nav.getByText('Page 1 of 3')).toBeVisible()

    await nav.getByRole('button', { name: 'Next' }).click()
    await expect(items(page).first()).toContainText('Reviewer Number11')
    if (wide) await expect(numbered(2)).toHaveAttribute('aria-current', 'page')
    else await expect(nav.getByText('Page 2 of 3')).toBeVisible()
    expect(lastQuery().get('page')).toBe('2')

    if (wide) await numbered(3).click()
    else await nav.getByRole('button', { name: 'Next' }).click()
    await expect(items(page)).toHaveCount(3)
    await expect(page.getByText('Displaying 21–23 of 23')).toBeVisible()
    await expect(nav.getByRole('button', { name: 'Next' })).toBeDisabled()

    await nav.getByRole('button', { name: 'Prev' }).click()
    await expect(items(page).first()).toContainText('Reviewer Number11')
  })

  test('a single page of reviews shows no pagination', async ({ page }) => {
    await start(page, many().slice(0, 4))
    await openReviews(page)
    await expect(items(page)).toHaveCount(4)
    await expect(section(page).getByRole('navigation', { name: 'Pagination' })).toHaveCount(0)
    await expect(section(page).getByText('4 reviews')).toBeVisible()
  })

  test('the filters work with the keyboard', async ({ page }) => {
    await start(page)
    await openReviews(page)
    const two = chips(page).getByRole('button', { name: '2 stars' })
    await two.focus()
    await page.keyboard.press('Enter')
    await expect(two).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(() => lastQuery().get('rating')).toBe('2')
    await page.keyboard.press('Tab')
    await expect(chips(page).getByRole('button', { name: '3 stars' })).toBeFocused()
    await page.keyboard.press('Space')
    await expect.poll(() => lastQuery().get('rating')).toBe('3')
  })
})

test.describe('states', () => {
  test('a 500 shows an error with Try again, and Try again loads the reviews', async ({ page }) => {
    await start(page)
    let fail = true
    reviews.on.list = () => (fail ? { status: 500, json: { statusCode: 500, message: 'Internal server error' } } : undefined)
    await openReviews(page)
    const alert = section(page).getByRole('alert')
    await expect(alert).toContainText("We couldn't load the reviews")
    await expect(page.getByRole('heading', { level: 1, name: 'Linen Shirt' })).toBeVisible() // the rest of the page stays
    fail = false
    await alert.getByRole('button', { name: 'Try again' }).click()
    await expect(items(page)).toHaveCount(10)
    await expect(section(page).getByRole('alert')).toHaveCount(0)
  })

  test('a dropped connection shows the network copy', async ({ page }) => {
    await start(page)
    reviews.on.list = () => 'abort'
    await openReviews(page)
    await expect(section(page).getByRole('alert')).toContainText('connection dropped')
    await expect(section(page).getByRole('button', { name: 'Try again' })).toBeVisible()
  })

  test('a slow answer shows the loading skeleton before the reviews', async ({ page }) => {
    await start(page)
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    await page.route((url) => /\/products\/[^/]+\/reviews$/.test(url.pathname) && url.origin !== 'http://localhost:5173', async (route) => {
      await gate
      await route.fallback()
    })
    await openReviews(page)
    await expect(section(page).getByRole('listitem').filter({ hasText: 'Reviewer Number' })).toHaveCount(0)
    await expect(section(page).getByText('No reviews yet')).toHaveCount(0)
    await expect(section(page).getByRole('alert')).toHaveCount(0)
    release()
    await expect(items(page)).toHaveCount(10)
  })

  test('a product with no reviews shows the empty state with a link to orders', async ({ page }) => {
    await start(page, [])
    await openReviews(page)
    await expect(section(page).getByText('No reviews yet')).toBeVisible()
    await expect(section(page).getByRole('link', { name: 'Go to your orders' })).toHaveAttribute('href', '/orders')
    await expect(chips(page)).toHaveCount(0)
  })

  test('a filter with no matches shows the empty copy and Clear filters restores the list', async ({ page }) => {
    // Only 5-star reviews, so the 1-star chip finds none.
    await start(page, many().map((r) => ({ ...r, rating: 5 })))
    await openReviews(page)
    await chips(page).getByRole('button', { name: '1 star' }).click()
    await expect(section(page).getByText('No 1-star reviews')).toBeVisible()
    await expect(section(page).getByText('Nothing matches these filters.', { exact: false })).toBeVisible()
    await expect(chips(page).getByRole('button', { name: '1 star' })).toHaveAttribute('aria-pressed', 'true') // the filters stay reachable
    await chips(page).getByRole('button', { name: 'With photos' }).click()
    await expect(section(page).getByText('No 1-star reviews with photos')).toBeVisible()
    await section(page).getByRole('button', { name: 'Clear filters' }).click()
    await expect(items(page)).toHaveCount(10)
    await expect(chips(page).getByRole('button', { name: '1 star' })).toHaveAttribute('aria-pressed', 'false')
    await expect(chips(page).getByRole('button', { name: 'With photos' })).toHaveAttribute('aria-pressed', 'false')
    expect(lastQuery().has('rating')).toBe(false)
    expect(lastQuery().has('hasImages')).toBe(false)
  })

  test('a photo that fails to load shows its name instead of a broken image', async ({ page }) => {
    await start(page, [apiReview(1, { images: [{ id: 'bad', url: 'https://photos.silhoufit.test/missing.svg', displayOrder: 0 }] })])
    await page.route('https://photos.silhoufit.test/missing.svg', (route) => route.fulfill({ status: 404, body: '' }))
    await openReviews(page)
    await expect(section(page).getByText('Photo could not load')).toBeVisible()
  })
})

test.describe('layout', () => {
  test.describe('at 1280px', () => {
    test.use({ viewport: { width: 1280, height: 800 } })

    test('the page scrolls down to the reviews below the one-screen product layout', async ({ page }) => {
      await start(page)
      await page.goto('/shop/linen-shirt')
      await expect(page.getByRole('heading', { level: 1, name: 'Linen Shirt' })).toBeVisible({ timeout: 15000 })
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight + 200)).toBe(true)
      await expect(page.getByRole('heading', { level: 2, name: 'Reviews' })).not.toBeInViewport()
      await openReviews(page)
      await expect(items(page).first()).toBeVisible()
      expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
      expect(await overflows(page)).toBe(false)
    })

    test('changing the page scrolls back to the Reviews heading', async ({ page }) => {
      await start(page)
      await openReviews(page)
      await section(page).getByRole('button', { name: 'Next' }).click()
      await expect(items(page).first()).toContainText('Reviewer Number11')
      await expect(page.getByRole('heading', { level: 2, name: 'Reviews' })).toBeInViewport()
    })
  })

  for (const width of [320, 1280]) {
    test(`no horizontal scroll at ${width}px, with long text, photos and an admin reply`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 })
      const long = 'Unbroken' + 'x'.repeat(120) + ' and a long sentence that keeps going '.repeat(8)
      await start(page, many().map((r, i) => (i === 0 ? { ...r, comment: long, images: apiPhotos(5, 'wide'), adminReply: long, adminRepliedAt: r.createdAt } : r)))
      await openReviews(page)
      await expect(items(page).first()).toBeVisible()
      expect(await overflows(page)).toBe(false)
      await section(page).getByRole('button', { name: 'Next' }).click()
      await expect(page.getByText('Displaying 11–20 of 23')).toBeVisible()
      expect(await overflows(page)).toBe(false)
    })
  }

  test('the controls are at least 44px tall on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 })
    await start(page)
    await openReviews(page)
    const controls = [chips(page).getByRole('button', { name: '1 star' }), chips(page).getByRole('button', { name: 'With photos' }), section(page).getByRole('combobox', { name: /Sort reviews/ }), section(page).getByRole('button', { name: 'Next' })]
    for (const control of controls) {
      await control.scrollIntoViewIfNeeded()
      expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(43.5)
    }
  })
})

test.describe('dark mode', () => {
  test('renders the summary, filters and reviews with readable text', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await start(page)
    await openReviews(page)
    await expect(page.locator('html')).toHaveClass(/dark/)
    await expect(items(page)).toHaveCount(10)
    const surface = await section(page).evaluate((el) => {
      let bg = 'rgba(0, 0, 0, 0)'
      for (let n: Element | null = el; n; n = n.parentElement) {
        const v = getComputedStyle(n).backgroundColor
        if (v !== 'rgba(0, 0, 0, 0)') { bg = v; break }
      }
      const text = getComputedStyle(el.querySelector('li p') as Element).color
      return { bg, text }
    })
    const lum = (rgb: string) => {
      const [r, g, b] = (rgb.match(/\d+(\.\d+)?/g) ?? ['0', '0', '0']).slice(0, 3).map(Number)
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    expect(lum(surface.bg), `background ${surface.bg}`).toBeLessThan(lum(surface.text))
    await chips(page).getByRole('button', { name: '5 stars' }).click()
    await expect(items(page)).toHaveCount(5)
  })
})

test('the reviews request uses the product id of the page', async ({ page }) => {
  await start(page)
  const urls: string[] = []
  page.on('request', (request) => /\/reviews\?/.test(request.url()) && urls.push(request.url()))
  await openReviews(page)
  await expect(items(page).first()).toBeVisible()
  expect(urls[0]).toContain(`/products/${LINEN_SHIRT_ID}/reviews?`)
})
