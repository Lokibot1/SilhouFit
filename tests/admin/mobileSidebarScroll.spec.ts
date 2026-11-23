import { expect, test } from '@playwright/test'

// SHF-SB-1: the superadmin's mobile menu is long. Its list sat in its own scroller inside the drawer's scrolling panel, so a finger drag
// on the links went nowhere and only the scrollbar worked. The list must not be a scroller; the panel is.

const SUPERADMIN = { email: 'superadmin@silhoufit.dev', password: 'Super@12345' }

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('silhoufit-cookie-consent', 'accepted'))
})

test('the superadmin menu links are not a nested scroller, so a finger drag on them scrolls the menu', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'The drawer menu is the below-desktop layout')
  await page.setViewportSize({ width: 360, height: 480 })
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill(SUPERADMIN.email)
  await page.getByLabel('Password', { exact: true }).fill(SUPERADMIN.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/superadmin$/)
  await page.getByRole('button', { name: 'Open menu' }).click()
  const dialog = page.getByRole('dialog', { name: 'Menu' })
  await expect(dialog).toBeVisible()

  // The list is not a scroller of its own, so the drawer panel is the one that moves.
  const nav = dialog.getByRole('navigation')
  expect(await nav.evaluate((el) => getComputedStyle(el).overflowY)).toBe('visible')

  const scroller = dialog.locator('div.overflow-y-auto').first()
  expect(await scroller.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true)
})
