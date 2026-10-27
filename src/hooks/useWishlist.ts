import { useSyncExternalStore } from 'react'
import { useProductsByIds } from './useProducts'

const KEY = 'silhoufit-wishlist'

function load(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

// One list for the whole app, so the navbar and the cards cannot disagree.
let ids = load()
const listeners = new Set<() => void>()

function commit(next: string[]) {
  ids = next
  // Storage can be blocked, so the list then lives for the session only.
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Blocked or full: keep the in-memory list.
  }
  listeners.forEach((listener) => listener())
}

function toggleWishlist(id: string) {
  commit(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id])
}

function removeFromWishlist(remove: string[]) {
  commit(ids.filter((id) => !remove.includes(id)))
}

// Puts pieces back (Undo) without duplicating any that were saved again in the meantime.
function addToWishlist(add: string[]) {
  commit([...ids, ...add.filter((id) => !ids.includes(id))])
}

// Another tab changed the list (or cleared storage).
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== KEY && event.key !== null) return
    ids = load()
    listeners.forEach((listener) => listener())
  })
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useWishlist() {
  const current = useSyncExternalStore(subscribe, () => ids)
  return {
    ids: current,
    has: (id: string) => current.includes(id),
    toggle: toggleWishlist,
    remove: removeFromWishlist,
    add: addToWishlist,
  }
}

/**
 * Saved ids whose product can still be bought, or null until they are known (or if loading them failed). Ids for pieces that are
 * archived or gone are hidden here, not deleted, so a piece that returns is still saved.
 */
export function useSavedIds() {
  const { ids: saved } = useWishlist()
  const found = useProductsByIds(saved)
  return found.status === 'success' ? saved.filter((id) => found.products.some((p) => p.id === id)) : null
}
