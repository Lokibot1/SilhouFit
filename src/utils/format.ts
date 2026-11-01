const PESO = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' })

/** 1890 -> "₱1,890.00". */
export const formatPeso = (amount: number) => PESO.format(amount)

const PESO_WHOLE = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 })
const PESO_COMPACT = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', notation: 'compact', maximumFractionDigits: 1 })

/** 482350 -> "₱482,350", for big figures where centavos are noise. */
export const formatPesoWhole = (amount: number) => PESO_WHOLE.format(amount)

/** 20000 -> "₱20K", for axis labels. */
export const formatPesoCompact = (amount: number) => PESO_COMPACT.format(amount)

/** "2026-10-14" -> "Oct 14" (or "October 14"). The date has no zone, so it is read as UTC and shown as UTC. */
export const formatDay = (date: string, month: 'short' | 'long' = 'short') =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month, day: 'numeric' })

/** An ISO time as Manila store time in 12-hour form: "Oct 22, 3:45 PM". */
export const formatOrderTime = (iso: string) =>
  new Date(iso).toLocaleString('en-US', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })

const PLACED_AT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Manila',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
})

/** An ISO time as Manila store time in 12-hour form, with the year: "Oct 22, 2026, 3:45 PM". */
export const formatPlacedAt = (iso: string) => PLACED_AT.format(new Date(iso))

/** 1 -> "1 item", 3 -> "3 items". */
export const itemsLabel = (count: number) => `${count} ${count === 1 ? 'item' : 'items'}`

/** A price typed into a filter, as a number: up to 9 whole digits and 2 decimals, otherwise undefined. */
export const parseFilterPrice = (value: string | null) => (value !== null && /^\d{1,9}(\.\d{1,2})?$/.test(value.trim()) ? Number(value) : undefined)

/**
 * What a filter price field keeps of a typed or pasted value: digits and one decimal point, 9 whole digits and 2 decimals at most.
 * Returns null when the value holds "-" or "e", so the field keeps what it had instead of turning -5 into 5 or 1e5 into 15.
 */
export function filterPriceInput(value: string): string | null {
  if (/[-eE]/.test(value)) return null
  const [whole, ...rest] = value.replace(/[^\d.]/g, '').split('.')
  return rest.length ? `${whole.slice(0, 9)}.${rest.join('').slice(0, 2)}` : whole.slice(0, 9)
}

/** "Size M · Navy"; a variant without a size or colour leaves that part out. */
export const variantLabel = (size: string | null, color: string | null) => [size && `Size ${size}`, color].filter(Boolean).join(' · ')

/** An amount or count typed in a box, with thousands commas for display (`1234.5` -> `1,234.5`). The value kept in state stays comma-free. */
export const withCommas = (value: string) => value.replace(/^\d+/, (int) => int.replace(/\B(?=(\d{3})+$)/g, ','))
