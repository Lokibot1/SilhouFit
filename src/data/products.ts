import type { ProductVariant } from '../service/fetchProductList'

/** The only product categories, in display order. The API accepts any string: others still render, but are never offered as a category. */
export const CATEGORIES = ['Hoodie', 'Pants', 'Headwear', 'Shorts'] as const
export type Category = string

export type Badge = 'New' | 'Best seller' | 'Limited' | 'AR-ready'

/** Default sizes per category: Hoodie XS to XL, Pants and Shorts waist 28 to 36, Headwear one size. Stock is tracked per piece, not per size. */
export const SIZES_BY_CATEGORY: Record<string, string[]> = {
  Hoodie: ['XS', 'S', 'M', 'L', 'XL'],
  Pants: ['28', '30', '32', '34', '36'],
  Shorts: ['28', '30', '32', '34', '36'],
  Headwear: ['One size'],
}

/** From 1 up to this many units, a card shows "Only N left". */
export const LOW_STOCK = 5

export interface Product {
  id: string
  /** Set on products from the API. */
  slug?: string
  name: string
  category: Category
  /** The brand, from the API; empty when it has none. */
  boutique: string
  /** The lowest price; `priceMax` is set when variants cost more. */
  price: number
  priceMax?: number
  salePrice?: number
  image: string
  /** Extra views, shown by the card's image carousel after `image`. Each reuses `alt`. */
  images?: string[]
  alt: string
  colors: { name: string; hex: string }[]
  badges: Badge[]
  stock: number
  arReady: boolean
  addedAt: string
  /** Longer copy for the product page; collapsed behind "View more" when it runs long. */
  description?: string
  rating: number
  reviews: number
  /** Only on products from the API: every variant, once the product's detail has loaded. Sizes, colours, prices and stock come from these. */
  variants?: ProductVariant[]
}

/** Every photo of a piece, main one first. */
export const productImages = (product: Pick<Product, 'image' | 'images'>) => [product.image, ...(product.images ?? [])]

/** The sizes a product comes in: its variants' sizes when it has them, otherwise those of its category. */
export const sizesFor = (product: Pick<Product, 'category' | 'variants'>) =>
  product.variants ? [...new Set(product.variants.flatMap((v) => (v.size ? [v.size] : [])))] : (SIZES_BY_CATEGORY[product.category] ?? [])

/**
 * What a size and colour pick comes to. Once every option the product offers is chosen, an API product answers with that variant's
 * price and stock (no such variant counts as sold out); until then, and for products without variants, with the piece's own.
 */
export function choiceOf(product: Product, size: string, color: string) {
  const chosen = (!!size || sizesFor(product).length === 0) && (!!color || product.colors.length === 0)
  const variant = product.variants && chosen ? product.variants.find((v) => (v.size ?? '') === size && (v.color ?? '').toLowerCase() === color.toLowerCase()) : undefined
  return {
    variant,
    stock: product.variants && chosen ? (variant?.stock ?? 0) : product.stock,
    price: variant?.price ?? product.salePrice ?? product.price,
  }
}

export type ProductGender = 'male' | 'female' | 'other' | 'unisex'
