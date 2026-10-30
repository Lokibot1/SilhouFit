// The Pricing & Promotions page's promotions, kept in this tab's memory until the pricing backend exists.
// The status is never stored: it is worked out from the dates (and an early end) every time a promotion is read.
import { addDays, manilaToday } from '../utils/period'
import { failParam, getSampleProducts, seedOf } from './fetchStaffAnalytics'
import { simulateRequest, type RequestOptions } from './simulateRequest'

/** Dev-only: /admin/promotions?fail=promo-summary (or promo-list, promo-save, promo-delete) fails that request. */
const wait = (section: string, delayMs: number, signal?: AbortSignal) =>
  simulateRequest(delayMs, signal, () => failParam() === section).catch((error: Error) => {
    throw error.name === 'AbortError' ? error : Object.assign(error, { kind: 'network' })
  })

export type PromoType = 'percent' | 'fixed'
export type PromoStatus = 'active' | 'scheduled' | 'ended'
export type PromoSort = 'name' | 'code' | 'value' | 'startsAt' | 'endsAt' | 'status' | 'redemptions'
export type PromoDir = 'asc' | 'desc'

/** A product a promotion is limited to; the name is kept so the list needs no product request. */
export interface PromoProduct {
  id: string
  name: string
}
/** What a promotion discounts: every product, one product category, or a chosen set of products. */
export type PromoAppliesTo = { scope: 'all' } | { scope: 'category'; category: string } | { scope: 'products'; products: PromoProduct[] }

export interface Promotion {
  id: string
  name: string
  /** Upper case letters and digits. */
  code: string
  type: PromoType
  /** Percent off (1 to 90), or pesos off. */
  value: number
  appliesTo: PromoAppliesTo
  /** First and last day of the sale, YYYY-MM-DD, Manila. */
  startsAt: string
  endsAt: string
  usageLimit: number | null
  minSpend: number | null
  redemptions: number
  /** Pesos taken off orders so far. */
  discountGiven: number
  /** When an admin ended it before its last day (ISO time); null otherwise. */
  endedEarlyAt: string | null
  createdAt: string
}

/** What the form can change; the redemptions and the discount given are only ever recorded by orders. */
export type PromotionInput = Pick<Promotion, 'name' | 'code' | 'type' | 'value' | 'appliesTo' | 'startsAt' | 'endsAt' | 'usageLimit' | 'minSpend'>

export type PromotionRow = Promotion & { status: PromoStatus }

export interface PromoSummary {
  active: number
  scheduled: number
  ended: number
  redemptions: number
  discountGiven: number
}

export interface PromoPage {
  data: PromotionRow[]
  meta: { total: number; page: number; limit: number; totalPages: number }
}

export interface PromoQuery {
  search?: string
  status?: PromoStatus
  sort?: PromoSort
  dir?: PromoDir
  page?: number
  limit?: number
}

export const PROMO_PER_PAGE = 10
export const PROMO_PER_PAGE_OPTIONS = [10, 25, 50]
export const MAX_PROMO_SEARCH = 60

/** Ended once it was ended early or its last day has passed; scheduled before its first day; active in between (both days included). */
export function statusOf({ startsAt, endsAt, endedEarlyAt }: Pick<Promotion, 'startsAt' | 'endsAt' | 'endedEarlyAt'>, today = manilaToday().date): PromoStatus {
  if (endedEarlyAt || today > endsAt) return 'ended'
  return today < startsAt ? 'scheduled' : 'active'
}

const STATUS_RANK: Record<PromoStatus, number> = { active: 0, scheduled: 1, ended: 2 }

