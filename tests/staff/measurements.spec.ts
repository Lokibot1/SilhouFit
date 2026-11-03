import { expect, test, type Locator, type Page } from '@playwright/test'
import { DEMO } from '../shared/session'
import { setupMeasurements, sizeRow, type MockSize, type SizeMeasurementsMock } from '../shared/sizeMeasurements'

// Staff Base measurements against /size-measurements, which the backend has not built yet: tests/shared/sizeMeasurements.ts answers to the
// agreed spec. Auth and /users/me are mocked, and each test signs in through the real form. The page shows a table from md up and cards
// below, so every locator here matches only what is visible.

const hoodies = () => [sizeRow({ size: 'M' }), sizeRow({ size: 'S', chestWidthCm: 52 }), sizeRow({ size: 'XL', chestWidthCm: 60 })]

async function start(page: Page, rows: MockSize[] = hoodies(), options?: { unavailable?: boolean }): Promise<SizeMeasurementsMock> {
  const api = await setupMeasurements(page, rows, options)
  await page.goto('/login?next=%2Fstaff%2Fmeasurements')
  await page.getByLabel('Email', { exact: true }).fill(DEMO.email)
  await page.getByLabel('Password', { exact: true }).fill(DEMO.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/staff\/measurements/)
  await expect(page.getByRole('heading', { level: 1, name: 'Base measurements' })).toBeVisible()
  return api
}

const sheet = (page: Page, name: 'Add size' | 'Edit size') => page.getByRole('dialog', { name, exact: true })
const prompt = (page: Page) => page.getByRole('dialog', { name: 'Are you sure?', exact: true })
const addButton = (page: Page) => page.getByRole('button', { name: 'Add size', exact: true }).first()
const toast = (page: Page, text: string) => page.getByText(text, { exact: true })
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
const action = (page: Page, verb: 'Edit' | 'Archive' | 'Restore', name: string) => page.getByRole('button', { name: `${verb} ${name}`, exact: true })

async function fillSheet(dialog: Locator, size: string, measurements: Record<string, string>) {
  if (size) await dialog.getByLabel('Size', { exact: true }).fill(size)
  for (const [label, value] of Object.entries(measurements)) await dialog.getByLabel(label, { exact: true }).fill(value)
}

