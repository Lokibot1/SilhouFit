import { expect, test } from '@playwright/test'

for (const theme of ['light', 'dark'] as const) {
  test.describe(`/link-expired, ${theme} theme`, () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript((t) => localStorage.setItem('silhoufit-theme', t), theme)
    })

    test('shows the expired link page with its title', async ({ page }) => {
      await page.goto('/link-expired')
      await expect(page.getByRole('heading', { name: 'This link has expired' })).toBeVisible()
      await expect(page).toHaveTitle('Link expired — SilhouFit')
    })

    test('has no horizontal scroll at 320px and 44px touch targets', async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 700 })
      await page.goto('/link-expired')
      await expect(page.getByRole('heading', { name: 'This link has expired' })).toBeVisible()
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(overflow).toBeLessThanOrEqual(0)
      for (const name of ['Request a new link', 'Back to login']) {
        const box = await page.getByRole('link', { name }).boundingBox()
        expect(box!.height).toBeGreaterThanOrEqual(44)
      }
    })

    test('Request a new link goes to /forgot-password and Back to login to /login', async ({ page }) => {
      await page.goto('/link-expired')
      await page.getByRole('link', { name: 'Request a new link' }).click()
      await expect(page).toHaveURL(/\/forgot-password$/)
      await page.goBack()
      await page.getByRole('link', { name: 'Back to login' }).click()
      await expect(page).toHaveURL(/\/login$/)
    })
  })
}
