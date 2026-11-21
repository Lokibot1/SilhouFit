import { expect as baseExpect, test, type Page } from '@playwright/test'
import { adminRefund, manyAdminRefunds, mockAdminRefunds, type AdminRefundsMock } from '../shared/adminRefunds'
import { mockStaffMe } from '../shared/products'
import { DEMO, mockAuth } from '../shared/session'

// The Refunds page against the /admin/refunds endpoints, which tests/shared/adminRefunds.ts answers. Auth and /users/me are mocked (as an admin).
// A staff member cannot open this page, so "staff sees no actions" is covered in tests/admin/RefundsPage.test.tsx.

const expect = baseExpect.configure({ timeout: 10_000 })

async function setup(page: Page, count = 12): Promise<AdminRefundsMock> {
  await mockAuth(page)
  await mockStaffMe(page, 'admin')
  await page.addInitScript(() => localStorage.setItem('silhoufit-cookie-consent', 'accepted'))
  const mock = await mockAdminRefunds(page, manyAdminRefunds(count))
  await page.goto(`/login?next=${encodeURIComponent('/admin/refunds')}`)
  await page.getByLabel('Email', { exact: true }).fill(DEMO.email)
  await page.getByLabel('Password', { exact: true }).fill(DEMO.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Refunds' })).toBeVisible({ timeout: 20_000 })
  return mock
}

const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
const order = (n: number) => adminRefund(n).order.orderNumber
// The table and the cards both draw the order number as a button; only one is visible.
const orderButton = (page: Page, n: number) => page.getByRole('button', { name: order(n) }).filter({ visible: true })

test('lists the refunds with no sample badge, and the status tab and search send the right query', async ({ page }) => {
  const mock = await setup(page)
  await expect(orderButton(page, 1)).toBeVisible()
  await expect(page.getByText('Sample data', { exact: true })).toHaveCount(0)
  expect(mock.lists[0].get('sortBy')).toBe('createdAt')
  await page.getByRole('tab', { name: 'Failed' }).click()
  await expect.poll(() => mock.lists.at(-1)?.get('status')).toBe('FAILED')
  await page.getByRole('textbox', { name: /Search refunds/ }).fill('anne')
  await expect.poll(() => mock.lists.at(-1)?.get('search')).toBe('anne')
})

test('an admin retries a failed refund after confirming, and sees the gateway refusal inline', async ({ page }) => {
  const mock = await setup(page, 3)
  await orderButton(page, 1).click()
  const dialog = page.getByRole('dialog', { name: order(1) })
  await dialog.getByRole('button', { name: 'Retry refund' }).click()
  await expect(dialog.getByText('Are you sure?')).toBeVisible()
  expect(mock.posts).toHaveLength(0)
  await dialog.getByRole('button', { name: 'Retry refund', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText("The gateway didn't accept the retry.")
  expect(mock.posts).toEqual([`/${mock.refunds[0].id}/retry`])
})

test('stays inside a 320px screen', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 })
  await setup(page)
  await expect(orderButton(page, 1)).toBeVisible()
  expect(await overflow(page)).toBe(0)
})

// The refund actions. The API answers retry and sync with 200 even when the gateway refused, so the sheet reads the returned status.
const sheet = (page: Page) => page.getByRole('dialog')
const toast = (page: Page, text: string | RegExp) => page.getByRole('status').or(page.getByRole('alert')).filter({ hasText: text })
const rowOf = (page: Page, n: number) => page.getByRole('row').or(page.getByRole('listitem')).filter({ hasText: order(n) })
const GONE = 'That refund no longer exists, so the list was refreshed.'

/** Opens refund n's sheet and waits for its details (the Payment ref line is part of them, and the actions follow). */
async function openSheet(page: Page, n: number) {
  await orderButton(page, n).click()
  await expect(sheet(page).getByText('Payment ref')).toBeVisible()
  return sheet(page)
}

async function closeSheet(page: Page) {
  await page.keyboard.press('Escape')
  await expect(sheet(page)).toHaveCount(0)
}

