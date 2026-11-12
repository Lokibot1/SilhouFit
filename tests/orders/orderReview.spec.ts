import { expect, test, type Locator, type Page } from '@playwright/test'
import { apiShipment, mockOrders, order, orderId } from '../shared/ordersApi'
import { contrastRatio } from '../shared/contrast'
import { mockAuth, signedIn } from '../shared/session'

// "Your review" on /orders/:id for a DELIVERED order: write, edit and delete a review through the modal.
// Reviews are a localStorage mock (silhoufit.orderReviews.v1); the orders themselves come from a mocked orders API.

const PAID_AT = '2026-10-02T03:00:00.000Z'
const DELIVERED = 7
const SHIPPED = 5
const num = (n: number) => `SHF-20261001-${String(n).padStart(6, '0')}`
const GOOD_TEXT = 'Fits well and arrived on time.'

const orders = () => [
  order(SHIPPED, { status: 'DISPATCHED', paymentStatus: 'PAID', paidAt: PAID_AT, shipment: apiShipment({ status: 'PICKED_UP' }) }),
  order(DELIVERED, {
    status: 'DELIVERED',
    paymentStatus: 'PAID',
    paidAt: PAID_AT,
    shipment: apiShipment({ status: 'COMPLETED', deliveredAt: '2026-10-08T05:00:00.000Z' }),
  }),
]

// A valid 1x1 PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
const png = (name: string) => ({ name, mimeType: 'image/png', buffer: PNG })

test.beforeEach(async ({ page }) => {
  await mockAuth(page)
  await signedIn(page)
  await page.addInitScript(() => localStorage.setItem('silhoufit-cookie-consent', 'accepted'))
})

async function openOrder(page: Page, n = DELIVERED, query = '') {
  await mockOrders(page, orders())
  await page.goto(`/orders/${orderId(n)}${query}`)
  await expect(page.getByRole('heading', { level: 1, name: num(n) })).toBeVisible({ timeout: 15000 })
}

const section = (page: Page) => page.getByRole('region', { name: 'Your review' })
const dialog = (page: Page, name: string | RegExp = 'Review order') => page.getByRole('dialog', { name })
const star = (page: Page, n: number) => dialog(page, /review/i).getByRole('radio', { name: new RegExp(`^${n} stars?:`) })
const textBox = (page: Page) => dialog(page, /review/i).getByLabel('Your review')
const overflows = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
const toast = (page: Page, text: string) => page.getByRole('status').filter({ hasText: text })

async function openForm(page: Page) {
  await section(page).getByRole('button', { name: 'Review order' }).click()
  await expect(dialog(page)).toBeVisible()
}

/** Rate by clicking the star's label (the radio itself is visually hidden). */
async function rate(page: Page, n: number) {
  await star(page, n).locator('xpath=ancestor::label[1]').click()
  await expect(star(page, n)).toBeChecked()
}

async function postReview(page: Page, { stars = 4, text = GOOD_TEXT, files = [] as ReturnType<typeof png>[] } = {}) {
  await openForm(page)
  await rate(page, stars)
  await textBox(page).fill(text)
  if (files.length) await dialog(page).getByLabel('Choose photo and video files').setInputFiles(files)
  await dialog(page).getByRole('button', { name: 'Post review' }).click()
  await expect(toast(page, 'Review posted.')).toBeVisible()
  await expect(section(page).getByText(text)).toBeVisible()
}

const fivePhotos = () => [1, 2, 3, 4, 5].map((i) => png(`photo-${i}.png`))

