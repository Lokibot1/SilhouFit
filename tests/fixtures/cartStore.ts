// An in-memory cart that follows the API's rules, shared by the unit tests (through `wireCartApi`) and the Playwright mock (`mockCart`):
// the cart belongs to one signed-in user; POST adds to an item that is already there; 400 when the quantity would pass the variant's
// stock or the product is inactive; 404 for an unknown variant or item; DELETE answers { success: true }.

export interface StoreVariant {
  id: string
  sku: string
  name: string | null
  size: string | null
  color: string | null
  colorHex: string | null
  price: number
  stock: number
  imageUrl: string | null
}

export interface StoreProduct {
  id: string
  name: string
  slug: string
  category: string
  brand: string | null
  isActive: boolean
  variants: StoreVariant[]
}

export interface CartReply {
  status: number
  json: unknown
}

interface StoredItem {
  id: string
  variantId: string
  quantity: number
}

export function createCartStore(products: () => StoreProduct[]) {
  let items: StoredItem[] = []
  let counter = 0
  const found = (variantId: string) => {
    for (const product of products()) {
      const variant = product.variants.find((v) => v.id === variantId)
      if (variant) return { product, variant }
    }
    return undefined
  }

  const cart = () => {
    const rows = items.flatMap((item) => {
      const hit = found(item.variantId)
      if (!hit) return []
      const { product, variant } = hit
      const { id, name, slug, category, brand, isActive } = product
      return [
        {
          id: item.id,
          cartId: 'cart-1',
          variantId: item.variantId,
          quantity: item.quantity,
          unitPrice: variant.price,
          totalPrice: variant.price * item.quantity,
          variant: { ...variant, product: { id, name, slug, category, brand, isActive } },
          createdAt: '2026-05-01T08:00:00.000Z',
          updatedAt: '2026-05-01T08:00:00.000Z',
        },
      ]
    })
    return {
      id: 'cart-1',
      userId: 'user-1',
      totalItems: rows.reduce((sum, row) => sum + row.quantity, 0),
      subtotal: rows.reduce((sum, row) => sum + row.totalPrice, 0),
      items: rows,
    }
  }

  const ok = (status = 200): CartReply => ({ status, json: cart() })
  const no = (status: number, message: string): CartReply => ({ status, json: { message: [message] } })

  /** Checks a quantity against the variant: whole, at least 1, within stock, and the product is on sale. */
  const check = (variantId: string, quantity: unknown): CartReply | null => {
    const hit = found(variantId)
    if (!hit) return no(404, 'Variant not found')
    if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1) return no(400, 'quantity must not be less than 1')
    if (!hit.product.isActive) return no(400, 'Product is not available')
    if (quantity > hit.variant.stock) return no(400, `Only ${hit.variant.stock} in stock`)
    return null
  }

  return {
    /** The items now in the cart, for assertions. */
    get items(): readonly StoredItem[] {
      return items
    },
    /** Puts a piece in the cart without any checks, to set a test up. */
    seed(variantId: string, quantity: number) {
      items.push({ id: `item-${++counter}`, variantId, quantity })
    },
    get: (): CartReply => ok(),
    add(variantId: string, quantity: unknown): CartReply {
      const existing = items.find((item) => item.variantId === variantId)
      const bad = check(variantId, typeof quantity === 'number' ? quantity + (existing?.quantity ?? 0) : quantity)
      if (bad) return bad
      if (existing) existing.quantity += quantity as number
      else items.push({ id: `item-${++counter}`, variantId, quantity: quantity as number })
      return ok(201)
    },
    patch(itemId: string, quantity: unknown): CartReply {
      const item = items.find((i) => i.id === itemId)
      if (!item) return no(404, 'Cart item not found')
      const bad = check(item.variantId, quantity)
      if (bad) return bad
      item.quantity = quantity as number
      return ok()
    },
    remove(itemId: string): CartReply {
      if (!items.some((i) => i.id === itemId)) return no(404, 'Cart item not found')
      items = items.filter((i) => i.id !== itemId)
      return { status: 200, json: { success: true } }
    },
    clear(): CartReply {
      items = []
      return { status: 200, json: { success: true } }
    },
  }
}

export type CartStore = ReturnType<typeof createCartStore>
