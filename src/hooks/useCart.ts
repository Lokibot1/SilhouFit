import { useSyncExternalStore } from 'react'
import type { Product } from '../data/products'
import { useCatalogue } from './useProducts'

const KEY = 'silhoufit-cart'

interface Line {
  id: string
  qty: number
}

function load(): Line[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (line): line is Line =>
        typeof line?.id === 'string' && Number.isInteger(line.qty) && line.qty > 0,
    )
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

const qtyIn = (id: string) => lines.find((line) => line.id === id)?.qty ?? 0

function setQty(id: string, qty: number) {
  const others = lines.filter((line) => line.id !== id)
  commit(qty > 0 ? [...others, { id, qty }] : others)
}

/** Adds one piece, never past its stock. */
function addToCart(product: Product): 'added' | 'limit' {
  const qty = qtyIn(product.id)
  if (qty >= product.stock) return 'limit'
  setQty(product.id, qty + 1)
  return 'added'
}

function removeOneFromCart(id: string) {
  setQty(id, qtyIn(id) - 1)
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useCart() {
  const current = useSyncExternalStore(subscribe, () => lines)
  return {
    qtyOf: (id: string) => current.find((line) => line.id === id)?.qty ?? 0,
    add: addToCart,
    removeOne: removeOneFromCart,
  }
}

/**
 * Total pieces in the cart: only pieces in the catalogue, each capped at its stock. Zero until the catalogue is
 * known. Stored lines for pieces that have gone are hidden here, not deleted.
 */
export function useCartCount() {
  const current = useSyncExternalStore(subscribe, () => lines)
  const catalogue = useCatalogue()
  if (!catalogue) return 0
  return current.reduce((total, line) => {
    const product = catalogue.find((p) => p.id === line.id)
    return product ? total + Math.min(line.qty, product.stock) : total
  }, 0)
}
