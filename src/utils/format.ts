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
