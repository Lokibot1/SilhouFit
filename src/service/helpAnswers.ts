// The saved answers behind the "KRAL Help" chatbot: the types, then a localStorage-backed service until the help backend exists.
import { validateHelpAnswer, type HelpField } from '../utils/helpAnswerValidation'
import { failParam } from './fetchStaffAnalytics'
import { simulateRequest, type RequestOptions } from './simulateRequest'

/** A public page an answer can point to; anything else is rejected when the answer is saved. */
export const HELP_LINK_PATHS = ['/shop', '/about', '/contact', '/signup', '/orders', '/profile/measurements', '/refund-policy', '/privacy-policy', '/terms-of-service', '/cookie-policy'] as const
export type PublicPath = (typeof HELP_LINK_PATHS)[number]

export const HELP_CATEGORIES = ['orders', 'shipping', 'returns', 'sizing', 'ar-fitting', 'account', 'privacy', 'payments'] as const
export type HelpCategory = (typeof HELP_CATEGORIES)[number]
export const HELP_CATEGORY_LABELS: Record<HelpCategory, string> = {
  orders: 'Orders',
  shipping: 'Shipping',
  returns: 'Returns',
  sizing: 'Sizing',
  'ar-fitting': 'AR fitting',
  account: 'Account',
  privacy: 'Privacy',
  payments: 'Payments',
}

export interface HelpLink {
  label: string
  to: PublicPath
}

export interface HelpAnswer {
  id: string
  question: string
  /** Plain text. */
  answer: string
  keywords: string[]
  category: HelpCategory
  link: HelpLink | null
  published: boolean
  /** Position in the full list, from 1. */
  order: number
  updatedBy: string
  updatedAt: string
}

/** All the chatbot ever sees of an answer: a published one, without who changed it or when. */
export type PublicHelpAnswer = Pick<HelpAnswer, 'id' | 'question' | 'answer' | 'keywords' | 'category' | 'link'>

export const HELP_ANSWERS_KEY = 'silhoufit.helpAnswers.v1'

/** Dev-only: ?fail=help-list (or help-save, help-delete) fails that request. */
const wait = (section: string, delayMs: number, signal?: AbortSignal) =>
  simulateRequest(delayMs, signal, () => failParam() === section).catch((error: Error) => {
    throw error.name === 'AbortError' ? error : Object.assign(error, { kind: 'network' })
  })

export type HelpAnswerInput = Pick<HelpAnswer, 'question' | 'answer' | 'keywords' | 'category' | 'link' | 'published'>

export interface HelpPage {
  data: HelpAnswer[]
  meta: { total: number; page: number; limit: number; totalPages: number }
}

export interface HelpQuery {
  search?: string
  category?: HelpCategory
  page?: number
  limit?: number
}

export const HELP_PER_PAGE = 10
export const HELP_PER_PAGE_OPTIONS = [10, 25, 50]
export const MAX_HELP_SEARCH = 60

const SEED_AT = '2026-10-01T09:00:00+08:00'
const SEED_BY = 'Dev Admin'