test.describe('retry', () => {
  test('Cancel on the confirmation sends nothing', async ({ page }) => {
    const mock = await setup(page, 3)
    const dialog = await openSheet(page, 1)
    await dialog.getByRole('button', { name: 'Retry refund' }).click()
    await expect(dialog.getByText('Are you sure?')).toBeVisible()
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog.getByText('Are you sure?')).toHaveCount(0)
    await expect(dialog.getByRole('button', { name: 'Retry refund' })).toBeVisible()
    expect(mock.posts).toHaveLength(0)
  })

  test('confirming sends one POST /retry with no body, even on a double click, and a FAILED answer is an inline alert with no success toast', async ({ page }) => {
    const mock = await setup(page, 3)
    const dialog = await openSheet(page, 1)
    await dialog.getByRole('button', { name: 'Retry refund' }).click()
    await dialog.getByRole('button', { name: 'Retry refund', exact: true }).dblclick()
    await expect(dialog.getByRole('alert')).toContainText("The gateway didn't accept the retry.")
    await expect(dialog.getByRole('alert')).toContainText('The gateway balance is too low.')
    expect(mock.posts).toEqual([`/${mock.refunds[0].id}/retry`])
    expect(mock.bodies).toEqual([null])
    await expect(toast(page, /is complete/)).toHaveCount(0)
  })

  test('a SUCCEEDED answer shows the success toast and the list row updates', async ({ page }) => {
    const mock = await setup(page, 3)
    const dialog = await openSheet(page, 1)
    mock.refunds[0] = adminRefund(1, { status: 'SUCCEEDED', failureCode: null, failureMessage: null })
    mock.nextPost = { status: 200, json: mock.refunds[0] }
    await dialog.getByRole('button', { name: 'Retry refund' }).click()
    await dialog.getByRole('button', { name: 'Retry refund', exact: true }).click()
    await expect(toast(page, `Refund for order ${order(1)} is complete`)).toBeVisible()
    await expect(dialog.getByRole('alert')).toHaveCount(0)
    await closeSheet(page)
    await expect(rowOf(page, 1).first()).toContainText('Refunded')
  })

  test('a 409 shows the server sentence inline', async ({ page }) => {
    const mock = await setup(page, 3)
    const dialog = await openSheet(page, 1)
    const sentence = 'Refund has already been submitted to provider. Use sync instead.'
    mock.nextPost = { status: 409, json: { statusCode: 409, message: sentence, error: 'Conflict' } }
    await dialog.getByRole('button', { name: 'Retry refund' }).click()
    await dialog.getByRole('button', { name: 'Retry refund', exact: true }).click()
    await expect(dialog.getByRole('alert')).toContainText("We couldn't retry the refund.")
    await expect(dialog.getByRole('alert')).toContainText(sentence)
  })
})

test.describe('check with gateway', () => {
  test('is offered only with a gateway reference and a refund that is not final', async ({ page }) => {
    const mock = await setup(page, 4)
    mock.refunds[1] = adminRefund(2, { externalRefundId: null })
    mock.refunds[2] = adminRefund(3, { status: 'SUCCEEDED' })
    mock.refunds[3] = adminRefund(4, { status: 'PROCESSING' })
    for (const [n, shown] of [[1, true], [2, false], [3, false], [4, true]] as const) {
      const dialog = await openSheet(page, n)
      await expect(dialog.getByRole('button', { name: 'Check with gateway' })).toHaveCount(shown ? 1 : 0)
      await closeSheet(page)
    }
  })

  test('sends POST /sync with no confirmation, and a PROCESSING answer shows the info toast', async ({ page }) => {
    const mock = await setup(page, 3)
    const dialog = await openSheet(page, 1)
    mock.nextPost = { status: 200, json: adminRefund(1, { status: 'PROCESSING' }) }
    await dialog.getByRole('button', { name: 'Check with gateway' }).click()
    await expect(toast(page, 'Sent to the gateway; it will update when it settles.')).toBeVisible()
    await expect(dialog.getByText('Are you sure?')).toHaveCount(0)
    expect(mock.posts).toEqual([`/${mock.refunds[0].id}/sync`])
    expect(mock.bodies).toEqual([null])
  })
})

