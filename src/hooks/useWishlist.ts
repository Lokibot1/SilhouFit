import { useState } from 'react'

const KEY = 'silhoufit-wishlist'

function load(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

/** Saved product ids, kept in localStorage. Storage can be blocked, so the list then lives for the session only. */
export function useWishlist() {
  const [ids, setIds] = useState(load)

  function toggle(id: string) {
    // Functional, so an Undo from an older render still flips the current list.
    setIds((current) => {
      const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
      try {
        localStorage.setItem(KEY, JSON.stringify(next))
      } catch {
        // Blocked or full: keep the in-memory list.
      }
      return next
    })
  }

  return { ids, has: (id: string) => ids.includes(id), toggle }
}
