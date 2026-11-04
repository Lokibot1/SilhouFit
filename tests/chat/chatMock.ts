import { type Page, type Route } from '@playwright/test'
import { DEMO, mockAuth } from '../shared/session'

// Stands in for the chat backend (its migration is not applied) and for the Socket.IO connection.
//  - REST: page.route on the API origin, answered from the plain object returned by mockChat (tests edit it and read what was sent).
//  - Sign-in: the real form against the mocked Supabase from tests/shared/session.ts, so the session is a real (not simulated) one.
//  - Socket: socket.io-client is loaded lazily by src/service/chatSocket.ts as a Vite dependency; that one module is replaced by a fake
//    `io()` whose events the test drives through window.__chat (serverEmit / setConnected). No app code is touched.

export type Role = 'customer' | 'staff' | 'admin' | 'superadmin'
export interface Holder {
  id: string
  name: string
  role: Role
}
export interface Msg {
  id: string
  conversationId: string
  senderId: string
  senderName: string
  senderRole: Role
  body: string
  clientId: string
  createdAt: string
}
export interface Summary {
  id: string
  orderNo: string
  customer: { id: string; firstName: string; lastName: string }
  lastMessage: string | null
  lastMessageAt: string | null
  unreadCount: number
  holder: Holder | null
}
export interface Detail extends Summary {
  canSend: boolean
  canTakeOver: boolean
  canRelease: boolean
}

export const CID = 'c1'
export const CUSTOMER = { id: 'user-1', name: 'Demo Shopper' }
export const SAM: Holder = { id: 'staff-1', name: 'Sam Staff', role: 'staff' }
export const ANA: Holder = { id: 'adm-9', name: 'Ana Admin', role: 'admin' }
export const SUE: Holder = { id: 'sup-9', name: 'Sue Super', role: 'superadmin' }
export const ME: Record<Role, Holder> = {
  customer: { id: CUSTOMER.id, name: CUSTOMER.name, role: 'customer' },
  staff: SAM,
  admin: { id: 'adm-1', name: 'Dev Admin', role: 'admin' },
  superadmin: { id: 'sup-1', name: 'Root Super', role: 'superadmin' },
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
}
const PAGE_ORIGIN = 'http://localhost:5173'

export const summary = (overrides: Partial<Summary> = {}): Summary => ({
  id: CID,
  orderNo: 'SF-1001',
  customer: { id: CUSTOMER.id, firstName: 'Demo', lastName: 'Shopper' },
  lastMessage: null,
  lastMessageAt: null,
  unreadCount: 0,
  holder: null,
  ...overrides,
})

export const detail = (overrides: Partial<Detail> = {}): Detail => ({ ...summary(), canSend: true, canTakeOver: false, canRelease: false, ...overrides })

let counter = 0
/** A message from `from`; `at` defaults to now so a live message sorts after the seeded ones. */
export function msg(body: string, from: Holder, at = new Date().toISOString(), overrides: Partial<Msg> = {}): Msg {
  counter += 1
  return { id: `m${counter}`, conversationId: CID, senderId: from.id, senderName: from.name, senderRole: from.role, body, clientId: `cid-${counter}`, createdAt: at, ...overrides }
}
export const OLD = (minutes: number) => new Date(Date.UTC(2026, 10, 3, 2, minutes)).toISOString()

export interface SentBody {
  body: string
  clientId: string
}
/** How the next POST /messages is answered: stored, a network failure, or an error status with the server's message. */
export type SendReply = 'ok' | 'abort' | { status: number; message: string }

export interface ChatMock {
  summaries: Summary[]
  detail: Detail
  messages: Msg[]
  /** The signed-in user, as an author of sent messages. */
  me: Holder
  /** Every POST /messages body, in order. */
  sends: SentBody[]
  sendReply: (attempt: number) => SendReply
  /** Make a GET answer with this status instead of its data (cleared by setting null). */
  fail: { inbox: number | null; detail: number | null }
  /** `${method} ${path}` of every request, e.g. 'POST /conversations/c1/read'. */
  calls: string[]
  /** What POST /takeover and /release do to `detail`; the default hands the thread to / back from `me`. */
  onTakeOver: () => void
  onRelease: () => void
  /** Holds the next matching requests until the returned function is called. */
  hold: (what: 'detail' | 'send') => () => void
}

