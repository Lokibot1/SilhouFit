import { useContext, useEffect, useSyncExternalStore } from 'react'
import { ToastContext, type ToastOptions } from '../components/toast/useToast'
import { ProductListError } from '../service/fetchProductList'
import { getSession, subscribe as subscribeSession } from '../service/session'
import { addWishlistItem, clearWishlist, fetchWishlistIds, removeWishlistItem } from '../service/wishlistApi'
import { useProductsByIds } from './useProducts'

const KEY = 'silhoufit-wishlist'

function loadGuest(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

type Status = 'loading' | 'ready' | 'error'
type Op = (ids: string[]) => string[]

// One list for the whole app, so the navbar and the cards cannot disagree. A signed-in shopper's list is the server's;
// a guest's lives in localStorage.
let signedIn = !!getSession()
let state: { ids: string[]; notice: ToastOptions | null; status: Status } = {
  ids: signedIn ? [] : loadGuest(),
  notice: null,
  status: signedIn ? 'loading' : 'ready',
}
let loaded = false
let generation = 0
let queue: Promise<unknown> = Promise.resolve()
// The last list the server is known to hold (null until the first load), and the changes shown on screen that it has not confirmed yet.
let mirror: string[] | null = null
let pending: Op[] = []
const listeners = new Set<() => void>()

function commit(next: Partial<typeof state>) {
  state = { ...state, ...next }
  listeners.forEach((listener) => listener())
}

/** The server's list with every change it has not confirmed yet applied on top: what the screen should show. */
const onTop = (base: string[]) => pending.reduce((ids, op) => op(ids), base)

/** Changes run one after another, so quick clicks cannot cross. */
function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const next = queue.then(job, job)
  queue = next.catch(() => {})
  return next
}

function messageFor(error: unknown) {
  if (error instanceof ProductListError && error.kind === 'forbidden') {
    return "Couldn't update your wishlist: your session has ended. Sign in again, then try again."
  }
  if (error instanceof ProductListError && error.kind === 'not-found') {
    return "Couldn't update your wishlist: that piece is no longer available. Refresh the shop, then try again."
  }
  return "Couldn't update your wishlist. The request failed, most likely because the connection dropped. Check your connection, then try again."
}

/** Brings the screen back in line with the server's list; changes still waiting to be sent stay on top of it. */
function loadServer() {
  const current = generation
  return enqueue(async () => {
    // Pieces a guest saved before signing in join the account's list; any that fail are dropped.
    const guest = loadGuest()
    if (guest.length > 0) {
      await Promise.allSettled(guest.map((id) => addWishlistItem(id)))
      try {
        localStorage.removeItem(KEY)
      } catch {
        // Blocked: the merge repeats at the next load, which is harmless.
      }
    }
    const serverIds = await fetchWishlistIds()
    if (current !== generation) return
    mirror = serverIds
    commit({ ids: onTop(serverIds), status: 'ready' })
  }).catch(() => {
    // Only the first load failing leaves the page with nothing to show; later refetches are best effort.
    if (current === generation && mirror === null) commit({ status: 'error' })
  })
}

function retry() {
  if (!signedIn) return
  commit({ status: 'loading' })
  void loadServer()
}

/** Sets the list on screen at once, then makes the server match (or the localStorage copy, for a guest). Resolves to whether it was kept. */
function change(op: Op, sync: () => Promise<unknown>): Promise<boolean> {
  commit({ ids: op(state.ids) })
  if (!signedIn) {
    // Storage can be blocked, so the list then lives for the session only.
    try {
      localStorage.setItem(KEY, JSON.stringify(state.ids))
    } catch {
      // Blocked or full: keep the in-memory list.
    }
    return Promise.resolve(true)
  }
  const current = generation
  pending.push(op)
  const settle = () => {
    pending = pending.filter((x) => x !== op)
  }
  return enqueue(sync).then(
    () => {
      if (current !== generation) return true
      settle()
      if (mirror) mirror = op(mirror)
      return true
    },
    (error: unknown) => {
      if (current !== generation) return false
      settle()
      // Back to what the server holds, without waiting for a refetch that may fail too.
      commit({ ...(mirror && { ids: onTop(mirror) }), notice: { kind: 'error', message: messageFor(error) } })
      void loadServer()
      return false
    },
  )
}

function toggleWishlist(id: string) {
  const saved = state.ids.includes(id)
  return change(
    (ids) => (saved ? ids.filter((x) => x !== id) : ids.includes(id) ? ids : [...ids, id]),
    () => (saved ? removeWishlistItem(id) : addWishlistItem(id)),
  )
}

function removeFromWishlist(remove: string[]) {
  const gone = remove.filter((id) => state.ids.includes(id))
  return change((ids) => ids.filter((id) => !remove.includes(id)), async () => {
    for (const id of gone) await removeWishlistItem(id)
  })
}

function clearAll() {
  return state.ids.length > 0 ? change(() => [], () => clearWishlist()) : Promise.resolve(true)
}

// Puts pieces back (Undo) without duplicating any that were saved again in the meantime.
function addToWishlist(add: string[]) {
  const fresh = add.filter((id) => !state.ids.includes(id))
  return change((ids) => [...ids, ...add.filter((id) => !ids.includes(id))], async () => {
    for (const id of fresh) await addWishlistItem(id)
  })
}

// Another tab changed a guest's list (or cleared storage).
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (signedIn || (event.key !== KEY && event.key !== null)) return
    commit({ ids: loadGuest() })
  })
}

// Signing in or out (here or in another tab) swaps between the server's list and the guest's.
subscribeSession(() => {
  if (!!getSession() === signedIn) return
  generation++
  signedIn = !!getSession()
  loaded = false
  mirror = null
  pending = []
  state = { ids: signedIn ? [] : loadGuest(), notice: null, status: signedIn ? 'loading' : 'ready' }
  listeners.forEach((listener) => listener())
  if (signedIn && listeners.size > 0) {
    loaded = true
    void loadServer()
  }
})

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (signedIn && !loaded) {
    loaded = true
    queueMicrotask(() => void loadServer())
  }
  return () => listeners.delete(listener)
}

export function useWishlist() {
  const current = useSyncExternalStore(subscribe, () => state)
  const toast = useContext(ToastContext)
  const { notice } = current
  useEffect(() => {
    // Several components use this hook; only the first to see a notice shows it.
    if (!notice || !toast || state.notice !== notice) return
    toast.show(notice)
    commit({ notice: null })
  }, [notice, toast])
  return {
    ids: current.ids,
    status: current.status,
    retry,
    has: (id: string) => current.ids.includes(id),
    toggle: toggleWishlist,
    remove: removeFromWishlist,
    clear: clearAll,
    add: addToWishlist,
  }
}

/**
 * Saved ids whose product can still be bought, or null until they are known (or if loading them failed). Ids for pieces that are
 * archived or gone are hidden here, not deleted, so a piece that returns is still saved.
 */
export function useSavedIds() {
  const { ids: saved, status } = useWishlist()
  const found = useProductsByIds(saved)
  return status === 'ready' && found.status === 'success' ? saved.filter((id) => found.products.some((p) => p.id === id)) : null
}
