import { expect, test, type Page } from '@playwright/test'
import { feedPoses } from '../shared/arFeed'
import { start } from '../shared/tryOn'

// The shirt's light follows a 16 x 12 luminance sample of the live video (see components/ar/lightProbe.ts). The stage reports it as data-light="lum,balance"
// (balance positive = the right of the screen is brighter; the video is mirrored). Own camera stub: a canvas whose two halves have a settable grey level.

declare global {
  interface Window {
    __stubGrey: { left: number; right: number }
  }
}

async function live(page: Page) {
  await feedPoses(page)
  await page.addInitScript(() => {
    window.__stubGrey = { left: 128, right: 128 }
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: () => {
          const canvas = document.createElement('canvas')
          canvas.width = 640
          canvas.height = 480
          const ctx = canvas.getContext('2d')!
          let n = 0
          setInterval(() => {
            const { left, right } = window.__stubGrey
            // Alternating by one level so the video keeps producing frames.
            const flick = n++ % 2
            ctx.fillStyle = `rgb(${left + flick},${left + flick},${left + flick})`
            ctx.fillRect(0, 0, 320, 480)
            ctx.fillStyle = `rgb(${right + flick},${right + flick},${right + flick})`
            ctx.fillRect(320, 0, 320, 480)
          }, 33)
          return Promise.resolve(canvas.captureStream(30))
        },
      },
    })
  })
  await start(page)
  await page.goto('/shop/linen-shirt/try-on')
  await page.getByRole('button', { name: 'Turn on camera' }).click({ timeout: 15000 })
  await expect(page.locator('[data-tracking="tracking"]')).toBeVisible({ timeout: 15000 })
}
const light = async (page: Page) => {
  const [lum, balance] = ((await page.locator('[data-light]').getAttribute('data-light')) ?? '0,0').split(',').map(Number)
  return { lum, balance }
}

test.describe('AR try-on light from the video', () => {
  test('follows the brightness of the video, and which side of the screen is brighter', async ({ page }) => {
    await live(page)
    await expect(page.locator('[data-light]')).toBeVisible({ timeout: 10000 })
    await expect.poll(async () => (await light(page)).lum, { timeout: 10000 }).toBeCloseTo(0.5, 1)
    expect((await light(page)).balance).toBeCloseTo(0, 1)

    await page.evaluate(() => (window.__stubGrey = { left: 30, right: 30 }))
    await expect.poll(async () => (await light(page)).lum, { timeout: 10000 }).toBeLessThan(0.2)
    await page.evaluate(() => (window.__stubGrey = { left: 240, right: 240 }))
    await expect.poll(async () => (await light(page)).lum, { timeout: 10000 }).toBeGreaterThan(0.8)

    // The video's left half bright is the right of the screen once mirrored.
    await page.evaluate(() => (window.__stubGrey = { left: 220, right: 60 }))
    await expect.poll(async () => (await light(page)).balance, { timeout: 10000 }).toBeGreaterThan(0.2)
    await page.evaluate(() => (window.__stubGrey = { left: 60, right: 220 }))
    await expect.poll(async () => (await light(page)).balance, { timeout: 10000 }).toBeLessThan(-0.2)
  })

  test('makes no network request, and stops with the camera', async ({ page }) => {
    await live(page)
    await expect(page.locator('[data-light]')).toBeVisible({ timeout: 10000 })
    const sent: string[] = []
    page.on('request', (r) => sent.push(r.url()))
    await page.evaluate(() => (window.__stubGrey = { left: 40, right: 40 }))
    await expect.poll(async () => (await light(page)).lum, { timeout: 10000 }).toBeLessThan(0.3)
    expect(sent).toEqual([])
    await page.getByRole('button', { name: 'Turn camera off' }).click()
    await expect(page.locator('[data-light]')).toHaveCount(0)
  })
})
