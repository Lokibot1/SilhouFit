import type { Product } from '../data/products'
import { fetchProductFull, fetchProductList, ProductListError, type ProductFull, type ProductListItem, type ProductListParams } from './fetchProductList'
import type { RequestOptions } from './simulateRequest'

export interface ShopApiPage {
  products: Product[]
  total: number
  page: number
  pageCount: number
}

const priceRange = (min: number, max: number) => ({ price: min, ...(max > min && { priceMax: max }) })

/**
 * A list item as a shop product. The API sends no sale price, badges or boutique details, so those stay
 * empty (the UI hides them) and `brand` stands in for the boutique. Stock is the API's `totalStock`; colours come with the list item
 * (one per name, the first swatch wins) and sizes with the detail.
 */
function toShopProduct(item: ProductListItem): Product {
  const colors = new Map<string, { name: string; hex: string }>()
  for (const colour of item.colors ?? []) if (!colors.has(colour.name.toLowerCase())) colors.set(colour.name.toLowerCase(), colour)
  return {
    id: item.id,
    slug: item.slug,
    name: item.name,
    category: item.category,
    boutique: item.brand ?? '',
    ...priceRange(item.minPrice, item.maxPrice),
    image: item.primaryImage?.url ?? '',
    alt: item.primaryImage?.altText ?? item.name,
    colors: [...colors.values()],
    badges: [],
    stock: item.totalStock,
    arReady: item.arReady ?? false,
    addedAt: item.createdAt,
    rating: item.rating ?? 0,
    reviews: item.reviewCount ?? 0,
  }
}

/** A product with everything the detail has: its variants (and so sizes, colours and per-variant price and stock), photos and description. */
function toShopProductFull({ item, variants, images, description }: ProductFull): Product {
  const ordered = [...images].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
  const colors = new Map<string, { name: string; hex: string }>()
  for (const { color, colorHex } of variants) {
    if (color && !colors.has(color.toLowerCase())) colors.set(color.toLowerCase(), { name: color, hex: colorHex ?? '' })
  }
  return {
    ...toShopProduct(item),
    image: ordered[0]?.url ?? '',
    alt: ordered[0]?.altText ?? item.name,
    ...(ordered.length > 1 && { images: ordered.slice(1).map((image) => image.url) }),
    colors: [...colors.values()],
    stock: variants.reduce((sum, variant) => sum + variant.stock, 0),
    description: description ?? undefined,
    variants,
  }
}

/** One page of the shop from GET /products. A minimum price above the maximum matches nothing, so it is answered without a request. */
export async function fetchShopProducts(params: ProductListParams, options: RequestOptions = {}): Promise<ShopApiPage> {
  const page = params.page ?? 1
  if (params.minPrice !== undefined && params.maxPrice !== undefined && params.minPrice > params.maxPrice)
    return { products: [], total: 0, page, pageCount: 1 }
  const { data, meta } = await fetchProductList(params, options)
  return { products: data.map(toShopProduct), total: meta.total, page: meta.page, pageCount: Math.max(1, meta.totalPages) }
}

/** One product in full, by slug or id. The API answers a guest 404 for archived products already; a staff member's token still gets them, which the shop treats as not found. */
export async function fetchShopProduct(idOrSlug: string, options: RequestOptions = {}): Promise<Product> {
  const full = await fetchProductFull(idOrSlug, options)
  if (full.item.isActive === false) throw new ProductListError('not-found')
  return toShopProductFull(full)
}
