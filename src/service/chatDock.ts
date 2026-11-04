// The chat boxes of the Messenger-style dock: at most MAX_BOXES, one of them open and the rest minimized to heads. Session only, never stored.
import { useSyncExternalStore } from 'react'

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

export const close = (id: string) => commit({ boxes: state.boxes.filter((box) => box.id !== id) })

/** On sign-out. */
export const reset = () => {
  if (state.boxes.length) commit(EMPTY)
}

export const getDock = () => state

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const useChatDock = () => useSyncExternalStore(subscribe, getDock)
