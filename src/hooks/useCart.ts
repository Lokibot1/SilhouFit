import { useContext, useEffect, useSyncExternalStore } from 'react'
import { ToastContext, type ToastOptions } from '../components/toast/useToast'
import type { Product } from '../data/products'
import { addCartItem, fetchCart, removeCartItem, setCartItemQuantity, type ApiCart } from '../service/cartApi'
import { ProductListError } from '../service/fetchProductList'
import { getSession, subscribe as subscribeSession } from '../service/session'
import { getCachedProduct, loadProduct } from './useProducts'

const KEY = 'silhoufit-cart'

/** One cart line: a variant (a piece in one size and colour). Its key is the variant id, in the server cart and the guest one alike. */
export interface Line {
  variantId: string
  productId: string
  name: string
  boutique: string
  category: string
  size: string | null
  color: string | null
  colorHex: string | null
  /** The variant's price now. */
  unitPrice: number
  /** The variant's stock now. */
  stock: number
  image: string
  qty: number
  /** False for a piece that was archived or has gone: it shows in the cart but cannot be bought. */
  active: boolean
  /** The server cart's item id; guests have none. */
  itemId?: string
}

export const lineKey = (line: Pick<Line, 'variantId'>) => line.variantId

interface Entry {
  variantId: string
  productId: string
  qty: number
}

type Status = 'idle' | 'loading' | 'ready' | 'error'

interface State {
  status: Status
  lines: Line[]
  /** The server's `totalItems` when signed in; otherwise the guest cart's pieces. */
  count: number
  /** What the next screen using the cart should tell the shopper (a failed change, a merge that left pieces out). */
  notice: ToastOptions | null
}

function loadEntries(): Entry[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((raw) =>
      typeof raw?.variantId === 'string' && typeof raw.productId === 'string' && Number.isInteger(raw.qty) && raw.qty > 0
        ? [{ variantId: raw.variantId, productId: raw.productId, qty: raw.qty }]
        : [],
    )
  } catch {
    return []
  }
}

const sumOf = (entries: Entry[]) => entries.reduce((total, entry) => total + entry.qty, 0)

// One cart for the whole app. Signed in, it is the server's cart (every change answers with the new one); as a guest it is
// {variantId, productId, qty} in localStorage, shown through the products' detail, and it joins the server cart at sign-in.
let signedIn = !!getSession()
let entries = loadEntries()
let serverCart: ApiCart | null = null
let state: State = { status: 'idle', lines: [], count: signedIn ? 0 : sumOf(entries), notice: null }
let generation = 0
let queue: Promise<unknown> = Promise.resolve()
const listeners = new Set<() => void>()

function commit(next: Partial<State>) {
  state = { ...state, ...next }
  listeners.forEach((listener) => listener())
}

function saveEntries(next: Entry[]) {
  entries = next
  // Storage can be blocked, so the cart then lives for the session only.
  try {
    if (next.length > 0) localStorage.setItem(KEY, JSON.stringify(next))
    else localStorage.removeItem(KEY)
  } catch {
    // Blocked or full: keep the in-memory cart.
  }
}

/** Changes run one after another, so quick clicks cannot cross. */
function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const next = queue.then(job, job)
  queue = next.catch(() => {})
  return next
}

const isNotFound = (error: unknown) => error instanceof ProductListError && error.kind === 'not-found'

function messageFor(error: unknown) {
  if (error instanceof ProductListError) {
    if (error.kind === 'validation' || error.kind === 'conflict') {
      return `Couldn't update your cart: ${error.detail ?? 'that quantity is not available'}. Lower the quantity or choose another size, then try again.`
    }
    if (error.kind === 'not-found') return "Couldn't update your cart: that piece is no longer available. Remove it, or pick another in the shop."
    if (error.kind === 'forbidden') return "Couldn't update your cart: your session has ended. Sign in again, then try again."
  }
  return "Couldn't update your cart. The request failed, most likely because the connection dropped. Check your connection, then try again."
}

function fail(error: unknown) {
  commit({ notice: { kind: 'error', message: messageFor(error) } })
  // The server's cart is the truth; bring the screen back in line with it.
  if (signedIn) void fetchCart().then(commitServer, () => {})
}

function lineOf(entry: Entry, product: Product | null): Line {
  const variant = product?.variants?.find((v) => v.id === entry.variantId)
  if (!product || !variant) {
    return { variantId: entry.variantId, productId: entry.productId, name: 'A piece in your cart', boutique: '', category: '', size: null, color: null, colorHex: null, unitPrice: 0, stock: 0, image: '', qty: entry.qty, active: false }
  }
  return {
    variantId: variant.id,
    productId: product.id,
    name: product.name,
    boutique: product.boutique,
    category: product.category,
    size: variant.size,
    color: variant.color,
    colorHex: variant.colorHex,
    unitPrice: variant.price,
    stock: variant.stock,
    image: variant.imageUrl ?? product.image,
    qty: entry.qty,
    active: true,
  }
}

