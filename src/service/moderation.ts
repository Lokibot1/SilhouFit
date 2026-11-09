// Chat offenses and what staff did about them, kept in localStorage so a reload and other tabs agree. The staff dashboards are not wired to the
// API yet, so this stands in for it. Reads are synchronous and mutations return a Promise: swap each function body for its endpoint and nothing else moves.
//   REPLACE recordOffense   -> the server records it itself when it masks a chat message (POST /chat/... needs no separate call)
//   REPLACE listOffenses    -> GET  /moderation/users/:id/offenses
//   REPLACE getModeration   -> GET  /moderation/users/:id
//   REPLACE block / unblock -> POST /moderation/users/:id/block-messaging | /unblock-messaging  { reason? }
//   REPLACE ban / unban     -> POST /moderation/users/:id/ban | /unban                         { reason? }
import { simulateRequest } from './simulateRequest'

export const MODERATION_KEY = 'silhoufit.moderation.v1'

export type ModerationStatus = 'active' | 'messaging_blocked' | 'banned'
export type ModerationAction = 'block_messaging' | 'unblock_messaging' | 'ban' | 'unban'

export interface Offense {
  id: string
  userId: string
  conversationId?: string
  /** The message as it was delivered: the flagged words are already asterisks. */
  excerpt: string
  /** ISO time. */
  createdAt: string
}

export interface ModerationEntry {
  id: string
  userId: string
  action: ModerationAction
  /** Display name of the staff member, admin or superadmin who acted. */
  actor: string
  reason?: string
  /** ISO time. */
  at: string
}

interface State {
  offenses: Offense[]
  /** Newest first. */
  history: ModerationEntry[]
}

const mins = (n: number) => new Date(Date.UTC(2026, 9, 20, 3, 0) + n * 60_000).toISOString()

const SEED: State = {
  offenses: [
    { id: 'off-001', userId: 'cus-002', conversationId: 'conv-seed-1', excerpt: 'where is my order you **** slow', createdAt: mins(0) },
    { id: 'off-002', userId: 'cus-002', conversationId: 'conv-seed-1', excerpt: 'this shop is ****', createdAt: mins(1500) },
    { id: 'off-003', userId: 'cus-005', conversationId: 'conv-seed-2', excerpt: '**** your store, refund me now', createdAt: mins(300) },
    { id: 'off-004', userId: 'cus-005', conversationId: 'conv-seed-2', excerpt: 'are you all ****** or what', createdAt: mins(2900) },
    { id: 'off-005', userId: 'cus-005', conversationId: 'conv-seed-3', excerpt: '* * * * you', createdAt: mins(4400) },
    { id: 'off-006', userId: 'cus-010', excerpt: 'ang ****** ng service niyo', createdAt: mins(5200) },
    { id: 'off-007', userId: 'cus-014', conversationId: 'conv-seed-4', excerpt: 'i will **** you up', createdAt: mins(600) },
    { id: 'off-008', userId: 'cus-014', conversationId: 'conv-seed-4', excerpt: '**** off, give me my money', createdAt: mins(1800) },
    { id: 'off-009', userId: 'cus-014', conversationId: 'conv-seed-4', excerpt: 'you are all a bunch of *******', createdAt: mins(3100) },
    { id: 'off-010', userId: 'cus-014', conversationId: 'conv-seed-5', excerpt: '**** this shop', createdAt: mins(4000) },
  ],
  history: ([
    { id: 'mod-002', userId: 'cus-014', action: 'ban', actor: 'Maria Lopez', reason: 'Threats against staff after repeated warnings.', at: mins(4100) },
    { id: 'mod-001', userId: 'cus-005', action: 'block_messaging', actor: 'Sam Reyes', reason: 'Repeated abusive messages.', at: mins(4500) },
  ] as ModerationEntry[]).sort((a, b) => b.at.localeCompare(a.at)),
}

function load(): State {
  try {
    const parsed = JSON.parse(localStorage.getItem(MODERATION_KEY) ?? 'null') as Partial<State> | null
    if (parsed && Array.isArray(parsed.offenses) && Array.isArray(parsed.history)) return parsed as State
  } catch {
    // Unreadable or blocked storage: start from the sample data.
  }
  return structuredClone(SEED)
}

let state = load()
const listeners = new Set<() => void>()

function commit(next: State) {
  state = next
  try {
    localStorage.setItem(MODERATION_KEY, JSON.stringify(state))
  } catch {
    // The change still holds for this page; it just won't survive a reload.
  }
  listeners.forEach((listener) => listener())
}

/** Calls `listener` after any offense or moderation change. Returns the way to stop. */
export function subscribeModeration(listener: () => void) {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

/** Changes on every commit, so useSyncExternalStore knows to read again. */
export const moderationVersion = () => state

/** Newest first. */
export const listOffenses = (userId: string): Offense[] =>
  state.offenses.filter((offense) => offense.userId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))

export const offenseCount = (userId: string) => state.offenses.filter((offense) => offense.userId === userId).length

/** Every moderation action taken on the user, newest first. */
export const listModerationHistory = (userId: string): ModerationEntry[] => state.history.filter((entry) => entry.userId === userId)

const STATUS_OF: Record<ModerationAction, ModerationStatus> = { block_messaging: 'messaging_blocked', unblock_messaging: 'active', ban: 'banned', unban: 'active' }

/** The status comes from the latest action; a user nobody has acted on is active. */
export function getModerationStatus(userId: string): ModerationStatus {
  const last = state.history.find((entry) => entry.userId === userId)
  return last ? STATUS_OF[last.action] : 'active'
}

/** Counts one offense against a user. `excerpt` must already be masked. */
export function recordOffense(input: { userId: string; conversationId?: string; excerpt: string }): Offense {
  const offense: Offense = { id: `off-${crypto.randomUUID()}`, createdAt: new Date().toISOString(), ...input }
  commit({ ...state, offenses: [...state.offenses, offense] })
  return offense
}

async function act(userId: string, action: ModerationAction, actor: string, reason?: string) {
  await simulateRequest(500, undefined, () => false)
  const entry: ModerationEntry = { id: `mod-${crypto.randomUUID()}`, userId, action, actor, reason: reason?.trim() || undefined, at: new Date().toISOString() }
  commit({ ...state, history: [entry, ...state.history] })
  return entry
}

export const blockMessaging = (userId: string, actor: string, reason?: string) => act(userId, 'block_messaging', actor, reason)
export const unblockMessaging = (userId: string, actor: string, reason?: string) => act(userId, 'unblock_messaging', actor, reason)
export const banUser = (userId: string, actor: string, reason?: string) => act(userId, 'ban', actor, reason)
export const unbanUser = (userId: string, actor: string, reason?: string) => act(userId, 'unban', actor, reason)