test.describe('mark as refunded', () => {
  async function openForm(page: Page, n = 1) {
    const dialog = await openSheet(page, n)
    await dialog.getByRole('button', { name: 'Mark as refunded' }).click()
    return dialog
  }

  test('an empty Reference shows the inline error and sends nothing', async ({ page }) => {
    const mock = await setup(page, 3)
    const dialog = await openForm(page)
    await dialog.getByRole('button', { name: 'Review' }).click()
    await expect(dialog.getByText('Enter the reference of the payment that returned the money, such as a bank transfer number.')).toBeVisible()
    await expect(dialog.getByRole('textbox', { name: 'Reference', exact: true })).toBeFocused()
    await expect(dialog.getByText('Are you sure?')).toHaveCount(0)
    expect(mock.posts).toHaveLength(0)
  })

  test('strips emoji, counts the characters, and confirming sends exactly the reference and notes', async ({ page }) => {
    const mock = await setup(page, 3)
    const dialog = await openForm(page)
    await dialog.getByRole('textbox', { name: 'Reference', exact: true }).fill('BANK \u{1F600} 123')
    await expect(dialog.getByRole('textbox', { name: 'Reference', exact: true })).toHaveValue('BANK 123')
    await expect(dialog.getByText('8/128')).toBeVisible()
    await dialog.getByRole('textbox', { name: 'Notes' }).fill('Paid by transfer \u{1F389}')
    await expect(dialog.getByText('17/500').or(dialog.getByText('16/500'))).toBeVisible()
    await dialog.getByRole('button', { name: 'Review' }).click()
    await expect(dialog.getByText('Are you sure?')).toBeVisible()
    expect(mock.posts).toHaveLength(0)
    mock.nextPost = { status: 200, json: adminRefund(1, { status: 'SUCCEEDED', manualReference: 'BANK 123', resolutionType: 'MANUAL' }) }
    await dialog.getByRole('button', { name: 'Mark as refunded', exact: true }).click()
    await expect(toast(page, `Refund for order ${order(1)} marked as refunded.`)).toBeVisible()
    expect(mock.posts).toEqual([`/${mock.refunds[0].id}/resolve-manual`])
    expect(mock.bodies).toEqual([{ manualReference: 'BANK 123', notes: 'Paid by transfer' }])
  })

  test('leaves the notes out of the body when they are empty', async ({ page }) => {
    const mock = await setup(page, 3)
    const dialog = await openForm(page)
    await dialog.getByRole('textbox', { name: 'Reference', exact: true }).fill('TRF-1')
    await dialog.getByRole('button', { name: 'Review' }).click()
    await dialog.getByRole('button', { name: 'Mark as refunded', exact: true }).click()
    await expect.poll(() => mock.bodies).toEqual([{ manualReference: 'TRF-1' }])
  })

  test('a 409 shows the server sentence inline', async ({ page }) => {
    const mock = await setup(page, 3)
    const dialog = await openForm(page)
    const sentence = 'Cannot manually resolve a refund while status is PROCESSING. Sync with the provider first.'
    mock.nextPost = { status: 409, json: { statusCode: 409, message: sentence, error: 'Conflict' } }
    await dialog.getByRole('textbox', { name: 'Reference', exact: true }).fill('TRF-1')
    await dialog.getByRole('button', { name: 'Review' }).click()
    await dialog.getByRole('button', { name: 'Mark as refunded', exact: true }).click()
    await expect(dialog.getByRole('alert')).toContainText("We couldn't mark the refund as refunded.")
    await expect(dialog.getByRole('alert')).toContainText(sentence)
  })

  test('is absent for a SUCCEEDED and a CANCELLED refund', async ({ page }) => {
    const mock = await setup(page, 2)
    mock.refunds[0] = adminRefund(1, { status: 'SUCCEEDED' })
    mock.refunds[1] = adminRefund(2, { status: 'CANCELLED' })
    for (const n of [1, 2]) {
      const dialog = await openSheet(page, n)
      await expect(dialog.getByRole('button', { name: 'Mark as refunded' })).toHaveCount(0)
      await expect(dialog.getByRole('button', { name: 'Retry refund' })).toHaveCount(0)
      await closeSheet(page)
    }
  })
})

test.describe('a refund that is gone', () => {
  test('a 404 on open offers a refresh that closes the sheet and reloads the list', async ({ page }) => {
    const mock = await setup(page, 3)
    const before = mock.lists.length
    mock.refunds.splice(0, 1)
    await orderButton(page, 1).click()
    await expect(sheet(page).getByText('This refund no longer exists.')).toBeVisible()
    await sheet(page).getByRole('button', { name: 'Refresh the list' }).click()
    await expect(sheet(page)).toHaveCount(0)
    await expect(toast(page, GONE)).toBeVisible()
    await expect.poll(() => mock.lists.length).toBeGreaterThan(before)
    await expect(orderButton(page, 1)).toHaveCount(0)
  })

  test('a 404 on an action closes the sheet and reloads the list', async ({ page }) => {
    const mock = await setup(page, 3)
    const dialog = await openSheet(page, 1)
    const before = mock.lists.length
    mock.refunds.splice(0, 1)
    mock.nextPost = { status: 404, json: { statusCode: 404, message: 'Refund not found', error: 'Not Found' } }
    await dialog.getByRole('button', { name: 'Retry refund' }).click()
    await dialog.getByRole('button', { name: 'Retry refund', exact: true }).click()
    await expect(sheet(page)).toHaveCount(0)
    await expect(toast(page, GONE)).toBeVisible()
    await expect.poll(() => mock.lists.length).toBeGreaterThan(before)
  })
})
