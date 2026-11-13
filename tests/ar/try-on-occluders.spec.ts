import { expect, test, type Page } from '@playwright/test'
import { goLive } from '../shared/arFeed'

// Depth-only occluders (forearms and face) over the shirt. The stage reports which ones are drawn as data-occluders="L,R,face" (0 or 1, the
// forearms by screen side); the specs read that and never pixels.

const occluders = (page: Page) => page.locator('[data-occluders]')
const arm = { elbowL: { out: 0, down: 100, v: 1 }, elbowR: { out: 0, down: 100, v: 1 } }

test.describe('AR try-on occluders', () => {
  test('a forearm in front of the body is an occluder, and one behind it is not', async ({ page }) => {
    await goLive(page)
    await expect(occluders(page)).toHaveAttribute('data-occluders', '0,0,0')
    await page.evaluate((a) => Object.assign(window.__arFeed, a, { wristL: { out: 0, down: 200, v: 1, z: 0 }, wristR: { out: 0, down: 200, v: 1, z: 0 } }), arm)
    await expect(occluders(page)).toHaveAttribute('data-occluders', '1,1,0', { timeout: 10000 })
    // Left of the screen only: 0.2 m behind the shoulder midpoint is behind the body.
    await page.evaluate(() => (window.__arFeed.wristL = { out: 0, down: 200, v: 1, z: 0.2 }))
    await expect(occluders(page)).toHaveAttribute('data-occluders', '0,1,0', { timeout: 10000 })
    await page.evaluate(() => (window.__arFeed.wristL = { out: 0, down: 200, v: 1, z: 0 }))
    await expect(occluders(page)).toHaveAttribute('data-occluders', '1,1,0', { timeout: 10000 })
  })

  test('needs the elbow and the wrist both visible', async ({ page }) => {
    await goLive(page)
    await page.evaluate((a) => Object.assign(window.__arFeed, a, { wristL: { out: 0, down: 200, v: 0.3 }, wristR: { out: 0, down: 200, v: 1 } }), arm)
    await expect(occluders(page)).toHaveAttribute('data-occluders', '0,1,0', { timeout: 10000 })
    await page.evaluate(() => Object.assign(window.__arFeed, { wristL: { out: 0, down: 200, v: 1 }, elbowL: { out: 0, down: 100, v: 0.3 } }))
    await expect(occluders(page)).toHaveAttribute('data-occluders', '0,1,0', { timeout: 10000 })
  })

  test('a wrist that is only just seen, or at the edge of the frame, is not an occluder', async ({ page }) => {
    await goLive(page)
    await page.evaluate((a) => Object.assign(window.__arFeed, a, { wristL: { out: 0, down: 200, v: 0.6 }, wristR: { out: 0, down: 200, v: 1 } }), arm)
    await expect(occluders(page)).toHaveAttribute('data-occluders', '0,1,0', { timeout: 10000 })
    // 280 px below the shoulders is 97% of the way down the 480 px frame.
    await page.evaluate(() => Object.assign(window.__arFeed, { wristL: { out: 0, down: 200, v: 1 }, wristR: { out: 0, down: 280, v: 1 } }))
    await expect(occluders(page)).toHaveAttribute('data-occluders', '1,0,0', { timeout: 10000 })
  })

  test('the face is an occluder only while the person faces the camera', async ({ page }) => {
    await goLive(page)
    await page.evaluate(() => (window.__arFeed.faceMarks = true))
    await expect(occluders(page)).toHaveAttribute('data-occluders', '0,0,1', { timeout: 10000 })
    await page.evaluate(() => (window.__arFeed.faceMarks = false))
    await expect(occluders(page)).toHaveAttribute('data-occluders', '0,0,0', { timeout: 10000 })

    // Turn right round with the face still reported visible, as MediaPipe does from behind (hidden hair): no face occluder facing away.
    await page.evaluate(async () => {
      window.__arFeed.faceMarks = true
      window.__arFeed.face = 0.9
      for (let deg = 0; deg <= 180; deg += 4) {
        window.__arFeed.yawDeg = deg
        await new Promise((resolve) => setTimeout(resolve, 70))
      }
    })
    await expect(page.locator('[data-facing]')).toHaveAttribute('data-facing', 'back', { timeout: 10000 })
    await expect(occluders(page)).toHaveAttribute('data-occluders', '0,0,0')
  })

  test('facing away, a forearm counts as in front whatever the depth says', async ({ page }) => {
    await goLive(page)
    await page.evaluate((a) => Object.assign(window.__arFeed, a, { wristL: { out: 0, down: 200, v: 1, z: 0.3 }, wristR: { out: 0, down: 200, v: 1, z: 0 } }), arm)
    await expect(occluders(page)).toHaveAttribute('data-occluders', '0,1,0', { timeout: 10000 })
    await page.evaluate(() => (window.__arFeed.yawDeg = 180))
    await expect(page.locator('[data-facing]')).toHaveAttribute('data-facing', 'back', { timeout: 10000 })
    await expect(occluders(page)).toHaveAttribute('data-occluders', '1,1,0', { timeout: 10000 })
  })
})
