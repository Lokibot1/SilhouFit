import { useEffect, useRef } from 'react'

export const POLL_MS = 20_000
/** After each failed read the wait doubles, up to this, so an outage does not spend the API's request budget. */
export const MAX_POLL_MS = 120_000
const JITTER = 0.1

interface LivePollOptions {
  /** The wait between reads; ±10% so tabs do not hit the API in step. */
  intervalMs?: number
  /** False reads nothing, e.g. before there is anything to keep fresh. */
  enabled?: boolean
  /** True once the data can no longer change: polling stops for good. */
  done?: boolean
}

/**
 * Calls `refresh` every `intervalMs` while the tab is visible and online, never two at once. Coming back to the tab (or the network)
 * reads once straight away. A rejected `refresh` doubles the wait (up to MAX_POLL_MS); a resolved one resets it. `refresh` gets an
 * AbortSignal that fires on unmount.
 * shortcut: polling; replace with a realtime channel when the backend broadcasts order changes
 */
export function useLivePoll(refresh: (signal: AbortSignal) => Promise<unknown>, { intervalMs = POLL_MS, enabled = true, done = false }: LivePollOptions = {}) {
  const latest = useRef(refresh)
  useEffect(() => {
    latest.current = refresh
  })

  useEffect(() => {
    if (!enabled || done) return
    const abort = new AbortController()
    let timer: number | undefined
    let failures = 0
    let running = false
    const canRun = () => !document.hidden && navigator.onLine

    const schedule = () => {
      const wait = Math.min(intervalMs * 2 ** failures, MAX_POLL_MS)
      timer = window.setTimeout(run, wait * (1 - JITTER + 2 * JITTER * Math.random()))
    }
    async function run() {
      window.clearTimeout(timer)
      // Hidden or offline: stay quiet; the listeners below start it again.
      if (running || !canRun()) return
      running = true
      try {
        await latest.current(abort.signal)
        failures = 0
      } catch {
        if (abort.signal.aborted) return
        failures += 1
      } finally {
        running = false
      }
      if (!abort.signal.aborted) schedule()
    }
    const resume = () => {
      if (canRun()) void run()
    }

    document.addEventListener('visibilitychange', resume)
    window.addEventListener('online', resume)
    schedule()
    return () => {
      abort.abort()
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', resume)
      window.removeEventListener('online', resume)
    }
  }, [enabled, done, intervalMs])
}
