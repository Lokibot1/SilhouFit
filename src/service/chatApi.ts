import { SIMULATED_AUTH } from '../config/accountPolicy'
import { ProductListError, request, type ProductListErrorKind } from './fetchProductList'
import { getSession } from './session'
import type { RequestOptions } from './simulateRequest'

export type ChatRole = 'customer' | 'staff' | 'admin' | 'superadmin'

/** The one name a customer sees for every staff, admin and superadmin sender. */
export const CHAT_BRAND_NAME = 'KRAL'

/** What a customer (or another staff member) sees next to a sender's name; a customer has no label. */
export const ROLE_LABEL: Record<ChatRole, string> = {
  customer: '',
  staff: 'Staff',
  admin: 'Admin',
  superadmin: 'Superadmin',
}

export interface ChatHolder {
  id: string
  name: string
  role: ChatRole
}

export interface ChatMessage {
  id: string
  conversationId: string
  senderId: string
  senderName: string
  senderRole: ChatRole
  body: string
  clientId: string
  createdAt: string
}

export interface ConversationSummary {
  id: string
  orderNo: string | null // TESTING: orderless chat, remove once orders exist (null = general chat)
  customer: { id: string; name: string; avatarUrl?: string }
  lastMessage: string | null
  lastMessageAt: string | null
  unreadCount: number
  holder: ChatHolder | null
}

/** The caller's own rights are worked out by the server; the client only mirrors them. */
export interface ConversationDetail extends ConversationSummary {
  canSend: boolean
  canTakeOver: boolean
  canRelease: boolean
}

export interface MessagesPage {
  /** Oldest first, ready to render (the API sends newest first). */
  messages: ChatMessage[]
  hasMore: boolean
  nextCursor: string | null
}

export interface ConversationParams {
  page?: number
  limit?: number
  mine?: boolean
  takenOver?: boolean
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

export function toHolder(value: unknown): ChatHolder | null {
  return isRecord(value) && typeof value.id === 'string' && typeof value.name === 'string' && isRole(value.role) ? { id: value.id, name: value.name, role: value.role } : null
}

export function toMessage(value: unknown): ChatMessage {
  if (!isRecord(value)) throw new ChatError('server')
  const { id, conversationId, senderId, senderName, senderRole, body, clientId, createdAt } = value
  if (typeof id !== 'string' || typeof conversationId !== 'string' || typeof senderId !== 'string' || typeof body !== 'string') throw new ChatError('server')
  if (typeof createdAt !== 'string' || Number.isNaN(Date.parse(createdAt)) || !isRole(senderRole)) throw new ChatError('server')
  return {
    id,
    conversationId,
    senderId,
    senderName: typeof senderName === 'string' ? senderName : '',
    senderRole,
    body,
    clientId: typeof clientId === 'string' ? clientId : id,
    createdAt,
  }
}

/** The API sends firstName and lastName; a `name` is used when it is all there is. */
function customerName(customer: Record<string, unknown>) {
  const full = [customer.firstName, customer.lastName].filter((part) => typeof part === 'string' && part).join(' ')
  return full || (typeof customer.name === 'string' ? customer.name : '')
}

export function toSummary(value: unknown): ConversationSummary {
  if (!isRecord(value) || typeof value.id !== 'string') throw new ChatError('server')
  const customer = isRecord(value.customer) ? value.customer : {}
  const last = value.lastMessage
  return {
    id: value.id,
    orderNo: typeof value.orderNo === 'string' ? value.orderNo : null, // TESTING: orderless chat, remove once orders exist
    customer: {
      id: typeof customer.id === 'string' ? customer.id : '',
      name: customerName(customer),
      ...(typeof customer.avatarUrl === 'string' && {
        avatarUrl: customer.avatarUrl,
      }),
    },
    lastMessage: typeof last === 'string' ? last : isRecord(last) && typeof last.body === 'string' ? last.body : null,
    lastMessageAt: typeof value.lastMessageAt === 'string' ? value.lastMessageAt : null,
    unreadCount: typeof value.unreadCount === 'number' && Number.isFinite(value.unreadCount) ? value.unreadCount : 0,
    holder: toHolder(value.holder),
  }
}

function toDetail(value: unknown): ConversationDetail {
  const summary = toSummary(value)
  const rights = value as Record<string, unknown>
  return {
    ...summary,
    canSend: rights.canSend === true,
    canTakeOver: rights.canTakeOver === true,
    canRelease: rights.canRelease === true,
  }
}

const idPath = (id: string) => `/conversations/${encodeURIComponent(id)}`

/** Feature: Chat – Open conversation */
/** POST /conversations. Gets or creates the thread for an order number (201 created, 200 existing); asking twice returns the same thread. Customers send only `orderNo`. */
export async function openConversation(orderNo?: string, { signal }: RequestOptions = {}) {
  // TESTING: orderless chat, remove once orders exist (make orderNo required again)
  return toSummary(await call('POST', '/conversations', orderNo ? { orderNo } : {}, signal)) // TESTING: orderless chat, remove once orders exist
}

/** Feature: Chat – Inbox */
/** GET /conversations. Staff, admins and superadmins; every thread unless `mine` or `takenOver` narrows it. */
export async function fetchConversations(params: ConversationParams = {}, { signal }: RequestOptions = {}) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== false) query.set(key, String(value))
  const body = await call('GET', `/conversations?${query}`, undefined, signal)
  if (!isRecord(body) || !Array.isArray(body.data)) throw new ChatError('server')
  return body.data.map(toSummary)
}

