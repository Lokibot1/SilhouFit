import { expect, test } from '@playwright/test'

test('unknown route shows the custom 404 page', async ({ page }) => {
  await page.goto('/this-route-does-not-exist')
  await expect(page.getByRole('heading', { name: /out of stock, out of orbit/i })).toBeVisible()
})

test('legal pages load without a horizontal scrollbar', async ({ page }) => {
  for (const path of ['/about', '/privacy-policy', '/terms-of-service']) {
    await page.goto(path)
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )
    expect(overflows, `${path} overflows horizontally`).toBe(false)
  }
})