/** The guest cart through each piece's detail. A piece that has gone is kept as an unbuyable line; any other failure rejects. */
async function guestLines(list: Entry[]): Promise<Line[]> {
  const ids = [...new Set(list.map((entry) => entry.productId))]
  const products = new Map<string, Product | null>(
    await Promise.all(ids.map(async (id) => [id, await loadProduct(id).catch((error: unknown) => (isNotFound(error) ? null : Promise.reject(error)))] as const)),
  )
  return list.map((entry) => lineOf(entry, products.get(entry.productId) ?? null))
}

function serverLines(cart: ApiCart): Line[] {
  return cart.items.map(({ id, variantId, quantity, unitPrice, variant }) => ({
    variantId,
    productId: variant.product.id,
    name: variant.product.name,
    boutique: variant.product.brand ?? '',
    category: variant.product.category,
    size: variant.size,
    color: variant.color,
    colorHex: variant.colorHex,
    unitPrice,
    stock: variant.stock,
    image: variant.imageUrl ?? variant.product.imageUrl ?? getCachedProduct(variant.product.id)?.image ?? '',
    qty: quantity,
    active: variant.product.isActive,
    itemId: id,
  }))
}

function commitServer(cart: ApiCart) {
  serverCart = cart
  commit({ status: 'ready', lines: serverLines(cart), count: cart.totalItems })
  // Load what the cart did not carry a photo for, so rows get one (and checkout finds its products ready).
  const missing = [...new Set(cart.items.filter((item) => !item.variant.imageUrl && !item.variant.product.imageUrl && !getCachedProduct(item.variant.product.id)?.image).map((item) => item.variant.product.id))]
  if (missing.length === 0) return
  const current = generation
  void Promise.allSettled(missing.map((id) => loadProduct(id))).then(() => {
    if (current === generation && serverCart === cart) commit({ lines: serverLines(cart) })
  })
}

async function commitGuest(next: Entry[]) {
  saveEntries(next)
  const lines = await guestLines(next)
  commit({ status: 'ready', lines, count: sumOf(next) })
}

/** Guest pieces join the server cart one by one; a piece the server refuses is left out and said so. */
async function mergeGuest(current: number) {
  const pieces = entries
  if (pieces.length === 0) return
  const refused: unknown[] = []
  for (const piece of pieces) {
    try {
      await addCartItem(piece.variantId, piece.qty)
    } catch (error) {
      refused.push(error)
    }
  }
  if (current !== generation) return
  saveEntries([])
  if (refused.length > 0) {
    const first = refused[0] instanceof ProductListError ? refused[0].detail : undefined
    commit({
      notice: {
        kind: 'info',
        message: `${refused.length} ${refused.length === 1 ? 'piece' : 'pieces'} from your cart before sign-in could not be added${first ? ` (${first})` : ''}. Check the stock on the piece's page, then add ${refused.length === 1 ? 'it' : 'them'} again.`,
      },
    })
  }
}

function load() {
  const current = generation
  commit({ status: 'loading' })
  const job = signedIn
    ? mergeGuest(current).then(() => fetchCart()).then((cart) => current === generation && commitServer(cart))
    : guestLines(entries).then((lines) => current === generation && commit({ status: 'ready', lines, count: sumOf(entries) }))
  return job.catch(() => {
    if (current === generation) commit({ status: 'error' })
  })
}

/** Forgets the cart held in memory (sign-out, or a change of user); a guest cart in storage stays. */
export function clearCartCache() {
  generation++
  signedIn = !!getSession()
  entries = loadEntries()
  serverCart = null
  state = { status: 'idle', lines: [], count: signedIn ? 0 : sumOf(entries), notice: null }
  listeners.forEach((listener) => listener())
  if (listeners.size > 0) void load()
}

// Another tab changed the guest cart (or cleared storage).
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== KEY && event.key !== null) return
    if (!signedIn) clearCartCache()
  })
}

// Signing in or out (here or in another tab) switches between the guest cart and the server's.
subscribeSession(() => {
  if (!!getSession() !== signedIn) clearCartCache()
})

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (state.status === 'idle') queueMicrotask(() => state.status === 'idle' && void load())
  return () => listeners.delete(listener)
}

function dismiss(notice: ToastOptions) {
  if (state.notice === notice) commit({ notice: null })
}