test.describe('list', () => {
  test('shows the active Hoodie sizes smallest first, with the Hoodie columns, and asks the API for them', async ({ page }) => {
    const api = await start(page)
    await expect(action(page, 'Edit', 'Hoodie S')).toBeVisible()
    await expect(action(page, 'Edit', 'Hoodie XL')).toBeVisible()
    const order = await page.getByRole('button', { name: /^Edit Hoodie / }).evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))
    expect(order).toEqual(['Edit Hoodie S', 'Edit Hoodie M', 'Edit Hoodie XL'])
    expect(api.of('GET').at(-1)?.query).toEqual({ category: 'Hoodie', status: 'active' })
    expect(await overflow(page)).toBeLessThanOrEqual(0)
    await expect(page).toHaveTitle('Base measurements — SilhouFit')
  })

  test('switches category and between Active and Archived', async ({ page }) => {
    const api = await start(page, [...hoodies(), sizeRow({ category: 'Pants', size: '32', waistWidthCm: 40, chestWidthCm: null, shoulderWidthCm: null, sleeveLengthCm: null, neckCm: null }), sizeRow({ size: 'L', isDeleted: true })])
    await page.getByRole('tab', { name: 'Pants' }).click()
    await expect(action(page, 'Edit', 'Pants 32')).toBeVisible()
    await expect(action(page, 'Edit', 'Hoodie M')).toHaveCount(0)
    await expect(page).toHaveURL(/category=Pants/)
    await page.getByRole('tab', { name: 'Hoodie' }).click()
    await page.getByRole('tab', { name: 'Archived' }).click()
    await expect(action(page, 'Restore', 'Hoodie L')).toBeVisible()
    await expect(action(page, 'Edit', 'Hoodie M')).toHaveCount(0)
    expect(api.of('GET').at(-1)?.query).toEqual({ category: 'Hoodie', status: 'archived' })
  })

  test('shows the empty state with a call to action that opens the sheet', async ({ page }) => {
    await start(page, [])
    await expect(page.getByText('No Hoodie sizes yet')).toBeVisible()
    await page.getByRole('button', { name: 'Add size', exact: true }).last().click()
    await expect(sheet(page, 'Add size')).toBeVisible()
  })

  test('shows an error with the reason and a Retry that loads the list', async ({ page }) => {
    const api = await start(page)
    api.failNext(500)
    await page.getByRole('tab', { name: 'Pants' }).click()
    const alert = page.getByRole('alert').filter({ hasText: "We couldn't load the Pants sizes." })
    await expect(alert).toBeVisible()
    await expect(alert).toContainText('Something went wrong on our side')
    await alert.getByRole('button', { name: 'Retry' }).click()
    await expect(page.getByText('No Pants sizes yet')).toBeVisible()
  })

  test('says it is not available yet on a 404, and Retry works once the API is there', async ({ page }) => {
    const api = await start(page, hoodies(), { unavailable: true })
    await expect(page.getByText("Base measurements aren't available yet")).toBeVisible()
    await expect(page.getByRole('alert')).toHaveCount(0)
    api.unavailable = false
    await page.getByRole('button', { name: 'Retry' }).click()
    await expect(action(page, 'Edit', 'Hoodie M')).toBeVisible()
  })

  test('is reachable from the staff navigation', async ({ page }) => {
    await start(page)
    await page.goto('/staff')
    await expect(page.getByRole('heading', { level: 1, name: 'Hello, Sam' })).toBeVisible()
    const toggle = page.getByRole('button', { name: 'Open menu' })
    if (await toggle.isVisible()) await toggle.click()
    await page.getByRole('link', { name: 'Measurements' }).first().click()
    await expect(page).toHaveURL(/\/staff\/measurements/)
  })
})

test.describe('add a size', () => {
  test('validates inline, posts the exact body, toasts and lists the new row', async ({ page }) => {
    const api = await start(page)
    await addButton(page).click()
    const dialog = sheet(page, 'Add size')
    await dialog.getByRole('button', { name: 'Add size', exact: true }).click()
    await expect(dialog.getByText('Enter a size such as XS.')).toBeVisible()
    await expect(dialog.getByText('Enter at least one measurement.')).toBeVisible()
    await expect(dialog.getByLabel('Size', { exact: true })).toBeFocused()
    expect(api.of('POST')).toHaveLength(0)

    await fillSheet(dialog, 'XXL', { 'Chest width': '300' })
    await dialog.getByLabel('Neck', { exact: true }).focus()
    await expect(dialog.getByText('Enter chest width from 5 to 250 cm.')).toBeVisible()

    await dialog.getByLabel('Chest width', { exact: true }).fill('64.5')
    await dialog.getByLabel('Total length', { exact: true }).fill('74')
    await dialog.getByRole('button', { name: 'Add size', exact: true }).click()

    await expect(toast(page, 'Hoodie XXL added')).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(action(page, 'Edit', 'Hoodie XXL')).toBeVisible()
    expect(api.of('POST')[0].body).toEqual({ category: 'Hoodie', size: 'XXL', chestWidthCm: 64.5, totalLengthCm: 74 })
  })

  test('names the category and size when it already exists (409) and keeps the sheet open', async ({ page }) => {
    const api = await start(page)
    await addButton(page).click()
    const dialog = sheet(page, 'Add size')
    await fillSheet(dialog, 'M', { 'Chest width': '56' })
    await dialog.getByRole('button', { name: 'Add size', exact: true }).click()
    await expect(dialog.getByText('An active Hoodie M already exists. Edit that one, or use a different size.').first()).toBeVisible()
    await expect(dialog.getByLabel('Size', { exact: true })).toBeFocused()
    await expect(dialog.getByLabel('Size', { exact: true })).toHaveAttribute('aria-invalid', 'true')
    expect(api.rows.filter((r) => r.size === 'M')).toHaveLength(1)
    // A different size clears it.
    await dialog.getByLabel('Size', { exact: true }).fill('L')
    await dialog.getByRole('button', { name: 'Add size', exact: true }).click()
    await expect(toast(page, 'Hoodie L added')).toBeVisible()
  })

  test('shows the server messages on a 400', async ({ page }) => {
    const api = await start(page)
    await addButton(page).click()
    const dialog = sheet(page, 'Add size')
    await fillSheet(dialog, 'XS', { 'Chest width': '50' })
    api.failNext(400, { statusCode: 400, message: ['chestWidthCm must be between 5 and 250', 'size is taken by a rule'], error: 'Bad Request' })
    await dialog.getByRole('button', { name: 'Add size', exact: true }).click()
    await expect(dialog.getByRole('alert')).toContainText('chestWidthCm must be between 5 and 250; size is taken by a rule')
  })

  test('can start in another category through the Category select', async ({ page }) => {
    const api = await start(page)
    await addButton(page).click()
    const dialog = sheet(page, 'Add size')
    await dialog.getByRole('combobox', { name: 'Category' }).first().click()
    await page.getByRole('option', { name: 'Headwear' }).click()
    await fillSheet(dialog, 'One size', { Neck: '58' })
    await dialog.getByRole('button', { name: 'Add size', exact: true }).click()
    await expect(toast(page, 'Headwear One size added')).toBeVisible()
    await expect(page).toHaveURL(/category=Headwear/)
    await expect(action(page, 'Edit', 'Headwear One size')).toBeVisible()
    expect(api.of('POST')[0].body).toEqual({ category: 'Headwear', size: 'One size', neckCm: 58 })
  })
})

