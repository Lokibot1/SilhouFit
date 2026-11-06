import type { Product } from '../../src/data/products'
import type { ProductVariant } from '../../src/service/fetchProductList'

// Shop products as the API gives them, loaded in full: no sale price, rating or badge, and a brand in place of the boutique.
// Ids are plain strings because the unit tests never go near the network.

export const variant = (id: string, size: string | null, color: string | null, over: Partial<ProductVariant> = {}): ProductVariant => ({
  id,
  sku: id.toUpperCase(),
  name: null,
  size,
  color,
  colorHex: color ? '#336699' : null,
  price: 1890,
  stock: 10,
  imageUrl: null,
  measurements: null,
  ...over,
})

export function shopProduct(id: string, name: string, variants: ProductVariant[], over: Partial<Product> = {}): Product {
  const colors = new Map<string, { name: string; hex: string }>()
  for (const v of variants) if (v.color && !colors.has(v.color.toLowerCase())) colors.set(v.color.toLowerCase(), { name: v.color, hex: v.colorHex ?? '' })
  const prices = variants.map((v) => v.price)
  return {
    id,
    slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    name,
    category: 'Hoodie',
    boutique: 'Ayala Atelier',
    price: Math.min(...prices),
    ...(Math.max(...prices) > Math.min(...prices) && { priceMax: Math.max(...prices) }),
    image: `https://images.silhoufit.test/${id}-1.svg`,
    alt: `${name} front`,
    colors: [...colors.values()],
    badges: [],
    stock: variants.reduce((sum, v) => sum + v.stock, 0),
    arReady: false,
    addedAt: '2026-05-01T08:00:00.000Z',
    rating: 0,
    reviews: 0,
    variants,
    ...over,
  }
}

/** Two colours, two sizes. */
export const POLO = shopProduct('p01', 'Heritage Polo', [
  variant('p01-s-white', 'S', 'White'),
  variant('p01-m-white', 'M', 'White'),
  variant('p01-m-navy', 'M', 'Navy', { stock: 5, price: 2100 }),
])

/** One colour, four in stock. */
export const BLAZER = shopProduct('p02', 'Fence-Line Blazer', [variant('p02-m-black', 'M', 'Black', { stock: 4, price: 4990 })], { category: 'Hoodie' })

/** Every variant sold out. */
export const SOLD_OUT = shopProduct('p24', 'Field Denim Jacket', [variant('p24-m-indigo', 'M', 'Indigo', { stock: 0 })], { category: 'Hoodie' })

/** A second brand, for pieces from a different boutique. */
export const TROUSERS = shopProduct('p03', 'Wool Trousers', [variant('p03-30-black', '30', 'Black', { stock: 8, price: 2600 })], { category: 'Pants', boutique: 'Binondo Basics' })