// name, code, type, value, target (null for every product; a number is an index into the sample products' categories; a list is indexes of sample products), first day and last day (days from today), usage limit, minimum spend
type Seed = [string, string, PromoType, number, number | number[] | null, number, number, number | null, number | null]
const SEEDS: Seed[] = [
  ['Payday Sale', 'PAYDAY15', 'percent', 15, null, -3, 4, 500, null],
  ['Denim Days', 'DENIM20', 'percent', 20, 2, -10, 20, 200, 1500],
  ['Tops Bundle', 'TOPS100', 'fixed', 100, 1, -7, 7, null, 800],
  ['Welcome Offer', 'WELCOME10', 'percent', 10, null, -60, 300, null, null],
  ['Dress Week', 'DRESS25', 'percent', 25, 4, -2, 5, 150, 2000],
  ['Accessory Add-on', 'ADDON50', 'fixed', 50, 5, -15, 15, 100, 300],
  ['Style Voucher', 'STYLE200', 'fixed', 200, null, -1, 30, 300, 2500],
  ['Jacket Season', 'JACKET30', 'percent', 30, 0, 0, 14, 80, 3000],
  ['Skirt Spring', 'SKIRT12', 'percent', 12, 3, -20, 0, null, null],
  ['Loyalty Treat', 'LOYAL5', 'percent', 5, null, -90, 90, null, null],
  ['Holiday Sale', 'HOLIDAY40', 'percent', 40, null, 20, 45, 1000, null],
  ['Back to Work', 'WORK15', 'percent', 15, 0, 3, 17, 250, 2500],
  ['Midyear Tops', 'MIDYEAR75', 'fixed', 75, 1, 10, 24, null, 600],
  ['Weekend Denim', 'WKNDDENIM', 'percent', 20, [3, 4], 5, 7, 120, null],
  ['Dress Preview', 'PREVIEW10', 'percent', 10, 4, 30, 60, null, null],
  ['Accessories Fair', 'FAIR30', 'fixed', 30, 5, 14, 28, 200, 250],
  ['Skirt Clearance', 'CLEAR35', 'percent', 35, 3, 60, 75, 60, null],
  ['Anniversary', 'ANNIV500', 'fixed', 500, [0, 1, 2, 3, 4, 5, 6], 90, 100, 100, 5000],
  ['Summer Kickoff', 'SUMMER20', 'percent', 20, null, -120, -90, 600, null],
  ['Mothers Day', 'MOM25', 'percent', 25, 4, -150, -140, 300, 1800],
  ['Graduation Offer', 'GRAD150', 'fixed', 150, null, -110, -95, 200, 1200],
  ['Rainy Season Jackets', 'RAINY30', 'percent', 30, 0, -75, -50, 150, null],
  ['Flash Friday', 'FLASH10', 'percent', 10, null, -40, -39, null, null],
  ['Tee Time', 'TEE50', 'fixed', 50, [1, 2], -45, -30, 400, null],
  ['Belt Up', 'BELT20', 'percent', 20, 5, -30, -15, 80, 400],
  ['Pants Payday', 'PANTS15', 'percent', 15, 2, -14, -8, null, 1000],
  ['New Year Sale', 'NEWYEAR25', 'percent', 25, null, -300, -280, 800, null],
  ['Valentine Dresses', 'LOVE14', 'percent', 14, 4, -260, -250, 100, null],
  ['Midnight Madness', 'MIDNIGHT', 'fixed', 120, null, -20, 10, 250, 1500],
  ['Bucket Hat Drop', 'HAT10', 'percent', 10, [11], -25, 40, null, null],
]
/** Has used 96 of its 100 redemptions, so "nearly used up" can be seen. */
const NEAR_LIMIT = 'ADDON50'
/** Ended on the 5th day before today although its last day is still ahead. */
const ENDED_EARLY = 'MIDNIGHT'

function seedPromotions(): Promotion[] {
  const today = manilaToday().date
  const products = getSampleProducts()
  const categories = [...new Set(products.map((p) => p.category))]
  const appliesOf = (target: number | number[] | null): PromoAppliesTo =>
    target === null || products.length === 0
      ? { scope: 'all' }
      : typeof target === 'number'
        ? { scope: 'category', category: categories[target % categories.length] }
        : { scope: 'products', products: target.map((n) => ({ id: products[n % products.length].id, name: products[n % products.length].name })) }
  return SEEDS.map(([name, code, type, value, target, from, to, usageLimit, minSpend], n) => {
    const startsAt = addDays(today, from)
    const endsAt = addDays(today, to)
    const endedEarlyAt = code === ENDED_EARLY ? `${addDays(today, -5)}T14:30:00+08:00` : null
    const began = startsAt <= today
    const redemptions = !began ? 0 : code === NEAR_LIMIT ? 96 : seedOf(code) % (usageLimit ? Math.floor(usageLimit * 0.8) : 400)
    const basket = 900 + (seedOf(`${code}-basket`) % 1400)
    return {
      id: `promo-${String(n + 1).padStart(3, '0')}`,
      name,
      code,
      type,
      value,
      appliesTo: appliesOf(target),
      startsAt,
      endsAt,
      usageLimit,
      minSpend,
      redemptions,
      discountGiven: Math.round(type === 'percent' ? (redemptions * basket * value) / 100 : redemptions * value),
      endedEarlyAt,
      createdAt: `${addDays(startsAt, -7)}T09:00:00+08:00`,
    }
  })
}

let promotions: Promotion[] = seedPromotions()
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((listener) => listener())

export const getPromotions = () => promotions

/** Test seam: replaces every promotion. */
export function setPromotions(next: Promotion[]) {
  promotions = next
  notify()
}

