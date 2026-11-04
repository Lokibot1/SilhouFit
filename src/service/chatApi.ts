import { SIMULATED_AUTH } from '../config/accountPolicy'
import { ProductListError, request, type ProductListErrorKind } from './fetchProductList'
import { getSession } from './session'
import type { RequestOptions } from './simulateRequest'

export type ChatRole = 'customer' | 'staff' | 'admin' | 'superadmin'

/** The one name a customer sees for every staff, admin and superadmin sender. The API sends real names; this is only how the customer's screen shows them. */
export const CHAT_BRAND_NAME = 'KRAL'

/** What a staff member sees next to a sender's name; a customer has no label. */
export const ROLE_LABEL: Record<ChatRole, string> = {
  customer: '',
  staff: 'Staff',
  admin: 'Admin',
  superadmin: 'Superadmin',
}

export interface MessageSender {
  id: string
  firstName: string
  lastName: string
  fullName: string | null
  role: ChatRole
  avatarUrl: string | null
}

export interface ChatMessage {
  id: string
  conversationId: string
  senderId: string
  content: string
  createdAt: string
  updatedAt: string
  /** Missing on a message that arrived over Realtime: the row has no sender. */
  sender?: MessageSender
}

export interface CustomerSummary {
  id: string
  email: string
  firstName: string
  lastName: string
  fullName: string | null
  avatarUrl: string | null
}

export interface Conversation {
  id: string
  customerId: string
  customer?: CustomerSummary
  lastMessageAt: string | null
  customerReadAt: string | null
  staffReadAt: string | null
  hasUnreadMessages: boolean
  lastMessage: ChatMessage | null
  createdAt: string
  updatedAt: string
}

export interface ConversationsPage {
  conversations: Conversation[]
  total: number
}

export interface MessagesPage {
  /** Oldest first, ready to render. */
  messages: ChatMessage[]
  hasMore: boolean
}

export interface ConversationParams {
  page?: number
  limit?: number
  search?: string
  unreadOnly?: boolean
}

export const MAX_MESSAGE_LENGTH = 2000

// 'simulated': a dev account has no Supabase token, so the chat cannot reach the API.
export type ChatErrorKind = ProductListErrorKind | 'simulated'

export class ChatError extends Error {
  kind: ChatErrorKind
  detail?: string

  constructor(kind: ChatErrorKind, detail?: string) {
    super(`Chat request failed (${kind}).`)
    this.kind = kind
    this.detail = detail
  }
}

/** Sent after a conversation is marked read, so the unread badge and the inbox can ask again. */
export const CHAT_READ_EVENT = 'silhoufit:chat-read'

