import type { Page } from '@playwright/test'
import { mockCart, mockProducts, product, variant, type CartMock, type MockProduct, type ProductsMock } from './products'
import { mockAuth } from './session'

// A small shop for the cart and checkout flows. Ids are fixed so a test can write checkout URLs; the API has no channels or sale
// prices, and the boutique is the brand.
const id = (n: number) => `00000000-0000-4000-8000-0000000002${String(n).padStart(2, '0')}`
const NAVY = { color: 'Navy', colorHex: '#1b2a49' }
const WHITE = { color: 'White', colorHex: '#f5f5f5' }

const make = (n: number, name: string, category: string, brand: string, variants: ReturnType<typeof variant>[]): MockProduct =>
  product({
    id: id(n),
    name,
    category,
    brand,
    variants,
    createdAt: `2026-05-${String(30 - n).padStart(2, '0')}T08:00:00.000Z`,
    images: [{ url: `https://images.silhoufit.test/${id(n)}-1.svg`, altText: `${name} front`, displayOrder: 0, isPrimary: true }],
  })

const v = (n: number, over: Partial<ReturnType<typeof variant>>) => variant({ id: `00000000-0000-4000-8000-0000000003${String(n).padStart(2, '0')}`, stock: 20, price: 1890, ...over })

export const POLO = make(1, 'Heritage Polo', 'Hoodie', 'Ayala Atelier', [
  ...['XS', 'S', 'M'].flatMap((size, i) => [v(10 + i, { size, ...WHITE }), v(20 + i, { size, ...NAVY })]),
])
export const TANK = make(2, 'Rail Tank Set', 'Hoodie', 'Ayala Atelier', [v(30, { size: 'S', ...WHITE, price: 1590 })])
export const SHIRT = make(3, 'Rail White Shirt', 'Hoodie', 'Ayala Atelier', [v(40, { size: 'L', ...WHITE, price: 1790 })])
export const TROUSERS = make(4, 'Wool Trousers', 'Pants', 'Lumban Loom', [v(50, { size: '30', color: 'Indigo', colorHex: '#2c3e68', price: 2600 })])
export const DRESS = make(5, 'Garden Print Dress', 'Shorts', 'Ayala Atelier', [v(60, { size: 'M', color: 'Blush', colorHex: '#e8b4bc', price: 2290 })])
export const JACKET = make(6, 'Showroom Denim Jacket', 'Hoodie', 'Ayala Atelier', [v(70, { size: 'XL', color: 'Indigo', colorHex: '#2c3e68', price: 4200 })])
export const JEAN = make(7, 'Weekend Tapered Jean', 'Pants', 'Ayala Atelier', [v(80, { size: '36', color: 'Sand', colorHex: '#d8c3a5', price: 2400 })])

export const NAVY_M = POLO.variants.find((x) => x.size === 'M' && x.color === 'Navy')!
export const WHITE_S = POLO.variants.find((x) => x.size === 'S' && x.color === 'White')!

/** The checkout URL for one piece (Buy now). */
export const buyNow = (p: MockProduct, variantId: string, qty = 1) => `/checkout?item=${p.id}&variant=${variantId}&qty=${qty}`

/** Auth, the shop's products and the cart API, with the cookie banner out of the way. Register before the page's first goto. */
export async function setupShop(page: Page, products: MockProduct[] = [POLO, TANK, SHIRT, TROUSERS, DRESS, JACKET, JEAN]): Promise<{ api: ProductsMock; cart: CartMock }> {
  await mockAuth(page)
  await page.addInitScript(() => localStorage.setItem('silhoufit-cookie-consent', 'accepted'))
  const api = await mockProducts(page, products)
  const cart = await mockCart(page, api)
  return { api, cart }
}