/** Called after every change, so a list can load again. */
export function subscribePromotions(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

let counter = 0
const conflict = () => Object.assign(new Error('conflict'), { kind: 'conflict' })
const notFound = () => Object.assign(new Error('not-found'), { kind: 'not-found' })
/** A rule broken by the request itself: `field` names the form field it belongs to. */
const invalid = (message: string, field?: keyof PromotionInput) => Object.assign(new Error(message), { kind: 'validation', field })

const sameCode = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

/** REPLACE: GET /promotions/summary -> PromoSummary (counts by status as of today, and the redemptions and discount given across all promotions). */
export async function getPromoSummary({ signal, delayMs = 700 }: RequestOptions = {}): Promise<PromoSummary> {
  await wait('promo-summary', delayMs, signal)
  const today = manilaToday().date
  const summary: PromoSummary = { active: 0, scheduled: 0, ended: 0, redemptions: 0, discountGiven: 0 }
  for (const p of promotions) {
    summary[statusOf(p, today)] += 1
    summary.redemptions += p.redemptions
    summary.discountGiven += p.discountGiven
  }
  return summary
}

const sortValue = (p: PromotionRow, sort: PromoSort): string | number => {
  if (sort === 'name') return p.name.toLowerCase()
  if (sort === 'status') return STATUS_RANK[p.status]
  return p[sort]
}

/** REPLACE: GET /promotions?search=&status=&sort=&dir=&page=&limit= -> PromoPage (search matches name and code, ignoring case). */
export async function listPromotions({ signal, delayMs = 600, search, status, sort = 'name', dir = 'asc', page = 1, limit = PROMO_PER_PAGE }: PromoQuery & RequestOptions = {}): Promise<PromoPage> {
  await wait('promo-list', delayMs, signal)
  const today = manilaToday().date
  const needle = search?.trim().toLowerCase().slice(0, MAX_PROMO_SEARCH)
  const matched = promotions
    .map((p, index) => ({ row: { ...p, status: statusOf(p, today) }, index }))
    .filter(({ row }) => !status || row.status === status)
    .filter(({ row }) => !needle || row.name.toLowerCase().includes(needle) || row.code.toLowerCase().includes(needle))
    .sort((a, b) => {
      const x = sortValue(a.row, sort)
      const y = sortValue(b.row, sort)
      const order = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))
      return (dir === 'asc' ? 1 : -1) * order || a.index - b.index
    })
    .map(({ row }) => row)
  return { data: matched.slice((page - 1) * limit, page * limit), meta: { total: matched.length, page, limit, totalPages: Math.ceil(matched.length / limit) } }
}

/** REPLACE: POST /promotions with { name, code, type, value, appliesTo: { scope: 'all' } | { scope: 'category', category } | { scope: 'products', productIds: string[] (1 to 20) }, startsAt, endsAt, usageLimit, minSpend } -> Promotion (each product comes back as { id, name }); 409 when the code is taken. */
export async function createPromotion(input: PromotionInput, { signal, delayMs = 700 }: RequestOptions = {}): Promise<Promotion> {
  await wait('promo-save', delayMs, signal)
  if (promotions.some((p) => sameCode(p.code, input.code))) throw conflict()
  const created: Promotion = {
    ...input,
    id: `promo-${Date.now().toString(36)}-${counter++}`,
    redemptions: 0,
    discountGiven: 0,
    endedEarlyAt: null,
    createdAt: new Date().toISOString(),
  }
  promotions = [...promotions, created]
  notify()
  return created
}

/** REPLACE: PATCH /promotions/:id with the same body as POST /promotions -> Promotion; 409 when the code is taken or the promotion was ended early, 422 when the usage limit is below the redemptions. */
export async function updatePromotion(id: string, input: PromotionInput, { signal, delayMs = 700 }: RequestOptions = {}): Promise<Promotion> {
  await wait('promo-save', delayMs, signal)
  const current = promotions.find((p) => p.id === id)
  if (!current) throw notFound()
  if (current.endedEarlyAt) throw conflict()
  if (promotions.some((p) => p.id !== id && sameCode(p.code, input.code))) throw conflict()
  if (input.usageLimit !== null && input.usageLimit < current.redemptions) {
    throw invalid(`Usage limit can't be below the ${current.redemptions} redemptions already used`, 'usageLimit')
  }
  const saved = { ...current, ...input }
  promotions = promotions.map((p) => (p.id === id ? saved : p))
  notify()
  return saved
}

/** REPLACE: POST /promotions/:id/end -> Promotion (sets endedEarlyAt to now); 409 when it already ended. */
export async function endPromotion(id: string, { signal, delayMs = 600 }: RequestOptions = {}): Promise<Promotion> {
  await wait('promo-save', delayMs, signal)
  const current = promotions.find((p) => p.id === id)
  if (!current) throw notFound()
  if (statusOf(current) === 'ended') throw conflict()
  const ended = { ...current, endedEarlyAt: new Date().toISOString() }
  promotions = promotions.map((p) => (p.id === id ? ended : p))
  notify()
  return ended
}

/** REPLACE: DELETE /promotions/:id. */
export async function deletePromotion(id: string, { signal, delayMs = 600 }: RequestOptions = {}): Promise<void> {
  await wait('promo-delete', delayMs, signal)
  if (!promotions.some((p) => p.id === id)) throw notFound()
  promotions = promotions.filter((p) => p.id !== id)
  notify()
}
