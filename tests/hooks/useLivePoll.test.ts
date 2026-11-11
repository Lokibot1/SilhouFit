import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_POLL_MS, POLL_MS, useLivePoll } from '../../src/hooks/useLivePoll'

let hidden = false
let online = true
const setHidden = (value: boolean) => {
  hidden = value
  document.dispatchEvent(new Event('visibilitychange'))
}

beforeEach(() => {
  hidden = false
  online = true
  vi.useFakeTimers()
  // Jitter factor 1.0 with a 0.5 draw, so the waits are exact.
  vi.spyOn(Math, 'random').mockReturnValue(0.5)
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden)
  vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online)
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('useLivePoll', () => {
  it('reads every interval, not before', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined)
    renderHook(() => useLivePoll(refresh))
    await vi.advanceTimersByTimeAsync(POLL_MS - 1)
    expect(refresh).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(refresh).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(POLL_MS)
    expect(refresh).toHaveBeenCalledTimes(2)
  })

  it('reads nothing while the tab is hidden or offline, then once straight away on return', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined)
    renderHook(() => useLivePoll(refresh))
    setHidden(true)
    await vi.advanceTimersByTimeAsync(POLL_MS * 5)
    expect(refresh).not.toHaveBeenCalled()
    setHidden(false)
    await vi.advanceTimersByTimeAsync(0)
    expect(refresh).toHaveBeenCalledTimes(1)

    online = false
    await vi.advanceTimersByTimeAsync(POLL_MS * 3)
    expect(refresh).toHaveBeenCalledTimes(1)
    online = true
    window.dispatchEvent(new Event('online'))
    await vi.advanceTimersByTimeAsync(0)
    expect(refresh).toHaveBeenCalledTimes(2)
  })

  it('never overlaps: a tick that finds a read in flight is skipped', async () => {
    let finish!: () => void
    const refresh = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)))
    renderHook(() => useLivePoll(refresh))
    await vi.advanceTimersByTimeAsync(POLL_MS)
    expect(refresh).toHaveBeenCalledTimes(1)
    // Coming back to the tab asks again, but the first read is still out.
    setHidden(true)
    setHidden(false)
    await vi.advanceTimersByTimeAsync(POLL_MS * 3)
    expect(refresh).toHaveBeenCalledTimes(1)
    finish()
    await vi.advanceTimersByTimeAsync(POLL_MS)
    expect(refresh).toHaveBeenCalledTimes(2)
  })

  it('doubles the wait after each failure, up to the cap, and resets on success', async () => {
    const refresh = vi.fn().mockRejectedValue(new Error('down'))
    renderHook(() => useLivePoll(refresh))
    await vi.advanceTimersByTimeAsync(POLL_MS)
    expect(refresh).toHaveBeenCalledTimes(1)
    // Next wait is 40s.
    await vi.advanceTimersByTimeAsync(POLL_MS * 2 - 1)
    expect(refresh).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(refresh).toHaveBeenCalledTimes(2)
    // Then 80s, then capped at 120s.
    await vi.advanceTimersByTimeAsync(POLL_MS * 4)
    expect(refresh).toHaveBeenCalledTimes(3)
    await vi.advanceTimersByTimeAsync(MAX_POLL_MS - 1)
    expect(refresh).toHaveBeenCalledTimes(3)
    await vi.advanceTimersByTimeAsync(1)
    expect(refresh).toHaveBeenCalledTimes(4)
    await vi.advanceTimersByTimeAsync(MAX_POLL_MS)
    expect(refresh).toHaveBeenCalledTimes(5)

    refresh.mockResolvedValue(undefined)
    await vi.advanceTimersByTimeAsync(MAX_POLL_MS)
    expect(refresh).toHaveBeenCalledTimes(6)
    await vi.advanceTimersByTimeAsync(POLL_MS)
    expect(refresh).toHaveBeenCalledTimes(7)
  })

  it('stops for good once the data is final, and when disabled', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined)
    const { rerender } = renderHook(({ done }) => useLivePoll(refresh, { done }), { initialProps: { done: false } })
    await vi.advanceTimersByTimeAsync(POLL_MS)
    expect(refresh).toHaveBeenCalledTimes(1)
    rerender({ done: true })
    await vi.advanceTimersByTimeAsync(POLL_MS * 5)
    setHidden(true)
    setHidden(false)
    await vi.advanceTimersByTimeAsync(POLL_MS)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('aborts the read in flight and stops on unmount', async () => {
    let signal!: AbortSignal
    const refresh = vi.fn((s: AbortSignal) => {
      signal = s
      return new Promise<void>(() => {})
    })
    const { unmount } = renderHook(() => useLivePoll(refresh))
    await vi.advanceTimersByTimeAsync(POLL_MS)
    expect(signal.aborted).toBe(false)
    unmount()
    expect(signal.aborted).toBe(true)
    await vi.advanceTimersByTimeAsync(POLL_MS * 5)
    expect(refresh).toHaveBeenCalledTimes(1)
  })
})