function useCartState() {
  const current = useSyncExternalStore(subscribe, () => state)
  const toast = useContext(ToastContext)
  const { notice } = current
  useEffect(() => {
    if (!notice || !toast) return
    toast.show(notice)
    dismiss(notice)
  }, [notice, toast])
  return current
}

interface AddRequest {
  product: Product
  variantId: string
  qty?: number
}

const lineOfVariant = (variantId: string) => state.lines.find((line) => line.variantId === variantId)

/** Adds to a line, never past the variant's stock; nothing is added if it would. `failed` means the cart said no (a toast says why). */
function addToCart({ product, variantId, qty = 1 }: AddRequest): Promise<'added' | 'limit' | 'failed'> {
  return enqueue(async () => {
    const variant = product.variants?.find((v) => v.id === variantId)
    const have = lineOfVariant(variantId)?.qty ?? 0
    if (!variant || have + qty > variant.stock) return 'limit'
    try {
      if (signedIn) commitServer(await addCartItem(variantId, qty))
      else {
        const existing = entries.find((entry) => entry.variantId === variantId)
        await commitGuest(existing ? entries.map((entry) => (entry === existing ? { ...entry, qty: entry.qty + qty } : entry)) : [...entries, { variantId, productId: product.id, qty }])
      }
      return 'added'
    } catch (error) {
      fail(error)
      return 'failed'
    }
  })
}

/** Sets a line's quantity, capped at the variant's stock; zero or less removes it. */
function setLineQty(key: string, qty: number) {
  return enqueue(async () => {
    const line = lineOfVariant(key)
    if (!line) return
    const next = Math.min(qty, line.stock)
    try {
      if (!signedIn) await commitGuest(next > 0 ? entries.map((entry) => (entry.variantId === key ? { ...entry, qty: next } : entry)) : entries.filter((entry) => entry.variantId !== key))
      else if (next > 0) commitServer(await setCartItemQuantity(line.itemId!, next))
      else await dropFromServer([line])
    } catch (error) {
      fail(error)
    }
  })
}

async function dropFromServer(dropped: Line[]) {
  for (const line of dropped) await removeCartItem(line.itemId!)
  const gone = new Set(dropped.map((line) => line.itemId))
  const items = serverCart!.items.filter((item) => !gone.has(item.id))
  commitServer({ items, totalItems: items.reduce((sum, item) => sum + item.quantity, 0), subtotal: items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0) })
}

/** Drops whole lines (after an order, or Remove); lines added elsewhere in the meantime stay. */
function removeLines(keys: string[]) {
  return enqueue(async () => {
    const dropped = state.lines.filter((line) => keys.includes(lineKey(line)))
    if (dropped.length === 0) return
    try {
      if (signedIn) await dropFromServer(dropped)
      else await commitGuest(entries.filter((entry) => !keys.includes(entry.variantId)))
    } catch (error) {
      fail(error)
    }
  })
}

/** Takes `qty` off a line (Undo), dropping the line at zero. */
function removeFromCart(key: string, qty: number) {
  const line = lineOfVariant(key)
  return line ? setLineQty(key, line.qty - qty) : Promise.resolve()
}

/** Moves a line to another size and colour, joining the line already there if there is one. Resolves to the new key. */
function changeVariant(key: string, size: string, color: string) {
  return enqueue(async () => {
    const line = lineOfVariant(key)
    if (!line) return key
    try {
      const product = await loadProduct(line.productId)
      const target = product.variants?.find((v) => (v.size ?? '') === size && (v.color ?? '').toLowerCase() === color.toLowerCase())
      if (!target || target.id === key) return key
      const joined = lineOfVariant(target.id)?.qty ?? 0
      const qty = Math.min(line.qty + joined, target.stock)
      if (qty <= joined) return key
      if (signedIn) {
        commitServer(await addCartItem(target.id, qty - joined))
        await dropFromServer([line])
      } else {
        await commitGuest([...entries.filter((entry) => entry.variantId !== key && entry.variantId !== target.id), { variantId: target.id, productId: line.productId, qty }])
      }
      return target.id
    } catch (error) {
      fail(error)
      return key
    }
  })
}

export function useCart() {
  const current = useCartState()
  return {
    status: current.status === 'idle' ? ('loading' as const) : current.status,
    lines: current.lines,
    count: current.count,
    retry: () => void load(),
    qtyOfVariant: (variantId: string | undefined) => current.lines.find((line) => line.variantId === variantId)?.qty ?? 0,
    add: addToCart,
    remove: removeFromCart,
    setQty: setLineQty,
    changeVariant,
    removeLines,
  }
}

/** Pieces in the cart: the server's count when signed in. Zero until the cart is known. */
export function useCartCount() {
  return useCartState().count
}
