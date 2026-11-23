import { expect, test, type Page } from '@playwright/test'
import { mockNotifications, notification, orderId, type NotificationsMock } from '../shared/notificationsApi'
import { mockAuth, signedIn } from '../shared/session'

// The customer navbar's notification bell: the server's notifications (mocked API), unread until the panel closes.

/** The bell by its exact label for `unread` unread entries, or by any label when omitted. */
const bell = (page: Page, unread?: number) =>
  unread === undefined ? page.getByRole('button', { name: /^Notifications/ }) : page.getByRole('button', { name: unread ? `Notifications, ${unread} unread` : 'Notifications', exact: true })
const panel = (page: Page) => page.getByRole('group', { name: 'Notifications' })
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

const items = () => [notification(1, { title: 'Payment received', body: 'We got your payment.' }), notification(2, { type: 'SHIPMENT_STATUS_CHANGED', title: 'Out for delivery', body: 'Your order is on its way.' })]

async function open(page: Page, initial = items()): Promise<NotificationsMock> {
  await mockAuth(page)
  await signedIn(page)
  await page.addInitScript(() => localStorage.setItem('silhoufit-cookie-consent', 'accepted'))
  const mock = await mockNotifications(page, initial)
  await page.goto('/wishlist')
  return mock
}

async function insideViewport(page: Page) {
  const box = (await panel(page).boundingBox())!
  const view = page.viewportSize()!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.y).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(view.width)
  expect(box.y + box.height).toBeLessThanOrEqual(view.height)
}

test('the bell shows the unread count, opens on the notifications and links each row', async ({ page }) => {
  await open(page)
  await expect(bell(page, 2)).toHaveText('2')
  await bell(page, 2).click()
  await expect(bell(page, 2)).toHaveAttribute('aria-expanded', 'true')
  await expect(panel(page)).toBeVisible()
  await expect(panel(page).getByText('2 unread')).toBeVisible()
  const rows = panel(page).getByRole('link')
  await expect(rows).toHaveCount(3)
  await expect(rows.nth(0)).toHaveAttribute('href', `/orders/${orderId(2)}`)
  await expect(rows.nth(0)).toContainText('Out for delivery')
  await expect(rows.nth(0)).toContainText('Your order is on its way.')
  await expect(rows.nth(1)).toHaveAttribute('href', `/orders/${orderId(1)}`)
  await expect(rows.nth(1)).toContainText('Payment received')
  await expect(rows.nth(2)).toHaveAttribute('href', '/notifications')
  await expect(panel(page).getByRole('img')).toHaveCount(0)
  await insideViewport(page)
})

test('closing marks everything read on the server, a reload keeps it read and a new notification is unread', async ({ page }) => {
  const mock = await open(page)
  await bell(page, 2).click()
  await expect(panel(page).getByRole('link')).toHaveCount(3)
  await bell(page, 2).click() // the bell again closes it
  await expect(panel(page)).toHaveCount(0)
  await expect(bell(page, 0)).not.toContainText(/\d/)
  expect(mock.marks).toEqual(['all'])

  await page.reload()
  await expect(bell(page, 0)).toBeVisible()

  mock.items.push(notification(3, { title: 'Order cancelled', body: null }))
  await page.reload()
  await bell(page, 1).click()
  const rows = panel(page).getByRole('link')
  await expect(rows.nth(0)).toContainText('Order cancelled')
  await expect(rows.nth(0)).toContainText('Unread') // the screen-reader text; the square dot is its visible twin
  await expect(rows.nth(1)).not.toContainText('Unread')
})

