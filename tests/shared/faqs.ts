import type { Page, Route } from '@playwright/test'

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type, apikey, x-client-info, x-upsert',
  'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
}

const PAGE_ORIGIN = 'http://localhost:5173'

/** A FAQ as the API sends it. */
export interface ApiFaq {
  id: string
  question: string
  answer: string
  topic: string
  keywords: string[]
  link: string | null
  order: number
  isActive: boolean
  isDeleted: boolean
  createdAt: string
  updatedAt: string
}

export const apiFaq = (n: number, over: Partial<ApiFaq> = {}): ApiFaq => ({
  id: `faq-${n}`,
  question: `Question number ${n}?`,
  answer: `Answer number ${n}.`,
  topic: 'orders',
  keywords: [],
  link: null,
  order: n,
  isActive: true,
  isDeleted: false,
  createdAt: '2026-10-01T01:00:00.000Z',
  updatedAt: '2026-10-01T01:00:00.000Z',
  ...over,
})

// topic, question, answer, keywords, link
type Seed = [string, string, string, string[], string | null]
const SEEDS: Seed[] = [
  ['ar_fitting', 'What is SilhouFit?', "SilhouFit is KRAL's AR fitting. It uses your camera and the measurements you enter to show how a piece sits on you, in your browser. Nothing is uploaded.", ['silhoufit', 'ar', 'camera', 'try on'], null],
  [
    'ar_fitting',
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
    '/profile/measurements',
  ],
  [
    'sizing',
    'How accurate is the sizing?',
    'It is guidance, not a guarantee. A fit check compares your measurements with the size chart of the piece, and cuts vary between garments. Each product page has a size guide to check against.',
    ['size', 'fit', 'accurate', 'size chart', 'size guide'],
    null,
  ],
  ['shipping', 'What about shipping and returns?', 'Orders are delivered to the address you give at checkout. Returns and refunds follow the refund policy.', ['shipping', 'delivery', 'return', 'refund'], '/refund-policy'],
  [
    'privacy',
    'Are my measurements and camera private?',
    'The camera starts only after you allow it, and frames are processed on your device, not uploaded. Saved measurements belong to your account.',
    ['privacy', 'private', 'camera', 'data', 'safe'],
    '/privacy-policy',
  ],
  [
    'account',
    'Do I need an account?',
    'You can browse the shop and product pages without one. Adding to the cart or wishlist, and saving measurements, need you to sign in.',
    ['account', 'sign up', 'register', 'login', 'sign in'],
    '/signup',
  ],
  [
    'orders',
    'How do I track my order?',
    'Open Orders from your account menu to see every order and its status. Open an order to see its items and delivery address.',
    ['track', 'tracking', 'status', 'order', 'where is my order'],
    '/orders',
  ],
  [
    'orders',
    'Can I cancel an order?',
    'Open the order on your Orders page. If it can still be cancelled, the cancel button is shown there. Once an order is on its way it can no longer be cancelled.',
    ['cancel', 'cancellation', 'order'],
    '/orders',
  ],
  ['payments', 'Which payment methods can I use?', 'The payment options available are shown at checkout, where you pick one before you place the order.', ['payment', 'pay', 'card', 'checkout', 'method'], null],
  ['shipping', 'How long does delivery take?', 'Delivery time depends on your address. The shipping fee for your address is shown at checkout before you pay.', ['delivery', 'shipping', 'fee', 'how long', 'courier'], null],
  [
    'returns',
    'How do I ask for a refund?',
    'The refund policy explains what can be returned and how long you have. After that, send us your order details from the Contact page.',
    ['refund', 'return', 'exchange', 'money back'],
    '/refund-policy',
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
    '/contact',
  ],
  [
    'sizing',
    'How do I find my size?',
    'Check the size guide on the product page and compare it with your measurements. Save your measurements in body setup so the fit check can use them.',
    ['size', 'find my size', 'size guide', 'fit', 'measure'],
    '/profile/measurements',
  ],
]

/** The 15 starter answers, as the API sends them. */
export const FAQS: ApiFaq[] = SEEDS.map(([topic, question, answer, keywords, link], n) => apiFaq(n + 1, { topic, question, answer, keywords, link }))

/** Like the API: no status (or active) is published and not deleted, inactive is drafts not deleted, deleted is deleted only, all is everything. */
const byStatus = (rows: ApiFaq[], status: string | null) => {
  if (status === 'all') return rows
  if (status === 'deleted') return rows.filter((r) => r.isDeleted)
  return rows.filter((r) => !r.isDeleted && r.isActive === (status !== 'inactive'))
}
const renumber = (rows: ApiFaq[]) => {
  let n = 0
  for (const row of rows) row.order = row.isDeleted ? 0 : ++n
}

/** Stands in for the FAQ API: GET (list), POST, PATCH (move or edit) and DELETE (soft). Keeps its own copy of the rows. */
export function faqStore(initial: ApiFaq[]) {
  const rows = initial.map((r) => ({ ...r }))
  let created = 0
  const ordered = () => [...rows].sort((a, b) => a.order - b.order)
  const notDeleted = () => ordered().filter((r) => !r.isDeleted)

  return {
    rows,
    handle(method: string, path: string, body?: unknown): { status: number; json: unknown } {
      const url = new URL(path, 'http://x')
      const id = url.pathname.split('/')[2]
      const patch = (body ?? {}) as Record<string, unknown>
      if (method === 'GET') {
        const data = byStatus(ordered(), url.searchParams.get('status'))
        return { status: 200, json: { data, meta: { total: data.length, page: 1, limit: 100, totalPages: 1, hasNextPage: false, hasPreviousPage: false } } }
      }
      if (method === 'POST') {
        const { order, ...fields } = patch
        const row = apiFaq(100 + ++created, fields)
        const others = notDeleted()
        others.splice(typeof order === 'number' ? Math.min(order, others.length + 1) - 1 : others.length, 0, row)
        rows.push(row)
        renumber(others)
        return { status: 201, json: row }
      }
      const row = rows.find((r) => r.id === id)
      if (!row) return { status: 404, json: { message: 'Not found' } }
      if (method === 'DELETE') {
        row.isDeleted = true
        renumber(ordered())
        return { status: 200, json: row }
      }
      const { order, ...fields } = patch
      Object.assign(row, fields, { updatedAt: new Date().toISOString() })
      if (typeof order === 'number') {
        const others = notDeleted().filter((r) => r !== row)
        others.splice(Math.min(order, others.length + 1) - 1, 0, row)
        renumber(others)
      }
      return { status: 200, json: row }
    },
  }
}

/** Stands in for the FAQ API in the browser; register it before the page loads. State lives in the closure. */
export async function mockFaqs(page: Page, initial: ApiFaq[]) {
  const store = faqStore(initial)
  await page.route((url) => url.origin !== PAGE_ORIGIN && /^\/faqs(\/|$)/.test(url.pathname), async (route: Route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    const url = new URL(request.url())
    const { status, json } = store.handle(request.method(), url.pathname + url.search, request.postDataJSON() ?? undefined)
    return route.fulfill({ status, json, headers: CORS })
  })
  return store
}