/** Answers the chat endpoints. Defaults: one thread, no messages, nobody holding it; edit the returned object before the first navigation. */
export async function mockChat(page: Page, role: Role = 'customer', init: Partial<Pick<ChatMock, 'summaries' | 'detail' | 'messages'>> = {}): Promise<ChatMock> {
  const gates: Partial<Record<'detail' | 'send', Promise<void>>> = {}
  const mock: ChatMock = {
    summaries: init.summaries ?? [summary()],
    detail: init.detail ?? detail(),
    messages: init.messages ?? [],
    me: ME[role],
    sends: [],
    sendReply: () => 'ok',
    fail: { inbox: null, detail: null },
    calls: [],
    onTakeOver: () => {
      mock.detail = { ...mock.detail, holder: mock.me, canSend: true, canTakeOver: false, canRelease: true }
    },
    onRelease: () => {
      mock.detail = { ...mock.detail, holder: null, canSend: true, canTakeOver: true, canRelease: false }
    },
    hold: (what) => {
      let release = () => {}
      gates[what] = new Promise<void>((resolve) => (release = resolve))
      return release
    },
  }

  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, json: body, headers: CORS })
  await page.route(
    (url) => url.origin !== PAGE_ORIGIN && url.pathname.startsWith('/conversations'),
    async (route) => {
      const request = route.request()
      const { pathname } = new URL(request.url())
      const method = request.method()
      if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
      mock.calls.push(`${method} ${pathname}`)
      const [, , id, action] = pathname.split('/')

      if (!id) {
        if (mock.fail.inbox) return json(route, { message: 'Boom' }, mock.fail.inbox)
        return json(route, { data: mock.summaries, meta: { total: mock.summaries.length } })
      }
      if (id === 'me') return json(route, mock.summaries)
      if (!action && method === 'GET') {
        await gates.detail
        if (mock.fail.detail) return json(route, { message: 'Boom' }, mock.fail.detail)
        return json(route, mock.detail)
      }
      if (action === 'messages' && method === 'GET') return json(route, { data: [...mock.messages].reverse(), meta: { hasMore: false, nextCursor: null } })
      if (action === 'messages' && method === 'POST') {
        const body = request.postDataJSON() as SentBody
        mock.sends.push(body)
        await gates.send
        const reply = mock.sendReply(mock.sends.length)
        if (reply === 'abort') return route.abort('failed')
        if (reply !== 'ok') return json(route, { message: reply.message }, reply.status)
        const stored = msg(body.body, mock.me, new Date().toISOString(), { clientId: body.clientId })
        mock.messages.push(stored)
        return json(route, stored, 201)
      }
      if (action === 'takeover') mock.onTakeOver()
      if (action === 'release') mock.onRelease()
      return json(route, {})
    },
  )
  return mock
}

/** Replaces socket.io-client with a fake whose server side the test drives. Call before the first navigation. */
export async function mockSocket(page: Page) {
  await page.route('**/socket__io-client.js*', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `
        const listeners = {}
        const state = (window.__chat = {
          connected: false,
          emitted: [],
          listenerCount: (event) => (listeners[event] || []).length,
          serverEmit: (event, payload) => (listeners[event] || []).slice().forEach((fn) => fn(payload)),
          setConnected(value) {
            state.connected = value
            state.serverEmit(value ? 'connect' : 'disconnect')
          },
        })
        const socket = {
          get connected() { return state.connected },
          on(event, fn) { (listeners[event] ||= []).push(fn); return socket },
          off(event, fn) { listeners[event] = (listeners[event] || []).filter((f) => f !== fn); return socket },
          emit(event, data, ack) { state.emitted.push({ event, data }); if (typeof ack === 'function') queueMicrotask(() => ack({ ok: true })); return socket },
          connect() { return socket },
          disconnect() { return socket },
        }
        export function io() { state.connected = true; return socket }
        export default io
      `,
    }),
  )
}

type ChatWindow = { __chat: { listenerCount: (event: string) => number; serverEmit: (event: string, payload?: unknown) => void; setConnected: (value: boolean) => void; emitted: { event: string; data: unknown }[] } }

/** Pushes a socket event to the page once the app is listening for it, so the test never races the subscription. */
export async function serverEmit(page: Page, event: string, payload?: unknown) {
  await page.waitForFunction((name) => (window as unknown as ChatWindow).__chat?.listenerCount(name) > 0, event)
  await page.evaluate(([name, body]) => (window as unknown as ChatWindow).__chat.serverEmit(name as string, body), [event, payload] as const)
}

export async function setConnected(page: Page, connected: boolean) {
  await page.waitForFunction(() => (window as unknown as ChatWindow).__chat?.listenerCount('disconnect') > 0)
  await page.evaluate((value) => (window as unknown as ChatWindow).__chat.setConnected(value), connected)
}

/** The events the page sent to the server, e.g. conversation:join. */
export const emitted = (page: Page) => page.evaluate(() => (window as unknown as ChatWindow).__chat.emitted)

/** GET /users/me for a signed-in chat user. Register after mockAuth, which it overrides. */
async function mockMe(page: Page, role: Role) {
  const who = ME[role]
  const [firstName, lastName] = who.name.split(' ')
  await page.route('**/users/me', (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    return route.fulfill({
      json: {
        id: who.id, email: DEMO.email, role, firstName, middleName: null, lastName, suffix: null, fullName: who.name, avatarUrl: null,
        birthday: null, gender: null, createdAt: '2026-01-15T08:30:00.000Z', updatedAt: '2026-01-15T08:30:00.000Z',
      },
      headers: CORS,
    })
  })
}

const HOME: Record<Role, string> = { customer: '', staff: '/staff', admin: '/admin', superadmin: '/superadmin' }
/** The page for the role's inbox, with the thread open when `thread` is true. */
export const inboxPath = (role: Role, thread = true) => (role === 'customer' ? `/messages/${CID}` : `${HOME[role]}/messages${thread ? `?c=${CID}` : ''}`)

export interface StartOptions {
  path?: string
  init?: Parameters<typeof mockChat>[2]
  /** Runs before the first navigation, for what the page asks for on load (a failing GET, a held request). */
  setup?: (api: ChatMock) => void
}

/** Mocks auth, the profile, the chat API and the socket, signs in through the real form and lands on `path`. */
export async function startChat(page: Page, role: Role, { path = inboxPath(role), init, setup }: StartOptions = {}) {
  await mockAuth(page)
  await mockMe(page, role)
  await page.addInitScript(() => localStorage.setItem('silhoufit-cookie-consent', 'accepted'))
  const api = await mockChat(page, role, init)
  await mockSocket(page)
  setup?.(api)
  await page.goto(`/login?next=${encodeURIComponent(path)}`)
  await page.getByLabel('Email', { exact: true }).fill(DEMO.email)
  await page.getByLabel('Password', { exact: true }).fill(DEMO.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.waitForURL((url) => url.pathname + url.search === path)
  return api
}