/** The shared request helper, with its failures turned into ChatError. An abort passes through untouched. */
async function call(method: 'GET' | 'POST', path: string, body?: unknown, signal?: AbortSignal) {
  if (SIMULATED_AUTH && getSession()?.simulated) throw new ChatError('simulated')
  try {
    return await request(method, path, body, signal)
  } catch (failure) {
    if (failure instanceof ProductListError) throw new ChatError(failure.kind, failure.detail)
    throw failure
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null
const isRole = (value: unknown): value is ChatRole => value === 'customer' || value === 'staff' || value === 'admin' || value === 'superadmin'
const text = (value: unknown) => (typeof value === 'string' ? value : '')
const nullableText = (value: unknown) => (typeof value === 'string' ? value : null)

/** The name to show for a sender or a customer: the full name, else first and last name joined. */
export const displayName = (person: { firstName: string; lastName: string; fullName: string | null }) => person.fullName || [person.firstName, person.lastName].filter(Boolean).join(' ')

function toSender(value: unknown): MessageSender | undefined {
  if (!isRecord(value) || typeof value.id !== 'string' || !isRole(value.role)) return undefined
  return { id: value.id, firstName: text(value.firstName), lastName: text(value.lastName), fullName: nullableText(value.fullName), role: value.role, avatarUrl: nullableText(value.avatarUrl) }
}

export function toMessage(value: unknown): ChatMessage {
  if (!isRecord(value)) throw new ChatError('server')
  const { id, conversationId, senderId, content, createdAt, updatedAt } = value
  if (typeof id !== 'string' || typeof conversationId !== 'string' || typeof senderId !== 'string' || typeof content !== 'string') throw new ChatError('server')
  if (typeof createdAt !== 'string' || Number.isNaN(Date.parse(createdAt))) throw new ChatError('server')
  const sender = toSender(value.sender)
  return { id, conversationId, senderId, content, createdAt, updatedAt: typeof updatedAt === 'string' ? updatedAt : createdAt, ...(sender && { sender }) }
}

function toCustomer(value: unknown): CustomerSummary | undefined {
  if (!isRecord(value) || typeof value.id !== 'string') return undefined
  return { id: value.id, email: text(value.email), firstName: text(value.firstName), lastName: text(value.lastName), fullName: nullableText(value.fullName), avatarUrl: nullableText(value.avatarUrl) }
}

export function toConversation(value: unknown): Conversation {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.customerId !== 'string') throw new ChatError('server')
  const customer = toCustomer(value.customer)
  return {
    id: value.id,
    customerId: value.customerId,
    ...(customer && { customer }),
    lastMessageAt: nullableText(value.lastMessageAt),
    customerReadAt: nullableText(value.customerReadAt),
    staffReadAt: nullableText(value.staffReadAt),
    hasUnreadMessages: value.hasUnreadMessages === true,
    lastMessage: value.lastMessage ? toMessage(value.lastMessage) : null,
    createdAt: text(value.createdAt),
    updatedAt: text(value.updatedAt),
  }
}

const idPath = (id: string) => `/chat/conversations/${encodeURIComponent(id)}`

/** Feature: Chat – My conversation */
/** GET /chat/my-conversation. A customer's one thread; the server creates it the first time. */
export async function fetchMyConversation({ signal }: RequestOptions = {}) {
  return toConversation(await call('GET', '/chat/my-conversation', undefined, signal))
}

/** Feature: Chat – Inbox */
/** GET /chat/conversations. Staff, admins and superadmins; `search` matches the customer's name or email, `unreadOnly` keeps threads waiting for a reply. */
export async function fetchConversations(params: ConversationParams = {}, { signal }: RequestOptions = {}): Promise<ConversationsPage> {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== false && value !== '') query.set(key, String(value))
  const body = await call('GET', `/chat/conversations?${query}`, undefined, signal)
  if (!isRecord(body) || !Array.isArray(body.data)) throw new ChatError('server')
  const total = isRecord(body.meta) && typeof body.meta.total === 'number' ? body.meta.total : body.data.length
  return { conversations: body.data.map(toConversation), total }
}

/** Feature: Chat – Conversation detail */
/** GET /chat/conversations/:id. */
export async function fetchConversation(id: string, { signal }: RequestOptions = {}) {
  return toConversation(await call('GET', idPath(id), undefined, signal))
}

/** Feature: Chat – Messages */
/** GET /chat/conversations/:id/messages. The newest 50, or the 50 before `before` (an ISO time); the API sends them oldest first. */
export async function fetchMessages(id: string, before?: string, { signal }: RequestOptions = {}): Promise<MessagesPage> {
  const query = new URLSearchParams({ limit: '50', ...(before && { before }) })
  const body = await call('GET', `${idPath(id)}/messages?${query}`, undefined, signal)
  if (!isRecord(body) || !Array.isArray(body.data)) throw new ChatError('server')
  return { messages: body.data.map(toMessage), hasMore: isRecord(body.meta) && body.meta.hasMore === true }
}

/** Feature: Chat – Send message */
/** POST /chat/conversations/:id/messages, for a customer and for staff alike. 2000 characters at most; there is no client id, so a repeat is stored again. */
export async function sendMessage(id: string, content: string, { signal }: RequestOptions = {}) {
  return toMessage(await call('POST', `${idPath(id)}/messages`, { content }, signal))
}

/** Feature: Chat – Mark read */
/** POST /chat/conversations/:id/read. Read state is shared by all staff. */
export async function markConversationRead(id: string, { signal }: RequestOptions = {}) {
  await call('POST', `${idPath(id)}/read`, {}, signal)
  window.dispatchEvent(new Event(CHAT_READ_EVENT))
}
