import type { Page } from '@playwright/test'
import { signInViaForm } from './checkoutOrders'
import { mockProducts, product, variant, type MockProduct } from './products'
import { mockAuth } from './session'
import { mockSizeMeasurements, sizeRow } from './sizeMeasurements'

// Shared by the AR try-on specs. Linen Shirt (Shirt, AR ready) comes in S, M, L (with standard rows) and XL (without one), in Navy and Black.

export const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }
export const BASE = [
  sizeRow({ category: 'Shirt', size: 'S', chestWidthCm: 48, totalLengthCm: 66, shoulderWidthCm: 42, sleeveLengthCm: 20 }),
  sizeRow({ category: 'Shirt', size: 'M', chestWidthCm: 52, totalLengthCm: 70, shoulderWidthCm: 44, sleeveLengthCm: 21 }),
  sizeRow({ category: 'Shirt', size: 'L', chestWidthCm: 56, totalLengthCm: 72, shoulderWidthCm: 46, sleeveLengthCm: 22 }),
]
// Chest 96 cm, no sleeve length (a short sleeve is compared with the whole arm): S is too tight at the shoulders, M regular (+8.0), L loose (+16.0).
export const PROFILE = {
  heightCm: 175, weightKg: null, shoulderWidthCm: 44, chestCm: 96, bustCm: null, torsoLengthCm: null, waistCm: 82, hipsCm: null,
  inseamCm: null, outseamCm: null, thighCm: null, armLengthCm: null, bodyModel: 'male', bodyBuild: 'regular',
}

export const shirt = (overrides: Partial<MockProduct> = {}) =>
  product({
    category: 'Shirt',
    isArReady: true,
    variants: ['S', 'M', 'L', 'XL'].flatMap((size) => [
      variant({ size, color: 'Navy', colorHex: '#1b2a49', sku: `LS-NAVY-${size}` }),
      variant({ size, color: 'Black', colorHex: '#111111', sku: `LS-BLACK-${size}` }),
    ]),
    ...overrides,
  })

export async function start(page: Page, { products = [shirt()], profile = true }: { products?: MockProduct[]; profile?: boolean } = {}) {
  await page.addInitScript(() => localStorage.setItem('silhoufit-cookie-consent', 'accepted'))
  await mockAuth(page)
  await mockProducts(page, products)
  await mockSizeMeasurements(page, BASE)
  await page.route('**/users/me/body-profile', (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    return profile ? route.fulfill({ json: PROFILE, headers: CORS }) : route.fulfill({ status: 404, json: {}, headers: CORS })
  })
  await signInViaForm(page)
}

/** Stands in for the camera: a live stream from a canvas, or a rejection with the DOMException name of that failure. */
export async function stubCamera(page: Page, mode: string) {
  await page.addInitScript((m) => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: () => {
          if (m !== 'live') return Promise.reject(new DOMException('stub', m))
          // 640x480 like a real front camera, redrawn on an interval so the video produces frames (and frame callbacks fire).
          const canvas = document.createElement('canvas')
          canvas.width = 640
          canvas.height = 480
          const ctx = canvas.getContext('2d')!
          let n = 0
          setInterval(() => {
            ctx.fillStyle = n++ % 2 ? '#445' : '#556'
            ctx.fillRect(0, 0, 640, 480)
          }, 33)
          return Promise.resolve(canvas.captureStream(30))
        },
      },
    })
  }, mode)
}

export const stage = (page: Page) => page.getByRole('group', { name: 'AR try-on preview' })
