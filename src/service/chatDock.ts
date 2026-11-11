// The chat boxes of the Messenger-style dock: at most MAX_BOXES, one of them open and the rest minimized to heads. Session only, never stored.
import { useSyncExternalStore } from 'react'
import type { HelpCategory, HelpLink } from './helpAnswers'

export interface DockBox {
  /** The conversation id, or 'mine' for the customer's one thread. */
  id: string
  name: string
  avatarUrl?: string
  mode: 'open' | 'min'
}

export interface DockState {
  boxes: DockBox[]
}

export const MAX_BOXES = 4

/** The id of the "KRAL Help" box: a bot with no conversation behind it. */
export const HELP_BOX = 'help'

/** A quick reply under the bot's last message. */
export type HelpChip = { label: string; action: { type: 'ask'; answerId: string } | { type: 'topics' } | { type: 'category'; category: HelpCategory } | { type: 'human' } | { type: 'rephrase' } }
export type HelpMessage = { id: number; from: 'user'; text: string } | { id: number; from: 'bot'; text: string; link?: HelpLink | null; chips?: HelpChip[] }
export interface HelpSession {
  messages: HelpMessage[]
  /** The bot is "typing" its next message. */
  typing: boolean
}

const EMPTY: DockState = { boxes: [] }
let state = EMPTY
const listeners = new Set<() => void>()

function commit(next: DockState) {
  state = next
  listeners.forEach((listener) => listener())
}

const minimized = (boxes: DockBox[]): DockBox[] => boxes.map((box) => (box.mode === 'open' ? { ...box, mode: 'min' } : box))

/** Opens a box (adding it, dropping the oldest head past MAX_BOXES) and minimizes every other one. */
export function openChat(id: string, meta: { name: string; avatarUrl?: string }) {
  const others = minimized(state.boxes.filter((box) => box.id !== id))
  const boxes = [...others, { id, ...meta, mode: 'open' as const }]
  commit({ boxes: boxes.slice(-MAX_BOXES) })
}

export const minimizeAll = () => {
  if (state.boxes.some((box) => box.mode === 'open')) commit({ boxes: minimized(state.boxes) })
}

export function expand(id: string) {
  commit({ boxes: state.boxes.map((box) => (box.id === id ? { ...box, mode: 'open' } : box.mode === 'open' ? { ...box, mode: 'min' } : box)) })
}

export function close(id: string) {
  if (id === HELP_BOX) clearHelp()
  commit({ boxes: state.boxes.filter((box) => box.id !== id) })
}

/** On sign-out. */
export const reset = () => {
  clearHelp()
  if (state.boxes.length) commit(EMPTY)
}

export const getDock = () => state

// The help chat's transcript: in memory only, gone on Close and on sign-out, kept while the box is minimized.
const NO_HELP: HelpSession = { messages: [], typing: false }
let help = NO_HELP
let nextMessageId = 1
let replyTimer: ReturnType<typeof setTimeout> | undefined

function commitHelp(next: HelpSession) {
  help = next
  listeners.forEach((listener) => listener())
}

function clearHelp() {
  clearTimeout(replyTimer)
  if (help !== NO_HELP) commitHelp(NO_HELP)
}

export const getHelpSession = () => help

export const addUserMessage = (text: string) => commitHelp({ ...help, messages: [...help.messages, { id: nextMessageId++, from: 'user', text }] })

/** The bot answers after `delayMs` (it shows as typing meanwhile). Closing the chat before then drops the reply. */
export function replyAfter(delayMs: number, reply: Omit<Extract<HelpMessage, { from: 'bot' }>, 'id' | 'from'>) {
  const send = () => commitHelp({ messages: [...help.messages, { id: nextMessageId++, from: 'bot', ...reply }], typing: false })
  if (delayMs <= 0) return send()
  commitHelp({ ...help, typing: true })
  replyTimer = setTimeout(send, delayMs)
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const useChatDock = () => useSyncExternalStore(subscribe, getDock)
export const useHelpSession = () => useSyncExternalStore(subscribe, getHelpSession)
