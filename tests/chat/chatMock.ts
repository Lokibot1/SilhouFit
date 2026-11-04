import { type Page, type Route, type WebSocketRoute } from '@playwright/test'
import { DEMO, mockAuth } from '../shared/session'

// Stands in for the chat backend and for Supabase Realtime.
//  - REST: page.route on the API origin (/chat/...), answered from the plain object returned by mockChat (tests edit it and read what was sent).
//  - Sign-in: the real form against the mocked Supabase from tests/shared/session.ts, so the session is a real (not simulated) one.
//  - Realtime: page.routeWebSocket plays the Supabase Realtime server (Phoenix protocol, serializer 2.0.0: [join_ref, ref, topic, event, payload]).
//    It accepts every private join (or refuses it, to simulate a channel error) and pushes a `broadcast` event `message` carrying the camelCase message
//    the way the API does, through `realtime.push`.
//    No app code is touched, so the real supabase-js channel code runs.

export type Role = 'customer' | 'staff' | 'admin' | 'superadmin'
export interface Person {
  id: string
  name: string
  role: Role
}
export interface Sender {
  id: string
  firstName: string
  lastName: string
  fullName: string
  role: Role
  avatarUrl: null
}
export interface Msg {
  id: string
  conversationId: string
  senderId: string
  content: string
  createdAt: string
  updatedAt: string
  sender: Sender
}
export interface Conv {
  id: string
  customerId: string
  customer: { id: string; email: string; firstName: string; lastName: string; fullName: string; avatarUrl: null }
  lastMessageAt: string | null
  customerReadAt: string | null
  staffReadAt: string | null
  hasUnreadMessages: boolean
  lastMessage: Msg | null
  createdAt: string
  updatedAt: string
}