/** Feature: Chat – My conversations */
/** GET /conversations/me. A customer's own threads, with how many messages they have not read. */
export async function fetchMyConversations({ signal }: RequestOptions = {}) {
  const body = await call('GET', '/conversations/me', undefined, signal)
  const list = Array.isArray(body) ? body : isRecord(body) ? body.data : undefined
  if (!Array.isArray(list)) throw new ChatError('server')
  return list.map(toSummary)
}

/** Feature: Chat – Conversation detail */
/** GET /conversations/:id. Includes who holds the thread and what the caller may do with it. */
export async function fetchConversation(id: string, { signal }: RequestOptions = {}) {
  return toDetail(await call('GET', idPath(id), undefined, signal))
}

/** Feature: Chat – Messages */
/** GET /conversations/:id/messages. 30 at a time, ending before `before` when given. */
export async function fetchMessages(id: string, before?: string, { signal }: RequestOptions = {}): Promise<MessagesPage> {
  const query = new URLSearchParams({ limit: '30', ...(before && { before }) })
  const body = await call('GET', `${idPath(id)}/messages?${query}`, undefined, signal)
  if (!isRecord(body) || !Array.isArray(body.data)) throw new ChatError('server')
  const meta = isRecord(body.meta) ? body.meta : {}
  return {
    messages: body.data.map(toMessage).reverse(),
    hasMore: meta.hasMore === true,
    nextCursor: typeof meta.nextCursor === 'string' ? meta.nextCursor : null,
  }
}

/** Feature: Chat – Send message */
/** POST /conversations/:id/messages. Sending the same `clientId` twice stores one message. A 403 means the sender may no longer reply. */
export async function sendMessage(id: string, body: string, clientId: string, { signal }: RequestOptions = {}) {
  return toMessage(await call('POST', `${idPath(id)}/messages`, { body, clientId }, signal))
}

/** Feature: Chat – Take over */
/** POST /conversations/:id/takeover. */
export async function takeOverConversation(id: string, { signal }: RequestOptions = {}) {
  await call('POST', `${idPath(id)}/takeover`, {}, signal)
}

/** Feature: Chat – Release */
/** POST /conversations/:id/release. Hands the thread back to the shared pool. */
export async function releaseConversation(id: string, { signal }: RequestOptions = {}) {
  await call('POST', `${idPath(id)}/release`, {}, signal)
}

/** Feature: Chat – Mark read */
/** POST /conversations/:id/read. */
export async function markConversationRead(id: string, { signal }: RequestOptions = {}) {
  await call('POST', `${idPath(id)}/read`, {}, signal)
}