// category, question, answer, keywords, link
type Seed = [HelpCategory, string, string, string[], HelpLink | null]
const SEEDS: Seed[] = [
  ['ar-fitting', 'What is SilhouFit?', "SilhouFit is KRAL's AR fitting. It uses your camera and the measurements you enter to show how a piece sits on you, in your browser. Nothing is uploaded.", ['silhoufit', 'ar', 'camera', 'try on'], null],
  [
    'ar-fitting',
    'How does SilhouFit work?',
    'Turn on your camera and pose tracking reads body landmarks on your own device. A 3D garment, scaled to the piece you picked, renders over the video. It works on pieces marked AR-ready, and the module is still a working prototype.',
    ['ar', 'camera', 'pose', '3d', 'virtual'],
    null,
  ],
  [
    'sizing',
    'How do I enter my measurements?',
    'Sign in, then open the body setup from your profile. Enter your measurements in centimetres or inches and your weight in kilograms or pounds. Each value is checked against a sensible range, and you can edit it any time.',
    ['measurements', 'body', 'setup', 'weight', 'height'],
    { label: 'Open body setup', to: '/profile/measurements' },
  ],
  [
    'sizing',
    'How accurate is the sizing?',
    'It is guidance, not a guarantee. A fit check compares your measurements with the size chart of the piece, and cuts vary between garments. Each product page has a size guide to check against.',
    ['size', 'fit', 'accurate', 'size chart', 'size guide'],
    null,
  ],
  [
    'shipping',
    'What about shipping and returns?',
    'Orders are delivered to the address you give at checkout. Returns and refunds follow the refund policy.',
    ['shipping', 'delivery', 'return', 'refund'],
    { label: 'Read the refund policy', to: '/refund-policy' },
  ],
  [
    'privacy',
    'Are my measurements and camera private?',
    'The camera starts only after you allow it, and frames are processed on your device, not uploaded. Saved measurements belong to your account.',
    ['privacy', 'private', 'camera', 'data', 'safe'],
    { label: 'Read the privacy policy', to: '/privacy-policy' },
  ],
  [
    'account',
    'Do I need an account?',
    'You can browse the shop and product pages without one. Adding to the cart or wishlist, and saving measurements, need you to sign in.',
    ['account', 'sign up', 'register', 'login', 'sign in'],
    { label: 'Create an account', to: '/signup' },
  ],
  [
    'orders',
    'How do I track my order?',
    'Open Orders from your account menu to see every order and its status. Open an order to see its items and delivery address.',
    ['track', 'tracking', 'status', 'order', 'where is my order'],
    { label: 'Open my orders', to: '/orders' },
  ],
  [
    'orders',
    'Can I cancel an order?',
    'Open the order on your Orders page. If it can still be cancelled, the cancel button is shown there. Once an order is on its way it can no longer be cancelled.',
    ['cancel', 'cancellation', 'order'],
    { label: 'Open my orders', to: '/orders' },
  ],
  [
    'payments',
    'Which payment methods can I use?',
    'The payment options available are shown at checkout, where you pick one before you place the order.',
    ['payment', 'pay', 'card', 'checkout', 'method'],
    null,
  ],
  [
    'shipping',
    'How long does delivery take?',
    'Delivery time depends on your address. The shipping fee for your address is shown at checkout before you pay.',
    ['delivery', 'shipping', 'fee', 'how long', 'courier'],
    null,
  ],
  [
    'returns',
    'How do I ask for a refund?',
    'The refund policy explains what can be returned and how long you have. After that, send us your order details from the Contact page.',
    ['refund', 'return', 'exchange', 'money back'],
    { label: 'Read the refund policy', to: '/refund-policy' },
  ],
  [
    'account',
    'How do I reset my password?',
    'On the sign-in page choose Forgot password and enter your email. If the account exists, we send a link to set a new password. The link expires after a short time, so use it soon.',
    ['password', 'forgot', 'reset', 'login', 'sign in'],
    null,
  ],
  [
    'account',
    'How can I contact the store?',
    'Use the Contact page to send us a message. Signed-in customers can also choose Talk to a person in this box.',
    ['contact', 'support', 'message', 'talk', 'human'],
    { label: 'Open the contact page', to: '/contact' },
  ],
  [
    'sizing',
    'How do I find my size?',
    'Check the size guide on the product page and compare it with your measurements. Save your measurements in body setup so the fit check can use them.',
    ['size', 'find my size', 'size guide', 'fit', 'measure'],
    { label: 'Open body setup', to: '/profile/measurements' },
  ],
]

const seedAnswers = (): HelpAnswer[] =>
  SEEDS.map(([category, question, answer, keywords, link], n) => ({
    id: `help-${String(n + 1).padStart(3, '0')}`,
    question,
    answer,
    keywords,
    category,
    link,
    published: true,
    order: n + 1,
    updatedBy: SEED_BY,
    updatedAt: SEED_AT,
  }))

const isCategory = (value: unknown): value is HelpCategory => HELP_CATEGORIES.includes(value as HelpCategory)
const isPath = (value: unknown): value is PublicPath => HELP_LINK_PATHS.includes(value as PublicPath)

/** Reads what was saved; anything that does not look like an answer is dropped, and nothing saved means the seeds. */
function load(): HelpAnswer[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(HELP_ANSWERS_KEY) ?? 'null')
    if (!Array.isArray(saved)) return seedAnswers()
    const rows = saved.flatMap((raw: Partial<HelpAnswer> | null): HelpAnswer[] => {
      if (typeof raw?.id !== 'string' || typeof raw.question !== 'string' || typeof raw.answer !== 'string' || !isCategory(raw.category)) return []
      const link = raw.link && typeof raw.link.label === 'string' && isPath(raw.link.to) ? { label: raw.link.label, to: raw.link.to } : null
      const keywords = Array.isArray(raw.keywords) ? raw.keywords.filter((k): k is string => typeof k === 'string') : []
      return [{ id: raw.id, question: raw.question, answer: raw.answer, keywords, category: raw.category, link, published: raw.published === true, order: 0, updatedBy: String(raw.updatedBy ?? ''), updatedAt: String(raw.updatedAt ?? '') }]
    })
    return rows.map((row, n) => ({ ...row, order: n + 1 }))
  } catch {
    return seedAnswers()
  }
}

let answers = load()
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((listener) => listener())

