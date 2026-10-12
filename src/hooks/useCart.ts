import { useSyncExternalStore } from 'react'
import type { Product } from '../data/products'
import { resolveCartItems } from '../utils/checkout'
import { getCatalogue, useCatalogue } from './useProducts'

const KEY = 'silhoufit-cart'

/** One cart line: a piece in one size and colour. Lines from before sizes existed have both as null. */
export interface Line {
  id: string
  size: string | null
  color: string | null
  qty: number
}

export const lineKey = (line: Pick<Line, 'id' | 'size' | 'color'>) => `${line.id}|${line.size ?? ''}|${line.color ?? ''}`

const text = (value: unknown) => (typeof value === 'string' ? value : null)

function load(): Line[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    if (!Array.isArray(parsed)) return []
    const lines: Line[] = []
    for (const raw of parsed) {
      // The old shape was { id, qty }; it still counts, with no size or colour.
      if (typeof raw?.id !== 'string' || !Number.isInteger(raw.qty) || raw.qty <= 0) continue
      lines.push({ id: raw.id, size: text(raw.size), color: text(raw.color), qty: raw.qty })
    }
    return lines
  } catch {
    return []
  }
}

// One cart for the whole app, like the wishlist. Frontend-only: swap this store for the cart API later.
let lines = load()
const listeners = new Set<() => void>()

function commit(next: Line[]) {
  lines = next
  // Storage can be blocked, so the cart then lives for the session only.
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Blocked or full: keep the in-memory cart.
  }
  listeners.forEach((listener) => listener())
}

// Another tab changed the cart (or cleared storage).
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== KEY && event.key !== null) return
    lines = load()
    listeners.forEach((listener) => listener())
  })
}

const qtyOfProduct = (id: string) => lines.filter((line) => line.id === id).reduce((sum, line) => sum + line.qty, 0)

interface AddRequest {
  product: Product
  size: string | null
  color: string | null
  qty?: number
}

/** Adds to a line, never past the piece's stock across all its sizes and colours; nothing is added if it would. */
function addToCart({ product, size, color, qty = 1 }: AddRequest): 'added' | 'limit' {
  if (qtyOfProduct(product.id) + qty > product.stock) return 'limit'
  const key = lineKey({ id: product.id, size, color })
  const existing = lines.find((line) => lineKey(line) === key)
  commit(
    existing
      ? lines.map((line) => (line === existing ? { ...line, qty: line.qty + qty } : line))
      : [...lines, { id: product.id, size, color, qty }],
  )
  return 'added'
}

/** Sets a line's quantity, capped so the piece's lines together stay within its stock; zero or less removes it. */
function setLineQty(key: string, qty: number) {
  const line = lines.find((l) => lineKey(l) === key)
  if (!line) return
  const product = getCatalogue()?.find((p) => p.id === line.id)
  const others = qtyOfProduct(line.id) - line.qty
  const capped = product ? Math.min(qty, product.stock - others) : qty
  commit(capped > 0 ? lines.map((l) => (l === line ? { ...l, qty: capped } : l)) : lines.filter((l) => l !== line))
}

/** Moves a line to another size and colour, joining the line already there if there is one. Returns the new key. */
function changeVariant(key: string, size: string, color: string) {
  const line = lines.find((l) => lineKey(l) === key)
  if (!line) return key
  const nextKey = lineKey({ id: line.id, size, color })
  if (nextKey === key) return key
  const target = lines.find((l) => lineKey(l) === nextKey)
  // The piece's total quantity is unchanged, so its stock limit still holds.
  commit(
    target
      ? lines.filter((l) => l !== line).map((l) => (l === target ? { ...l, qty: l.qty + line.qty } : l))
      : lines.map((l) => (l === line ? { ...l, size, color } : l)),
  )
  return nextKey
}

/** Drops whole lines (after an order); lines added elsewhere in the meantime stay. */
function removeLines(keys: string[]) {
  commit(lines.filter((line) => !keys.includes(lineKey(line))))
}

/** Takes `qty` off a line (Undo), dropping the line at zero. */
function removeFromCart(key: string, qty: number) {
  commit(
    lines
      .map((line) => (lineKey(line) === key ? { ...line, qty: line.qty - qty } : line))
      .filter((line) => line.qty > 0),
  )
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useCart() {
  const current = useSyncExternalStore(subscribe, () => lines)
  return {
    lines: current,
    qtyOfProduct: (id: string) => current.filter((line) => line.id === id).reduce((sum, line) => sum + line.qty, 0),
    add: addToCart,
    remove: removeFromCart,
    setQty: setLineQty,
    changeVariant,
    removeLines,
  }
}

/**
 * Pieces that can be bought: the same lines the cart page total and the checkout use (known, in stock, with a size
 * and colour, within stock per piece). Zero until the catalogue is known. Other stored lines are hidden here, not
 * deleted.
 */
export function useCartCount() {
  const current = useSyncExternalStore(subscribe, () => lines)
  const catalogue = useCatalogue()
  if (!catalogue) return 0
  return resolveCartItems(current, catalogue).items.reduce((total, item) => total + item.qty, 0)
}