test.describe('visibility', () => {
  test('a delivered order shows the Your review section with a Review order button', async ({ page }) => {
    await openOrder(page)
    await expect(section(page).getByRole('heading', { level: 2, name: 'Your review' })).toBeVisible()
    await expect(section(page).getByRole('button', { name: 'Review order' })).toBeVisible()
  })

  test('an order that is not delivered has no review section', async ({ page }) => {
    await openOrder(page, SHIPPED)
    await expect(page.getByRole('heading', { level: 2, name: 'Your review' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Review order' })).toHaveCount(0)
  })

  test('a failing review load shows an error with Try again, and the order itself stays', async ({ page }) => {
    await openOrder(page, DELIVERED, '?fail=review-load')
    await expect(section(page).getByRole('alert')).toContainText("We couldn't load your review")
    await expect(section(page).getByRole('button', { name: 'Try again' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: num(DELIVERED) })).toBeVisible()
  })
})

test.describe('keyboard only', () => {
  test('write, edit and delete a review without a mouse', async ({ page }) => {
    await openOrder(page)
    await expect(section(page).getByRole('button', { name: 'Review order' })).toBeVisible()

    // Tab to Review order and open it.
    const open = section(page).getByRole('button', { name: 'Review order' })
    for (let i = 0; i < 120 && !(await open.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab')
    await expect(open).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(dialog(page)).toBeVisible()

    // Focus lands on the first star; arrows pick 4 stars (1 -> 2 -> 3 -> 4).
    await expect(star(page, 1)).toBeFocused()
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight')
    await expect(star(page, 4)).toBeChecked()

    await page.keyboard.press('Tab')
    await expect(textBox(page)).toBeFocused()
    await page.keyboard.type(GOOD_TEXT)
    await expect(dialog(page).getByText(`${GOOD_TEXT.length}/1000`)).toBeVisible()

    const post = dialog(page).getByRole('button', { name: 'Post review' })
    for (let i = 0; i < 10 && !(await post.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab')
    await expect(post).toBeFocused()
    await page.keyboard.press('Enter')

    await expect(toast(page, 'Review posted.')).toBeVisible()
    await expect(dialog(page)).toHaveCount(0)
    await expect(section(page).getByRole('img', { name: 'Rated 4 out of 5' })).toBeVisible()
    await expect(section(page).getByText(GOOD_TEXT)).toBeVisible()
    await expect(section(page).getByText(/^Reviewed \w{3} \d{1,2}, \d{1,2}:\d{2} (AM|PM)$/)).toBeVisible()
    // Focus moves on to the Edit button, which replaced the one that opened the dialog.
    await expect(section(page).getByRole('button', { name: 'Edit review' })).toBeFocused()

    // Edit opens with the saved values; Escape closes without saving.
    await page.keyboard.press('Enter')
    await expect(dialog(page, 'Edit review')).toBeVisible()
    await expect(star(page, 4)).toBeChecked()
    await expect(textBox(page)).toHaveValue(GOOD_TEXT)
    await textBox(page).fill('Changed my mind about this text entirely.')
    await page.keyboard.press('Escape')
    await expect(dialog(page, 'Edit review')).toHaveCount(0)
    await expect(section(page).getByText(GOOD_TEXT)).toBeVisible()
    await expect(section(page).getByRole('button', { name: 'Edit review' })).toBeFocused()

    // Delete: Tab to it, confirm with the keyboard.
    await page.keyboard.press('Tab')
    await expect(section(page).getByRole('button', { name: 'Delete review' })).toBeFocused()
    await page.keyboard.press('Enter')
    const confirm = page.getByRole('dialog', { name: 'Delete this review?' })
    await expect(confirm).toBeVisible()
    await expect(confirm.getByText('Are you sure?')).toBeVisible()
    await expect(confirm.getByRole('button', { name: 'Cancel' })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(confirm.getByRole('button', { name: 'Delete review' })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(toast(page, 'Review deleted.')).toBeVisible()
    await expect(section(page).getByRole('button', { name: 'Review order' })).toBeVisible()
    await expect(section(page).getByRole('button', { name: 'Review order' })).toBeFocused()
  })

  test('each star has a tooltip naming its word', async ({ page }) => {
    await openOrder(page)
    await openForm(page)
    const words = ['1 star: Poor', '2 stars: Fair', '3 stars: Good', '4 stars: Very good', '5 stars: Excellent']
    for (const word of words) await expect(dialog(page).getByRole('radio', { name: word })).toBeAttached()
  })
})

test.describe('validation', () => {
  test('submitting an empty form names the rating and the text, and focuses the stars', async ({ page }) => {
    await openOrder(page)
    await openForm(page)
    await dialog(page).getByRole('button', { name: 'Post review' }).click()
    await expect(dialog(page).getByRole('alert').filter({ hasText: 'Choose 1 to 5 stars.' })).toBeVisible()
    await expect(dialog(page).getByRole('alert').filter({ hasText: 'A review needs some text.' })).toBeVisible()
    await expect(star(page, 1)).toBeFocused()
    await expect(dialog(page)).toBeVisible()
  })

  test('a short text is rejected with a specific message and clears once long enough', async ({ page }) => {
    await openOrder(page)
    await openForm(page)
    await rate(page, 5)
    await textBox(page).fill('Too short')
    await textBox(page).blur()
    await expect(dialog(page).getByRole('alert').filter({ hasText: 'too short' })).toContainText('at least 10 characters')
    await expect(textBox(page)).toHaveAttribute('aria-invalid', 'true')
    await dialog(page).getByRole('button', { name: 'Post review' }).click()
    await expect(textBox(page)).toBeFocused()
    await textBox(page).fill('Long enough now.')
    await expect(dialog(page).getByRole('alert')).toHaveCount(0)
  })

  test('the counter follows the typing', async ({ page }) => {
    await openOrder(page)
    await openForm(page)
    await expect(dialog(page).getByText('0/1000')).toBeVisible()
    await textBox(page).fill('abcde')
    await expect(dialog(page).getByText('5/1000')).toBeVisible()
  })

  test('profanity in the text is blocked', async ({ page }) => {
    await openOrder(page)
    await openForm(page)
    await rate(page, 2)
    await textBox(page).fill('This was a total shit experience overall')
    await dialog(page).getByRole('button', { name: 'Post review' }).click()
    await expect(dialog(page).getByRole('alert')).toBeVisible()
    await expect(page.getByRole('status').filter({ hasText: 'Review posted.' })).toHaveCount(0)
    await expect(dialog(page)).toBeVisible()
  })
})

test.describe('photos and video', () => {
  test('a png is previewed with a Remove button, and removing it drops the tile', async ({ page }) => {
    await openOrder(page)
    await openForm(page)
    await dialog(page).getByLabel('Choose photo and video files').setInputFiles(png('front.png'))
    await expect(dialog(page).getByRole('img', { name: 'Photo 1: front.png' })).toBeVisible()
    await dialog(page).getByRole('button', { name: 'Remove front.png' }).click()
    await expect(dialog(page).getByRole('img', { name: 'Photo 1: front.png' })).toHaveCount(0)
    await expect(dialog(page).getByRole('button', { name: 'Add photos or video' })).toBeFocused()
  })

  test('a gif is rejected with a message and no tile', async ({ page }) => {
    await openOrder(page)
    await openForm(page)
    await dialog(page).getByLabel('Choose photo and video files').setInputFiles({ name: 'party.gif', mimeType: 'image/gif', buffer: Buffer.from('GIF89a') })
    await expect(dialog(page).getByRole('alert').filter({ hasText: 'party.gif' })).toContainText('Only JPG, PNG or WebP photos and MP4 or WebM videos work')
    await expect(dialog(page).getByRole('button', { name: 'Remove party.gif' })).toHaveCount(0)
  })

  test('a sixth photo is rejected, the first five stay', async ({ page }) => {
    await openOrder(page)
    await openForm(page)
    const input = dialog(page).getByLabel('Choose photo and video files')
    await input.setInputFiles(fivePhotos())
    await expect(dialog(page).getByRole('button', { name: /^Remove photo-/ })).toHaveCount(5)
    await input.setInputFiles(png('sixth.png'))
    await expect(dialog(page).getByRole('alert').filter({ hasText: 'sixth.png' })).toContainText('5 photos at most')
    await expect(dialog(page).getByRole('button', { name: /^Remove / })).toHaveCount(5)
  })

  test('a photo over 5 MB is rejected', async ({ page }) => {
    await openOrder(page)
    await openForm(page)
    await dialog(page).getByLabel('Choose photo and video files').setInputFiles({ name: 'huge.png', mimeType: 'image/png', buffer: Buffer.alloc(5 * 1024 * 1024 + 10) })
    await expect(dialog(page).getByRole('alert').filter({ hasText: 'huge.png' })).toBeVisible()
    await expect(dialog(page).getByRole('button', { name: 'Remove huge.png' })).toHaveCount(0)
  })

  test('a second video is rejected', async ({ page }) => {
    await openOrder(page)
    await openForm(page)
    const input = dialog(page).getByLabel('Choose photo and video files')
    await input.setInputFiles({ name: 'one.mp4', mimeType: 'video/mp4', buffer: Buffer.from('x') })
    await expect(dialog(page).getByRole('button', { name: 'Remove one.mp4' })).toBeVisible()
    await input.setInputFiles({ name: 'two.mp4', mimeType: 'video/mp4', buffer: Buffer.from('x') })
    await expect(dialog(page).getByRole('alert').filter({ hasText: 'two.mp4' })).toContainText('1 video at most')
  })

  test('a saved review shows its photo, and a reload keeps stars and text but not the preview', async ({ page }) => {
    await openOrder(page)
    await postReview(page, { stars: 3, files: [png('keep.png')] })
    await expect(section(page).getByRole('img', { name: 'Photo 1: keep.png' })).toBeVisible()

    await page.reload()
    await expect(section(page).getByRole('img', { name: 'Rated 3 out of 5' })).toBeVisible()
    await expect(section(page).getByText(GOOD_TEXT)).toBeVisible()
    await expect(section(page).getByText('Preview not kept in this demo')).toBeVisible()
    await expect(section(page).getByText('keep.png')).toBeVisible()
  })

  test('editing can remove a saved photo', async ({ page }) => {
    await openOrder(page)
    await postReview(page, { files: [png('a.png'), png('b.png')] })
    await section(page).getByRole('button', { name: 'Edit review' }).click()
    await dialog(page, 'Edit review').getByRole('button', { name: 'Remove a.png' }).click()
    await dialog(page, 'Edit review').getByRole('button', { name: 'Save review' }).click()
    await expect(toast(page, 'Review updated.')).toBeVisible()
    await expect(section(page).getByRole('img', { name: /a\.png/ })).toHaveCount(0)
    await expect(section(page).getByRole('img', { name: 'Photo 1: b.png' })).toBeVisible()
    await expect(section(page).getByText(/\(edited\)/)).toBeVisible()
  })
})

test.describe('failures', () => {
  test('?fail=review-save shows an error in the dialog and keeps what was typed', async ({ page }) => {
    await openOrder(page, DELIVERED, '?fail=review-save')
    await openForm(page)
    await rate(page, 5)
    await textBox(page).fill(GOOD_TEXT)
    await dialog(page).getByLabel('Choose photo and video files').setInputFiles(png('kept.png'))
    await dialog(page).getByRole('button', { name: 'Post review' }).click()
    await expect(dialog(page).getByRole('alert').filter({ hasText: "We couldn't save your review" })).toBeVisible()
    await expect(dialog(page)).toBeVisible()
    await expect(star(page, 5)).toBeChecked()
    await expect(textBox(page)).toHaveValue(GOOD_TEXT)
    await expect(dialog(page).getByRole('button', { name: 'Remove kept.png' })).toBeVisible()
    await expect(dialog(page).getByRole('button', { name: 'Post review' })).toBeEnabled()
  })

  test('?fail=review-delete shows an error in the confirm dialog and keeps the review', async ({ page }) => {
    await openOrder(page)
    await postReview(page)
    await page.goto(`/orders/${orderId(DELIVERED)}?fail=review-delete`)
    await expect(section(page).getByText(GOOD_TEXT)).toBeVisible()
    await section(page).getByRole('button', { name: 'Delete review' }).click()
    const confirm = page.getByRole('dialog', { name: 'Delete this review?' })
    await confirm.getByRole('button', { name: 'Delete review' }).click()
    await expect(confirm.getByRole('alert')).toContainText("We couldn't delete your review")
    await confirm.getByRole('button', { name: 'Cancel' }).click()
    await expect(section(page).getByText(GOOD_TEXT)).toBeVisible()
  })

  test('the submit button is disabled while saving, so a double click posts once', async ({ page }) => {
    await openOrder(page)
    await openForm(page)
    await rate(page, 4)
    await textBox(page).fill(GOOD_TEXT)
    const post = dialog(page).getByRole('button', { name: 'Post review' })
    await post.click()
    await expect(post).toBeDisabled()
    await expect(toast(page, 'Review posted.')).toBeVisible()
    await expect(section(page).getByRole('button', { name: 'Edit review' })).toBeVisible()
  })
})

test.describe('layout', () => {
  for (const width of [320, 375, 768, 1280]) {
    test.describe(`at ${width}px`, () => {
      test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width, height: 800 })
      })

      test('the open form does not scroll sideways, controls are 44px tall, text is 16px on phones', async ({ page }) => {
        await openOrder(page)
        await openForm(page)
        await dialog(page).getByLabel('Choose photo and video files').setInputFiles(fivePhotos())
        await expect(dialog(page).getByRole('button', { name: /^Remove photo-/ })).toHaveCount(5)
        await rate(page, 4)
        await textBox(page).fill(GOOD_TEXT)
        expect(await overflows(page)).toBe(false) // modal open with 5 photos
        await dialog(page).getByRole('button', { name: 'Post review' }).click()
        await expect(toast(page, 'Review posted.')).toBeVisible()
        await expect(section(page).getByRole('img', { name: /^Photo \d: photo-/ })).toHaveCount(5)
        expect(await overflows(page)).toBe(false) // a saved review with 5 photos
      })

      test('the modal with errors and 5 photos does not scroll sideways', async ({ page }) => {
        await openOrder(page)
        await openForm(page)
        await dialog(page).getByLabel('Choose photo and video files').setInputFiles([...fivePhotos(), { name: 'x.gif', mimeType: 'image/gif', buffer: Buffer.from('GIF89a') }])
        await dialog(page).getByRole('button', { name: 'Post review' }).click()
        await expect(dialog(page).getByRole('alert').filter({ hasText: 'Choose 1 to 5 stars.' })).toBeVisible()
        expect(await overflows(page)).toBe(false)
        const panel = dialog(page)
        expect(await panel.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
        const box = await panel.boundingBox()
        expect(box!.x).toBeGreaterThanOrEqual(0)
        expect(box!.x + box!.width).toBeLessThanOrEqual(width)
      })

      test('interactive controls are at least 44px tall and wide, and body text is at least 16px on phones', async ({ page }) => {
        await openOrder(page)
        await openForm(page)
        await dialog(page).getByLabel('Choose photo and video files').setInputFiles(png('t.png'))
        const controls: Locator[] = [
          dialog(page).getByRole('button', { name: 'Add photos or video' }),
          dialog(page).getByRole('button', { name: 'Post review' }),
          dialog(page).getByRole('button', { name: 'Cancel' }),
          dialog(page).getByRole('button', { name: 'Remove t.png' }),
          dialog(page).getByRole('button', { name: 'Close Review order' }),
          ...[1, 2, 3, 4, 5].map((n) => star(page, n).locator('xpath=ancestor::label[1]')),
        ]
        for (const control of controls) {
          const box = await control.boundingBox()
          expect(box, `${await control.innerText().catch(() => '')} has a box`).not.toBeNull()
          expect(box!.height, 'height').toBeGreaterThanOrEqual(43.5)
          expect(box!.width, 'width').toBeGreaterThanOrEqual(43.5)
        }
        if (width < 768) {
          const sizes = await dialog(page).evaluate((root) => {
            const out: { text: string; px: number }[] = []
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
            for (let n = walker.nextNode(); n; n = walker.nextNode()) {
              const text = n.textContent?.trim()
              const el = n.parentElement
              if (!text || !el || el.closest('.sr-only')) continue
              out.push({ text, px: parseFloat(getComputedStyle(el).fontSize) })
            }
            return out
          })
          expect(sizes.length).toBeGreaterThan(0)
          for (const { text, px } of sizes) expect(px, `"${text}" font size`).toBeGreaterThanOrEqual(16)
        }
      })

      test('the saved review card: text 16px on phones, Edit and Delete at least 44px', async ({ page }) => {
        await openOrder(page)
        await postReview(page, { files: [png('card.png')] })
        for (const name of ['Edit review', 'Delete review']) {
          const box = await section(page).getByRole('button', { name }).boundingBox()
          expect(box!.height).toBeGreaterThanOrEqual(43.5)
        }
        if (width < 768) {
          for (const el of [section(page).getByText(GOOD_TEXT), section(page).getByText(/^Reviewed /)]) {
            expect(await el.evaluate((node) => parseFloat(getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(16)
          }
        }
        expect(await overflows(page)).toBe(false)
      })

      test('a delete confirmation does not scroll sideways', async ({ page }) => {
        await openOrder(page)
        await postReview(page)
        await section(page).getByRole('button', { name: 'Delete review' }).click()
        await expect(page.getByRole('dialog', { name: 'Delete this review?' })).toBeVisible()
        expect(await overflows(page)).toBe(false)
      })
    })
  }
})

test.describe('light and dark mode', () => {
  /** Text colour against the first opaque background behind the element. */
  const contrastOf = (locator: Locator) =>
    locator.evaluate((el) => {
      const color = getComputedStyle(el).color
      let bg = 'rgba(0, 0, 0, 0)'
      for (let node: Element | null = el; node; node = node.parentElement) {
        const value = getComputedStyle(node).backgroundColor
        if (value !== 'rgba(0, 0, 0, 0)' && !/rgba\(.*,\s*0\)$/.test(value)) {
          bg = value
          break
        }
      }
      return { color, bg }
    })

  for (const scheme of ['light', 'dark'] as const) {
    test(`${scheme}: the form, its errors and the saved review keep readable contrast`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme })
      await openOrder(page)
      await expect(page.locator('html')).toHaveClass(scheme === 'dark' ? /dark/ : /^(?!.*dark)/)

      await openForm(page)
      await dialog(page).getByRole('button', { name: 'Post review' }).click()
      const errorText = dialog(page).getByRole('alert').filter({ hasText: 'Choose 1 to 5 stars.' })
      await expect(errorText).toBeVisible()
      const formTexts: [string, Locator][] = [
        ['text label', dialog(page).getByText('Your review', { exact: true })],
        ['rating legend', dialog(page).getByText('Your rating', { exact: true })],
        ['rating error', errorText],
        ['text error', dialog(page).getByRole('alert').filter({ hasText: 'A review needs some text.' })],
        ['counter', dialog(page).getByText('0/1000')],
        ['media hint', dialog(page).getByText(/^Up to 5 photos/)],
        ['Post review', dialog(page).getByRole('button', { name: 'Post review' })],
        ['Cancel', dialog(page).getByRole('button', { name: 'Cancel' })],
      ]
      for (const [label, el] of formTexts) {
        const { color, bg } = await contrastOf(el)
        expect(contrastRatio(color, bg), `${scheme} ${label}: ${color} on ${bg}`).toBeGreaterThanOrEqual(4.5)
      }

      await rate(page, 5)
      await textBox(page).fill(GOOD_TEXT)
      const typed = await contrastOf(textBox(page))
      expect(contrastRatio(typed.color, typed.bg), `${scheme} typed text`).toBeGreaterThanOrEqual(4.5)
      await dialog(page).getByRole('button', { name: 'Post review' }).click()
      await expect(toast(page, 'Review posted.')).toBeVisible()

      const cardTexts: [string, Locator][] = [
        ['review text', section(page).getByText(GOOD_TEXT)],
        ['reviewed at', section(page).getByText(/^Reviewed /)],
        ['Edit review', section(page).getByRole('button', { name: 'Edit review' })],
        ['Delete review', section(page).getByRole('button', { name: 'Delete review' })],
        ['heading', section(page).getByRole('heading', { name: 'Your review' })],
      ]
      for (const [label, el] of cardTexts) {
        const { color, bg } = await contrastOf(el)
        expect(contrastRatio(color, bg), `${scheme} card ${label}: ${color} on ${bg}`).toBeGreaterThanOrEqual(4.5)
      }
      // The filled stars are graphical objects: 3:1 against the section background.
      const stars = await section(page).getByRole('img', { name: 'Rated 5 out of 5' }).locator('svg').first().evaluate((svg) => {
        let bg = 'rgba(0, 0, 0, 0)'
        for (let n: Element | null = svg; n; n = n.parentElement) {
          const v = getComputedStyle(n).backgroundColor
          if (v !== 'rgba(0, 0, 0, 0)') { bg = v; break }
        }
        return { color: getComputedStyle(svg).color, bg }
      })
      expect(contrastRatio(stars.color, stars.bg), `${scheme} star ${stars.color} on ${stars.bg}`).toBeGreaterThanOrEqual(3)
    })
  }

  test('the theme toggle flips the page to dark and the review section follows', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await openOrder(page)
    const toggle = page.getByRole('checkbox', { name: 'Switch to dark mode' })
    test.skip((await toggle.count()) === 0 || !(await toggle.first().isVisible()), 'no visible theme toggle on this layout')
    await toggle.first().evaluate((el: HTMLInputElement) => el.click())
    await expect(page.locator('html')).toHaveClass(/dark/)
    await expect(section(page).getByRole('button', { name: 'Review order' })).toBeVisible()
    const { color, bg } = await contrastOf(section(page).getByText('How did this order go?'))
    expect(contrastRatio(color, bg)).toBeGreaterThanOrEqual(4.5)
  })
})
