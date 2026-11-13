import { expect, test, type Page } from '@playwright/test'
import { feedPoses } from '../shared/arFeed'
import { start, stage, stubCamera } from '../shared/tryOn'

// The ?debug=ar "Draw tracking" toggle. The specs read attributes only, never pixels: the drawing itself is checked by eye.

async function live(page: Page, query: string) {
  await feedPoses(page)
  await stubCamera(page, 'live')
  await start(page)
  await page.goto(`/shop/linen-shirt/try-on${query}`)
  await page.getByRole('button', { name: 'Turn on camera' }).click({ timeout: 15000 })
  await expect(page.locator('[data-tracking="tracking"]')).toBeVisible({ timeout: 15000 })
}
const toggle = (page: Page) => page.getByRole('button', { name: 'Draw tracking' })

test.describe('AR try-on draw tracking toggle', () => {
  test('does not exist without ?debug=ar', async ({ page }) => {
    await live(page, '')
    await expect(page.getByRole('button', { name: 'Flip front/back' })).toBeVisible()
    await expect(toggle(page)).toHaveCount(0)
    await expect(stage(page).locator('canvas[aria-hidden="true"]')).toHaveCount(1)
  })

  test('is a 44 px toggle, off at first, that works by mouse and keyboard and has a tooltip', async ({ page }) => {
    await live(page, '?debug=ar')
    const button = toggle(page)
    await expect(button).toBeVisible()
    const box = (await button.boundingBox())!
    expect(box.width).toBeGreaterThanOrEqual(44)
    expect(box.height).toBeGreaterThanOrEqual(44)
    await expect(button).not.toHaveAttribute('title')
    await expect(button).toHaveAttribute('aria-pressed', 'false')
    await button.hover()
    await expect(page.getByRole('tooltip')).toHaveText('Draw tracking')
    await button.click()
    await expect(button).toHaveAttribute('aria-pressed', 'true')
    await button.focus()
    await page.keyboard.press('Enter')
    await expect(button).toHaveAttribute('aria-pressed', 'false')
  })

  test('has a hidden, click-through canvas the size of the stage, and turns off with the camera', async ({ page }) => {
    await live(page, '?debug=ar')
    const canvas = stage(page).locator('canvas[aria-hidden="true"]').last()
    await expect(canvas).toHaveCSS('pointer-events', 'none')
    const [box, canvasBox] = [(await stage(page).boundingBox())!, (await canvas.boundingBox())!]
    // The stage has a 1 px border all round, which the canvas sits inside.
    expect(Math.abs(canvasBox.width - box.width)).toBeLessThanOrEqual(2)
    expect(Math.abs(canvasBox.height - box.height)).toBeLessThanOrEqual(2)
    await toggle(page).click()
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: 'Turn camera off' }).click()
    await expect(toggle(page)).toHaveCount(0)
    await page.getByRole('button', { name: 'Turn on camera' }).click()
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false', { timeout: 15000 })
  })
})
