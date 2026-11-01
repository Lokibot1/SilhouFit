import { useMemo, useSyncExternalStore } from 'react'
import type { MeasurementKey } from './fetchProductList'

// MOCK: custom sizings (a named set of sizes with their own measurements, per category) are kept in this browser's localStorage until the
// backend has an endpoint for them. Swap the bodies of these functions for API calls later; the callers stay as they are.

export interface CustomSizingSize {
  size: string
  measurements: Partial<Record<MeasurementKey, number>>
}

export interface CustomSizing {
  id: string
  category: string
  name: string
  sizes: CustomSizingSize[]
  /** False once archived. Data saved before archiving existed has no value, which counts as active. */
  isActive?: boolean
  createdAt: string
}

export type CustomSizingStatus = 'active' | 'archived'
const isActive = (s: CustomSizing) => s.isActive !== false

const KEY = 'silhoufit.customSizings'
const LINKS_KEY = 'silhoufit.productSizings'

function load(): CustomSizing[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(parsed) ? (parsed as CustomSizing[]) : []
  } catch {
    return []
  }
}

function loadLinks(): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(LINKS_KEY) ?? '{}')
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, string>) : {}
  } catch {
    return {}
  }
}

let cache = load()
// Which custom sizing each product uses, by product id.
let links = loadLinks()
const listeners = new Set<() => void>()

export const getCustomSizings = () => cache

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(cache))
    localStorage.setItem(LINKS_KEY, JSON.stringify(links))
  } catch {
    // Storage is blocked or full: the change still lives for this visit.
  }
  listeners.forEach((listener) => listener())
}

const sameName = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

/** Saves a new custom sizing and tells every list to redraw. */
export function addCustomSizing(input: Omit<CustomSizing, 'id' | 'createdAt' | 'isActive'>): CustomSizing {
  const saved: CustomSizing = { ...input, id: crypto.randomUUID(), isActive: true, createdAt: new Date().toISOString() }
  cache = [...cache, saved]
  persist()
  return saved
}

/** Replaces a sizing's name and sizes. */
export function updateCustomSizing(id: string, changes: Pick<CustomSizing, 'name' | 'sizes'>) {
  cache = cache.map((s) => (s.id === id ? { ...s, ...changes } : s))
  persist()
}

/** Archives or restores a sizing. Restoring answers false when an active sizing of the same category and name exists by then. */
export function setCustomSizingActive(id: string, active: boolean): boolean {
  const target = cache.find((s) => s.id === id)
  if (!target) return false
  if (active && cache.some((s) => s.id !== id && s.category === target.category && isActive(s) && sameName(s.name, target.name))) return false
  cache = cache.map((s) => (s.id === id ? { ...s, isActive: active } : s))
  persist()
  return true
}

/** Remembers that a product uses a custom sizing; `null` puts it back on the category's base sizes. */
export function linkProductSizing(productId: string, sizingId: string | null) {
  const { [productId]: _old, ...rest } = links
  links = sizingId ? { ...rest, [productId]: sizingId } : rest
  persist()
}

/** The id of the active custom sizing a product uses, or '' when it follows the base sizes. */
export function getProductSizingId(productId: string): string {
  const found = cache.find((s) => s.id === links[productId])
  return found && isActive(found) ? found.id : ''
}

/** A category's custom sizings, oldest first; the active ones unless `status` says otherwise. */
export function useCustomSizings(category: string, status: CustomSizingStatus = 'active'): CustomSizing[] {
  const all = useSyncExternalStore(subscribe, getCustomSizings)
  return useMemo(() => all.filter((s) => s.category === category && isActive(s) === (status === 'active')), [all, category, status])
}

/** The active custom sizing a product uses, if any. An archived sizing is hidden like an archived base size. */
export function useProductSizing(productId: string | undefined): CustomSizing | undefined {
  const all = useSyncExternalStore(subscribe, getCustomSizings)
  return useMemo(() => {
    const found = productId ? all.find((s) => s.id === links[productId]) : undefined
    return found && isActive(found) ? found : undefined
  }, [all, productId])
}