test.describe('edit a size', () => {
  test('pre-fills the row, sends only the changed fields and refreshes the row', async ({ page }) => {
    const api = await start(page)
    await action(page, 'Edit', 'Hoodie M').click()
    const dialog = sheet(page, 'Edit size')
    await expect(dialog.getByLabel('Chest width', { exact: true })).toHaveValue('55')
    await expect(dialog.getByRole('button', { name: 'Save size' })).toBeDisabled()
    await dialog.getByLabel('Chest width', { exact: true }).fill('56')
    await dialog.getByLabel('Neck', { exact: true }).fill('')
    await dialog.getByRole('button', { name: 'Save size' }).click()
    await expect(toast(page, 'Hoodie M updated')).toBeVisible()
    expect(api.of('PATCH')[0].body).toEqual({ chestWidthCm: 56, neckCm: null })
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  test('asks before discarding edits', async ({ page }) => {
    const api = await start(page)
    await action(page, 'Edit', 'Hoodie M').click()
    const dialog = sheet(page, 'Edit size')
    await dialog.getByLabel('Chest width', { exact: true }).fill('99')
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(prompt(page)).toBeVisible()
    await expect(prompt(page).getByRole('button', { name: 'Cancel' })).toBeFocused()
    await prompt(page).getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog.getByLabel('Chest width', { exact: true })).toHaveValue('99')
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await prompt(page).getByRole('button', { name: 'Discard changes' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect(api.of('PATCH')).toHaveLength(0)
  })
})

test.describe('archive and restore', () => {
  test('Cancel keeps the row; Archive size removes it, toasts, and Restore brings it back from Archived', async ({ page }) => {
    const api = await start(page)
    await action(page, 'Archive', 'Hoodie M').click()
    const confirm = prompt(page)
    await expect(confirm).toContainText('Hoodie M will be hidden')
    await expect(confirm.getByRole('button', { name: 'Cancel' })).toBeFocused()
    await confirm.getByRole('button', { name: 'Cancel' }).click()
    await expect(action(page, 'Archive', 'Hoodie M')).toBeVisible()
    await expect(action(page, 'Archive', 'Hoodie M')).toBeFocused()
    expect(api.of('DELETE')).toHaveLength(0)

    await action(page, 'Archive', 'Hoodie M').click()
    await prompt(page).getByRole('button', { name: 'Archive size' }).click()
    await expect(toast(page, 'Hoodie M archived')).toBeVisible()
    expect(api.of('DELETE')).toHaveLength(1)
    expect(api.of('DELETE')[0].id).toBe(api.rows.find((r) => r.size === 'M')?.id)
    expect(api.rows.find((r) => r.size === 'M')?.isDeleted).toBe(true)
    await expect(action(page, 'Archive', 'Hoodie M')).toHaveCount(0)
    // The row left the tab: focus moves to the next row's Edit button (M was followed by XL).
    await expect(action(page, 'Edit', 'Hoodie XL')).toBeFocused()

    await page.getByRole('tab', { name: 'Archived' }).click()
    await action(page, 'Restore', 'Hoodie M').click()
    await expect(toast(page, 'Hoodie M restored')).toBeVisible()
    expect(api.of('POST').filter((c) => c.id)).toHaveLength(1)
    expect(api.of('PATCH')).toHaveLength(0)
    await expect(page.getByText('No archived Hoodie sizes')).toBeVisible()
    await page.getByRole('tab', { name: 'Active' }).click()
    await expect(action(page, 'Edit', 'Hoodie M')).toBeVisible()
  })

  test('Undo restores what was just archived', async ({ page }) => {
    const api = await start(page)
    await action(page, 'Archive', 'Hoodie S').click()
    await prompt(page).getByRole('button', { name: 'Archive size' }).click()
    await page.getByRole('button', { name: 'Undo' }).click()
    await expect(toast(page, 'Hoodie S restored')).toBeVisible()
    await expect(action(page, 'Edit', 'Hoodie S')).toBeFocused()
    expect(api.rows.find((r) => r.size === 'S')?.isDeleted).toBe(false)
  })

  test('a restore that finds an active row of the same size says so (409)', async ({ page }) => {
    await start(page, [...hoodies(), sizeRow({ size: 'M', isDeleted: true })])
    await page.getByRole('tab', { name: 'Archived' }).click()
    await action(page, 'Restore', 'Hoodie M').click()
    await expect(page.getByText(/Couldn't restore Hoodie M\. An active Hoodie M already exists\. Edit that one, or use a different size\./)).toBeVisible()
    // Retrying cannot work until that row is edited, so the toast offers the active row instead.
    await expect(page.getByRole('button', { name: 'Retry' })).toHaveCount(0)
    await page.getByRole('button', { name: 'View active Hoodie M' }).click()
    await expect(page).not.toHaveURL(/status=archived/)
    await expect(page.getByRole('tab', { name: 'Active' })).toHaveAttribute('aria-selected', 'true')
    await expect(action(page, 'Edit', 'Hoodie M')).toBeFocused()
  })

  test('focus is never on the page between confirming an archive and landing on the next row', async ({ page }) => {
    await start(page)
    await action(page, 'Archive', 'Hoodie M').click()
    await page.evaluate(() => {
      const w = window as unknown as { bodyFocus: number }
      w.bodyFocus = 0
      const sample = () => {
        if (document.activeElement === document.body) w.bodyFocus += 1
        requestAnimationFrame(sample)
      }
      requestAnimationFrame(sample)
    })
    await prompt(page).getByRole('button', { name: 'Archive size' }).click()
    await expect(action(page, 'Edit', 'Hoodie XL')).toBeFocused()
    expect(await page.evaluate(() => (window as unknown as { bodyFocus: number }).bodyFocus)).toBe(0)
  })

  test('a failed archive keeps the prompt open and says why', async ({ page }) => {
    const api = await start(page)
    await action(page, 'Archive', 'Hoodie M').click()
    api.failNext(403)
    await prompt(page).getByRole('button', { name: 'Archive size' }).click()
    await expect(prompt(page).getByRole('alert')).toContainText("Couldn't archive Hoodie M.")
    await expect(prompt(page).getByRole('alert')).toContainText('not allowed')
  })
})

test.describe('keyboard and focus', () => {
  test('the sheet opens from the keyboard, traps Tab, closes with Escape and returns focus to Add size', async ({ page }) => {
    await start(page)
    await addButton(page).focus()
    await page.keyboard.press('Enter')
    const dialog = sheet(page, 'Add size')
    await expect(dialog).toBeVisible()
    for (let n = 0; n < 40; n += 1) {
      await page.keyboard.press('Tab')
      expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true)
    }
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(addButton(page)).toBeFocused()
  })

  test('category tabs move with the arrow keys and only the open one is in the Tab order', async ({ page }) => {
    await start(page)
    const hoodie = page.getByRole('tab', { name: 'Hoodie' })
    await hoodie.focus()
    await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('tab', { name: 'Pants' })).toBeFocused()
    await expect(page.getByRole('tab', { name: 'Pants' })).toHaveAttribute('aria-selected', 'true')
    await expect(hoodie).toHaveAttribute('tabindex', '-1')
    await page.keyboard.press('End')
    await expect(page.getByRole('tab', { name: 'Shorts' })).toBeFocused()
  })
})

test.describe('responsive', () => {
  for (const width of [320, 768, 1280, 1920]) {
    test(`nothing scrolls sideways at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 })
      await start(page)
      await expect(action(page, 'Edit', 'Hoodie M')).toBeVisible()
      expect(await overflow(page)).toBeLessThanOrEqual(0)
      await addButton(page).click()
      await expect(sheet(page, 'Add size')).toBeVisible()
      expect(await overflow(page)).toBeLessThanOrEqual(0)
    })
  }

  test('at 320px the sheet footer and the archive prompt buttons are at least 44px tall', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 })
    await start(page)
    await action(page, 'Archive', 'Hoodie M').click()
    for (const name of ['Cancel', 'Archive size']) {
      await expect.poll(async () => (await prompt(page).getByRole('button', { name, exact: true }).boundingBox())!.height).toBeGreaterThanOrEqual(44)
    }
    await prompt(page).getByRole('button', { name: 'Cancel' }).click()
    await addButton(page).click()
    const dialog = sheet(page, 'Add size')
    for (const name of ['Cancel', 'Add size']) {
      await expect.poll(async () => (await dialog.getByRole('button', { name, exact: true }).boundingBox())!.height).toBeGreaterThanOrEqual(44)
    }
    await expect.poll(async () => (await dialog.getByLabel('Chest width', { exact: true }).boundingBox())!.height).toBeGreaterThanOrEqual(44)
  })

  test('numbers are right-aligned and tabular', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await start(page)
    const cell = page.getByRole('table').getByRole('cell').nth(0)
    expect(await cell.evaluate((el) => getComputedStyle(el).textAlign)).toBe('right')
    expect(await cell.evaluate((el) => getComputedStyle(el).fontVariantNumeric)).toContain('tabular-nums')
  })
})

test.describe('dark mode', () => {
  test('the list, sheet and archive prompt render with text that differs from the surface', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('silhoufit-theme', 'dark'))
    await page.emulateMedia({ colorScheme: 'dark' })
    await start(page)
    const colors = (locator: Locator) =>
      locator.evaluate((el) => {
        let bg = 'rgba(0, 0, 0, 0)'
        for (let node: Element | null = el; node; node = node.parentElement) {
          bg = getComputedStyle(node).backgroundColor
          if (bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') break
        }
        return { text: getComputedStyle(el).color, bg }
      })

    const heading = await colors(page.getByRole('heading', { level: 1, name: 'Base measurements' }))
    expect(heading.text).not.toBe(heading.bg)
    await action(page, 'Archive', 'Hoodie M').click()
    const copy = await colors(prompt(page).getByText('will be hidden', { exact: false }))
    expect(copy.text).not.toBe(copy.bg)
    await prompt(page).getByRole('button', { name: 'Cancel' }).click()
    await addButton(page).click()
    const input = await colors(sheet(page, 'Add size').getByLabel('Chest width', { exact: true }))
    expect(input.text).not.toBe(input.bg)
  })
})

// Feature "Size measurements – View row" (GET /size-measurements/:id): Edit reads the row again before the form opens.
test.describe('Size measurements – View row', () => {
  const rowOf = (api: SizeMeasurementsMock, size: string) => api.rows.find((r) => r.size === size)!
  const getsOne = (api: SizeMeasurementsMock) => api.of('GET').filter((c) => c.id !== null)

  test('shows a skeleton, then the fresh values rather than the list row', async ({ page }) => {
    const api = await start(page)
    // The list was loaded with a chest of 55; someone has changed it since.
    rowOf(api, 'M').chestWidthCm = 58
    let open!: () => void
    const held = new Promise<void>((resolve) => (open = resolve))
    await page.route(
      (url) => url.pathname === `/size-measurements/${rowOf(api, 'M').id}`,
      async (route) => {
        if (route.request().method() === 'GET') await held
        return route.fallback()
      },
    )

    await action(page, 'Edit', 'Hoodie M').click()
    const dialog = sheet(page, 'Edit size')
    await expect(dialog.getByRole('status', { name: 'Loading the size' })).toBeVisible()
    await expect(dialog.getByLabel('Chest width', { exact: true })).toBeHidden()
    open()

    await expect(dialog.getByRole('status', { name: 'Loading the size' })).toHaveCount(0)
    await expect(dialog.getByLabel('Chest width', { exact: true })).toHaveValue('58')
    await expect(dialog.getByRole('button', { name: 'Save size' })).toBeDisabled()
    expect(getsOne(api)).toHaveLength(1)

    // Saving the fresh form changes only what the person edited.
    await dialog.getByLabel('Chest width', { exact: true }).fill('59')
    await dialog.getByRole('button', { name: 'Save size' }).click()
    await expect(toast(page, 'Hoodie M updated')).toBeVisible()
    expect(api.of('PATCH')[0].body).toEqual({ chestWidthCm: 59 })
  })

  test('a network error shows an alert with Try again, which loads the row', async ({ page }) => {
    const api = await start(page)
    let attempts = 0
    await page.route(
      (url) => url.pathname === `/size-measurements/${rowOf(api, 'M').id}`,
      (route) => {
        if (route.request().method() === 'GET' && (attempts += 1) === 1) return route.abort('failed')
        return route.fallback()
      },
    )

    await action(page, 'Edit', 'Hoodie M').click()
    const dialog = sheet(page, 'Edit size')
    const alert = dialog.getByRole('alert').filter({ hasText: "Couldn't open the size." })
    await expect(alert).toBeVisible()
    await expect(alert).toContainText('The connection dropped before the server answered. Check your connection, then try again.')
    await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeVisible()
    await expect(dialog.getByLabel('Chest width', { exact: true })).toBeHidden()

    await dialog.getByRole('button', { name: 'Try again' }).click()
    await expect(alert).toHaveCount(0)
    await expect(dialog.getByLabel('Chest width', { exact: true })).toHaveValue('55')
    expect(attempts).toBe(2)
  })

  test('a 404 says the size is gone and offers only Close', async ({ page }) => {
    const api = await start(page)
    api.failNext(404, { statusCode: 404, message: 'Size measurement not found' })
    await action(page, 'Edit', 'Hoodie M').click()

    const dialog = sheet(page, 'Edit size')
    const alert = dialog.getByRole('alert').filter({ hasText: "Couldn't open the size." })
    await expect(alert).toBeVisible()
    await expect(alert).toContainText('That size no longer exists')
    await expect(dialog.getByRole('button', { name: 'Try again' })).toHaveCount(0)
    await expect(dialog.getByRole('button', { name: 'Save size' })).toHaveCount(0)
    await dialog.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect(getsOne(api)).toHaveLength(1)
  })

  test('a 409 on save still names the size and keeps the sheet open', async ({ page }) => {
    const api = await start(page)
    await action(page, 'Edit', 'Hoodie M').click()
    const dialog = sheet(page, 'Edit size')
    await expect(dialog.getByLabel('Chest width', { exact: true })).toHaveValue('55')

    api.failNext(409, { statusCode: 409, message: 'Size already exists', error: 'Conflict' })
    await dialog.getByLabel('Chest width', { exact: true }).fill('56')
    await dialog.getByRole('button', { name: 'Save size' }).click()
    await expect(dialog.getByText('An active Hoodie M already exists. Edit that one, or use a different size.').first()).toBeVisible()
    await expect(dialog.getByLabel('Chest width', { exact: true })).toHaveValue('56')
  })
})