export const CID = 'c1'
export const CUSTOMER: Person = { id: 'user-1', name: 'Demo Shopper', role: 'customer' }
export const SAM: Person = { id: 'staff-1', name: 'Sam Staff', role: 'staff' }
export const ANA: Person = { id: 'adm-9', name: 'Ana Admin', role: 'admin' }
export const ME: Record<Role, Person> = {
  customer: CUSTOMER,
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

const senderOf = (person: Person): Sender => {
  const [firstName, ...rest] = person.name.split(' ')
  return { id: person.id, firstName, lastName: rest.join(' '), fullName: person.name, role: person.role, avatarUrl: null }
}

export const conversation = (overrides: Partial<Conv> = {}, who: Person = CUSTOMER): Conv => {
  const sender = senderOf(who)
  return {
    id: CID,
    customerId: who.id,
    customer: { id: who.id, email: `${sender.firstName.toLowerCase()}@example.com`, firstName: sender.firstName, lastName: sender.lastName, fullName: who.name, avatarUrl: null },
    lastMessageAt: null,
    customerReadAt: null,
    staffReadAt: null,
    hasUnreadMessages: false,
    lastMessage: null,
    createdAt: '2026-11-03T01:00:00.000Z',
    updatedAt: '2026-11-03T01:00:00.000Z',
    ...overrides,
  }
}

let counter = 0
/** A message from `from`; `at` defaults to now so a live message sorts after the seeded ones. */
export function msg(content: string, from: Person, at = new Date().toISOString(), overrides: Partial<Msg> = {}): Msg {
  counter += 1
  return { id: `m${counter}`, conversationId: CID, senderId: from.id, content, createdAt: at, updatedAt: at, sender: senderOf(from), ...overrides }
}
export const OLD = (minutes: number) => new Date(Date.UTC(2026, 10, 3, 2, minutes)).toISOString()

/** How the next POST /messages is answered: stored, a network failure, or an error status with the server's message. */
export type SendReply = 'ok' | 'abort' | { status: number; message: string }

interface Join {
  ws: WebSocketRoute
  topic: string
  joinRef: string
}

export interface RealtimeMock {
  /** 'error' refuses every join (the client reports CHANNEL_ERROR and retries); 'ok' accepts it. */
  mode: 'ok' | 'error'
  /** Topics the page has joined, e.g. 'realtime:chat:conversation:c1'. */
  topics: () => string[]
  /** Broadcasts `message` like the API: to the conversation's channel, the staff inbox and the customer's channel, for those that are joined. Waits until one is. */
  push: (message: Msg, customerId?: string) => Promise<void>
}

export interface ChatMock {
  /** What GET /chat/my-conversation returns. */
  mine: Conv
  /** The staff inbox, and what GET /chat/conversations/:id reads from. */
  conversations: Conv[]
  /** Chronological, oldest first. */
  messages: Msg[]
  /** The signed-in user, as the sender of sent messages. */
  me: Person
  /** Every POST /messages content, in order. */
  sends: string[]
  sendReply: (attempt: number) => SendReply
  /** Make a GET answer with this status instead of its data (cleared by setting null). */
  fail: { inbox: number | null; conversation: number | null }
  /** `${method} ${path}` of every request, e.g. 'POST /chat/conversations/c1/read'. */
  calls: string[]
  /** The query string of every GET /chat/conversations. */
  inboxQueries: string[]
  /** Holds the next matching requests until the returned function is called. */
  hold: (what: 'conversation' | 'send') => () => void
  realtime: RealtimeMock
}

/** Plays the Supabase Realtime server. Registered before the first navigation. */
async function mockRealtime(page: Page): Promise<RealtimeMock> {
  const joins: Join[] = []
  const realtime: RealtimeMock = {
    mode: 'ok',
    topics: () => joins.map((j) => j.topic),
    push: async (message, customerId = CUSTOMER.id) => {
      const topics = [`realtime:chat:conversation:${message.conversationId}`, 'realtime:chat:inbox', `realtime:chat:customer:${customerId}`]
      const matches = () => joins.filter((j) => topics.includes(j.topic))
      for (let tries = 0; matches().length === 0 && tries < 100; tries++) await new Promise((resolve) => setTimeout(resolve, 100))
      for (const join of matches()) {
        join.ws.send(JSON.stringify([join.joinRef, null, join.topic, 'broadcast', { type: 'broadcast', event: 'message', payload: message }]))
      }
    },
  }
  await page.routeWebSocket(/\/realtime\/v1\/websocket/, (ws) => {
    ws.onMessage((raw) => {
      const [joinRef, ref, topic, event, payload] = JSON.parse(String(raw)) as [string | null, string | null, string, string, { config?: { private?: boolean } }]
      const reply = (status: 'ok' | 'error', response: unknown) => ws.send(JSON.stringify([joinRef, ref, topic, 'phx_reply', { status, response }]))
      if (event === 'phx_join') {
        // Like the real server: a refused join, or a channel that is not private (the API only sends on private ones), is an error.
        if (realtime.mode === 'error' || payload.config?.private !== true) return reply('error', { reason: 'Unauthorized: You do not have permissions to read from this Channel' })
        joins.push({ ws, topic, joinRef: joinRef ?? '' })
        return reply('ok', { postgres_changes: [] })
      }
      if (event === 'phx_leave') {
        const gone = joins.findIndex((j) => j.ws === ws && j.topic === topic)
        if (gone >= 0) joins.splice(gone, 1)
      }
      return reply('ok', {})
    })
  })
  return realtime
}

/** Answers the chat endpoints. Defaults: one thread, no messages; edit the returned object before the first navigation. */
export async function mockChat(page: Page, role: Role = 'customer', init: Partial<Pick<ChatMock, 'mine' | 'conversations' | 'messages'>> = {}): Promise<ChatMock> {
  const gates: Partial<Record<'conversation' | 'send', Promise<void>>> = {}
  const mock: ChatMock = {
    mine: init.mine ?? conversation(),
    conversations: init.conversations ?? [conversation()],
    messages: init.messages ?? [],
    me: ME[role],
    sends: [],
    sendReply: () => 'ok',
    fail: { inbox: null, conversation: null },
    calls: [],
    inboxQueries: [],
    hold: (what) => {
      let release = () => {}
      gates[what] = new Promise<void>((resolve) => (release = resolve))
      return release
    },
    realtime: await mockRealtime(page),
  }

  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, json: body, headers: CORS })
  await page.route(
    (url) => url.origin !== PAGE_ORIGIN && url.pathname.startsWith('/chat/'),
    async (route) => {
      const request = route.request()
      const { pathname, searchParams } = new URL(request.url())
      const method = request.method()
      if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
      mock.calls.push(`${method} ${pathname}`)
      const [, , section, id, action] = pathname.split('/')

      if (section === 'my-conversation') {
        await gates.conversation
        if (mock.fail.conversation) return json(route, { message: 'Boom' }, mock.fail.conversation)
        return json(route, mock.mine)
      }
      if (!id) {
        mock.inboxQueries.push(searchParams.toString())
        if (mock.fail.inbox) return json(route, { message: 'Boom' }, mock.fail.inbox)
        const search = (searchParams.get('search') ?? '').toLowerCase()
        const data = mock.conversations
          .filter((c) => `${c.customer.fullName} ${c.customer.email}`.toLowerCase().includes(search))
          .filter((c) => searchParams.get('unreadOnly') !== 'true' || c.hasUnreadMessages)
        return json(route, { data, meta: { total: data.length, page: 1, limit: Number(searchParams.get('limit') ?? 20), totalPages: 1 } })
      }
      if (!action) {
        await gates.conversation
        if (mock.fail.conversation) return json(route, { message: 'Boom' }, mock.fail.conversation)
        return json(route, mock.conversations.find((c) => c.id === id) ?? mock.mine)
      }
      if (action === 'messages' && method === 'GET') return json(route, { data: mock.messages, meta: { total: mock.messages.length, limit: 50, hasMore: false } })
      if (action === 'messages' && method === 'POST') {
        const { content } = request.postDataJSON() as { content: string }
        mock.sends.push(content)
        await gates.send
        const reply = mock.sendReply(mock.sends.length)
        if (reply === 'abort') return route.abort('failed')
        if (reply !== 'ok') return json(route, { message: reply.message }, reply.status)
        const stored = msg(content, mock.me)
        mock.messages.push(stored)
        return json(route, stored, 201)
      }
      return json(route, { success: true })
    },
  )
  return mock
}

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
/** The page for the role's chat: the customer's one thread, or the staff inbox with the thread open when `thread` is true. */
export const inboxPath = (role: Role, thread = true) => (role === 'customer' ? '/messages' : `${HOME[role]}/messages${thread ? `?c=${CID}` : ''}`)

export interface StartOptions {
  path?: string
  init?: Parameters<typeof mockChat>[2]
  /** Runs before the first navigation, for what the page asks for on load (a failing GET, a held request). */
  setup?: (api: ChatMock) => void
}

/** Mocks auth, the profile, the chat API and Realtime, signs in through the real form and lands on `path`. */
export async function startChat(page: Page, role: Role, { path = inboxPath(role), init, setup }: StartOptions = {}) {
  await mockAuth(page)
  await mockMe(page, role)
  await page.addInitScript(() => localStorage.setItem('silhoufit-cookie-consent', 'accepted'))
  const api = await mockChat(page, role, init)
  setup?.(api)
  await page.goto(`/login?next=${encodeURIComponent(path)}`)
  await page.getByLabel('Email', { exact: true }).fill(DEMO.email)
  await page.getByLabel('Password', { exact: true }).fill(DEMO.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.waitForURL((url) => url.pathname + url.search === path)
  return api
}