test('Escape closes the panel and returns focus to the bell; Tab and the arrows stay inside', async ({ page }) => {
  await open(page)
  await bell(page, 2).click()
  await expect(panel(page).getByRole('button', { name: 'Mark all read' })).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(panel(page).getByRole('link').nth(0)).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(panel(page).getByRole('button', { name: 'Mark all read' })).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(panel(page).getByRole('link', { name: 'View all notifications' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(panel(page).getByRole('button', { name: 'Mark all read' })).toBeFocused()

  await page.keyboard.press('Escape')
  await expect(panel(page)).toHaveCount(0)
  await expect(bell(page, 0)).toBeFocused()
})

test('a row opens its order and closes the panel', async ({ page }) => {
  await open(page)
  await bell(page, 2).click()
  await panel(page).getByRole('link').nth(1).click()
  await expect(page).toHaveURL(new RegExp(`/orders/${orderId(1)}$`))
  await expect(panel(page)).toHaveCount(0)
})

test('with no notifications it says so and points to the shop; when the list fails it offers a retry', async ({ page }) => {
  const mock = await open(page, [])
  await bell(page, 0).click()
  await expect(panel(page).getByText('No notifications yet')).toBeVisible()
  await expect(panel(page).getByRole('link', { name: 'Continue shopping' })).toHaveAttribute('href', '/shop')
  await expect(panel(page).getByRole('button', { name: 'Mark all read' })).toBeDisabled()
  await page.keyboard.press('Escape')

  mock.on.list = () => ({ status: 500, json: { statusCode: 500, message: 'down' } })
  mock.items.push(...items())
  await page.reload()
  await bell(page).click()
  await expect(panel(page).getByText(/problem loading your notifications/)).toBeVisible()
  mock.on.list = undefined
  await panel(page).getByRole('button', { name: 'Try again' }).click()
  await expect(panel(page).getByRole('link')).toHaveCount(3)
})

test('the notifications page filters to unread and marks all read', async ({ page }) => {
  const mock = await open(page, [...items(), notification(3, { readAt: '2026-11-03T00:00:00.000Z' })])
  await page.goto('/notifications')
  await expect(page.getByRole('button', { name: 'All 3' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Unread 2' }).click()
  await expect(page.getByRole('link', { name: /Payment received|Out for delivery/ })).toHaveCount(2)
  expect(mock.lists.some((q) => q.get('unreadOnly') === 'true')).toBe(true)
  await page.getByRole('button', { name: 'Mark all read' }).click()
  await expect(page.getByText(/all caught up/i)).toBeVisible()
  expect(mock.marks).toEqual(['all'])
})

test('the bar has no sideways scroll and the panel fits on screen at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 })
  await open(page)
  await expect(bell(page, 2)).toBeVisible()
  expect(await overflow(page)).toBeLessThanOrEqual(0)
  expect((await bell(page, 2).boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await bell(page, 2).click()
  await expect(panel(page)).toBeVisible()
  await insideViewport(page)
  expect(await overflow(page)).toBeLessThanOrEqual(0)
})

const REASON = 'x'.repeat(300)
const blocked = () => notification(3, { type: 'MESSAGING_BLOCKED', title: 'Messaging blocked', body: `Your messaging privileges have been blocked. Reason: ${REASON}`, data: { blocked: true, reason: REASON } })
// Nothing real is called: the chat API of the Messages page is refused.
const noChat = (page: Page) => page.route((url) => url.origin !== 'http://localhost:5173' && url.pathname.startsWith('/chat'), (route) => route.abort())

test('a messaging block row opens Messages and closes the panel', async ({ page }) => {
  await noChat(page)
  await open(page, [...items(), blocked()])
  await bell(page, 3).click()
  const row = panel(page).getByRole('link', { name: /Messaging blocked/ })
  await expect(row).toHaveAttribute('href', '/messages')
  await row.click()
  await expect(page).toHaveURL(/\/messages$/)
  await expect(panel(page)).toHaveCount(0)
})

test('a long block reason does not scroll sideways at 320px in the bell or on the page', async ({ page }) => {
  await noChat(page)
  await page.setViewportSize({ width: 320, height: 568 })
  await open(page, [...items(), blocked()])
  await bell(page, 3).click()
  await expect(panel(page).getByText(/Reason: x+/)).toBeVisible()
  await insideViewport(page)
  expect(await overflow(page)).toBeLessThanOrEqual(0)
  await page.keyboard.press('Escape')
  await page.goto('/notifications')
  await expect(page.getByRole('link', { name: /Messaging blocked/ })).toBeVisible()
  expect(await overflow(page)).toBeLessThanOrEqual(0)
})

test('a guest gets no bell', async ({ page }) => {
  await mockAuth(page)
  await page.addInitScript(() => localStorage.setItem('silhoufit-cookie-consent', 'accepted'))
  await page.goto('/wishlist')
  await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible()
  await expect(bell(page)).toHaveCount(0)
})
