import { useSyncExternalStore } from 'react'

// The tour's position, mirrored to sessionStorage so a reload mid-tour resumes it. `exited` is the "not again in this
// tab" flag: closing the tour does not save anything, so the next sign-in is offered it again.
const KEY = 'silhoufit-tour'

export type TourPhase = 'welcome' | 'step' | 'address' | 'done' | null

interface TourState {
  phase: TourPhase
  step: number
  stop: number
  exited: boolean
}

const IDLE: TourState = { phase: null, step: 0, stop: 0, exited: false }

function load(): TourState {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as Partial<TourState> | null
    if (!parsed) return IDLE
    const phase = parsed.phase === 'welcome' || parsed.phase === 'step' || parsed.phase === 'address' || parsed.phase === 'done'
        ? parsed.phase
        : null
    const index = (n: unknown) => (typeof n === 'number' && Number.isInteger(n) && n >= 0 ? n : 0)
    return { phase, step: index(parsed.step), stop: index(parsed.stop), exited: parsed.exited === true }
  } catch {
    return IDLE
  }
}

let state = load()
const listeners = new Set<() => void>()

function commit(next: TourState) {
  state = next
  try {
    if (next === IDLE) sessionStorage.removeItem(KEY)
    else sessionStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Storage blocked: the tour then lives in memory for this tab.
  }
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Opens the tour on its welcome card, or straight on the first stop (a replay). */
function startTour({ skipWelcome = false }: { skipWelcome?: boolean } = {}) {
  commit({ ...state, phase: skipWelcome ? 'step' : 'welcome', step: 0, stop: 0 })
}

/** Moves forward one stop. `counts` is how many stops each step has. The welcome card moves to the first stop. */
function next(counts: number[]) {
  if (state.phase === 'welcome') return commit({ ...state, phase: 'step', step: 0, stop: 0 })
  if (state.phase !== 'step') return
  if (state.stop + 1 < (counts[state.step] ?? 0)) return commit({ ...state, stop: state.stop + 1 })
  if (state.step + 1 < counts.length) commit({ ...state, step: state.step + 1, stop: 0 })
}

function back(counts: number[]) {
  if (state.phase !== 'step') return
  if (state.stop > 0) return commit({ ...state, stop: state.stop - 1 })
  if (state.step > 0) commit({ ...state, step: state.step - 1, stop: Math.max(0, (counts[state.step - 1] ?? 1) - 1) })
}

/** Jumps to another stop of the current step (the cart stop, once a piece has been added). */
function setStop(stop: number) {
  if (state.phase === 'step' && state.stop !== stop) commit({ ...state, stop })
}

/** The last stop was finished: the optional address step comes before the completion card. */
function askAddress() {
  if (state.phase === 'step') commit({ ...state, phase: 'address' })
}

/** Finish was saved (or the address step ended); the completion card is next. Ignored once the tour was closed. */
function finishTour() {
  if (state.phase === 'step' || state.phase === 'address') commit({ ...state, phase: 'done' })
}

/** Closes the tour for this tab: X and Escape save nothing; after Skip or Finish it closes the completion card. */
function exitTour() {
  commit({ phase: null, step: 0, stop: 0, exited: true })
}

/** Forgets the tour, including the exited flag: the next sign-in is offered it again. */
export function resetTour() {
  commit(IDLE)
}

export function useOnboarding() {
  const current = useSyncExternalStore(subscribe, () => state)
  return { ...current, startTour, next, back, setStop, askAddress, finishTour, exitTour, endTour: exitTour }
}