function commit(next: HelpAnswer[]) {
  answers = next.map((row, n) => ({ ...row, order: n + 1 }))
  // Storage can be blocked or full, so the answers then live for this tab only.
  try {
    localStorage.setItem(HELP_ANSWERS_KEY, JSON.stringify(answers))
  } catch {
    // Keep the in-memory answers.
  }
  notify()
}

// Another tab changed the answers.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== HELP_ANSWERS_KEY && event.key !== null) return
    answers = load()
    notify()
  })
}

export const getHelpAnswers = () => answers

/** Test seam: replaces every answer. */
export const setHelpAnswers = (next: HelpAnswer[]) => commit(next)

/** Called after every change, so a list can load again. */
export function subscribeHelpAnswers(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const notFound = () => Object.assign(new Error('not-found'), { kind: 'not-found' })
/** A rule broken by the request itself: `field` names the form field it belongs to. */
const invalid = (message: string, field: HelpField) => Object.assign(new Error(message), { kind: 'validation', field })

/** The same rules the form uses, checked again where the data is saved. */
function check(input: HelpAnswerInput) {
  const errors = validateHelpAnswer({ ...input, keywords: input.keywords.join(','), linkTo: input.link?.to ?? '', linkLabel: input.link?.label ?? '' })
  const [field] = Object.keys(errors) as HelpField[]
  if (field) throw invalid(errors[field]!, field)
}

/** REPLACE: GET /help/answers (no sign-in) -> PublicHelpAnswer[] in order; only published answers, and only these fields. */
export async function listPublicAnswers({ signal, delayMs = 400 }: RequestOptions = {}): Promise<PublicHelpAnswer[]> {
  await wait('help-list', delayMs, signal)
  return answers.filter((a) => a.published).map(({ id, question, answer, keywords, category, link }) => ({ id, question, answer, keywords, category, link }))
}

/** REPLACE: GET /admin/help-answers?search=&category=&page=&limit= -> HelpPage in order (search matches the question, ignoring case). */
export async function listHelpAnswers({ signal, delayMs = 600, search, category, page = 1, limit = HELP_PER_PAGE }: HelpQuery & RequestOptions = {}): Promise<HelpPage> {
  await wait('help-list', delayMs, signal)
  const needle = search?.trim().toLowerCase().slice(0, MAX_HELP_SEARCH)
  const matched = answers.filter((a) => (!category || a.category === category) && (!needle || a.question.toLowerCase().includes(needle)))
  return { data: matched.slice((page - 1) * limit, page * limit), meta: { total: matched.length, page, limit, totalPages: Math.ceil(matched.length / limit) } }
}

/** REPLACE: POST /admin/help-answers with { question, answer, keywords, category, link: { to, label } | null, published } -> HelpAnswer (added last); 422 with `field` when a rule is broken. */
export async function createHelpAnswer(input: HelpAnswerInput, by: string, { signal, delayMs = 700 }: RequestOptions = {}): Promise<HelpAnswer> {
  await wait('help-save', delayMs, signal)
  check(input)
  const created: HelpAnswer = { ...input, id: `help-${Date.now().toString(36)}-${answers.length}`, order: answers.length + 1, updatedBy: by, updatedAt: new Date().toISOString() }
  commit([...answers, created])
  return created
}

/** REPLACE: PATCH /admin/help-answers/:id with the same body as POST -> HelpAnswer. */
export async function updateHelpAnswer(id: string, input: HelpAnswerInput, by: string, { signal, delayMs = 700 }: RequestOptions = {}): Promise<HelpAnswer> {
  await wait('help-save', delayMs, signal)
  const current = answers.find((a) => a.id === id)
  if (!current) throw notFound()
  check(input)
  const saved = { ...current, ...input, updatedBy: by, updatedAt: new Date().toISOString() }
  commit(answers.map((a) => (a.id === id ? saved : a)))
  return saved
}

/** REPLACE: DELETE /admin/help-answers/:id. */
export async function deleteHelpAnswer(id: string, { signal, delayMs = 600 }: RequestOptions = {}): Promise<void> {
  await wait('help-delete', delayMs, signal)
  if (!answers.some((a) => a.id === id)) throw notFound()
  commit(answers.filter((a) => a.id !== id))
}

/** REPLACE: POST /admin/help-answers/:id/move { direction: 'up' | 'down' } -> { position }. At either end nothing moves. */
export async function moveHelpAnswer(id: string, direction: 'up' | 'down', { signal, delayMs = 400 }: RequestOptions = {}): Promise<number> {
  await wait('help-save', delayMs, signal)
  const from = answers.findIndex((a) => a.id === id)
  if (from < 0) throw notFound()
  const to = direction === 'up' ? from - 1 : from + 1
  if (to < 0 || to >= answers.length) return from + 1
  const next = [...answers]
  next.splice(to, 0, next.splice(from, 1)[0])
  commit(next)
  return to + 1
}
