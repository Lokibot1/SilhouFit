import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCamera } from '../../src/hooks/useCamera'

const track = () => ({ stop: vi.fn() })
const streamOf = (tracks: ReturnType<typeof track>[]) => ({ getTracks: () => tracks }) as unknown as MediaStream
const getUserMedia = vi.fn()

function hideTab() {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
  document.dispatchEvent(new Event('visibilitychange'))
}

beforeEach(() => {
  getUserMedia.mockReset()
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } })
})
afterEach(() => {
  Reflect.deleteProperty(document, 'hidden')
})

describe('useCamera', () => {
  it('stays idle until start is called, then asks for the front camera without audio', async () => {
    const tracks = [track()]
    getUserMedia.mockResolvedValue(streamOf(tracks))
    const { result } = renderHook(() => useCamera())
    expect(result.current.state).toBe('idle')
    expect(getUserMedia).not.toHaveBeenCalled()
    await act(() => result.current.start())
    expect(getUserMedia).toHaveBeenCalledWith({ video: { facingMode: 'user' }, audio: false })
    expect(result.current.state).toBe('live')
  })

  it.each([
    ['NotAllowedError', 'denied'],
    ['SecurityError', 'denied'],
    ['NotFoundError', 'no-camera'],
    ['OverconstrainedError', 'no-camera'],
    ['NotReadableError', 'in-use'],
    ['AbortError', 'in-use'],
    ['TypeError', 'error'],
  ])('maps %s to %s', async (name, expected) => {
    getUserMedia.mockRejectedValue(new DOMException('x', name))
    const { result } = renderHook(() => useCamera())
    await act(() => result.current.start())
    expect(result.current.state).toBe(expected)
  })

  it('is unsupported without mediaDevices (an insecure page)', async () => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined })
    const { result } = renderHook(() => useCamera())
    await act(() => result.current.start())
    expect(result.current.state).toBe('unsupported')
  })

  it('stops every track when turned off and on unmount', async () => {
    const tracks = [track(), track()]
    getUserMedia.mockResolvedValue(streamOf(tracks))
    const { result, unmount } = renderHook(() => useCamera())
    await act(() => result.current.start())
    act(() => result.current.stop())
    expect(tracks.every((t) => t.stop.mock.calls.length === 1)).toBe(true)
    expect(result.current.state).toBe('idle')

    const second = [track()]
    getUserMedia.mockResolvedValue(streamOf(second))
    await act(() => result.current.start())
    unmount()
    expect(second[0].stop).toHaveBeenCalledTimes(1)
  })

  it('stops the tracks and pauses when the tab is hidden', async () => {
    const tracks = [track()]
    getUserMedia.mockResolvedValue(streamOf(tracks))
    const { result } = renderHook(() => useCamera())
    await act(() => result.current.start())
    act(hideTab)
    expect(tracks[0].stop).toHaveBeenCalledTimes(1)
    expect(result.current.state).toBe('paused')
  })

  it('does not go live when the tab was hidden while the permission prompt was open', async () => {
    let resolve!: (s: MediaStream) => void
    getUserMedia.mockReturnValue(new Promise<MediaStream>((r) => (resolve = r)))
    const tracks = [track()]
    const { result } = renderHook(() => useCamera())
    let started!: Promise<void>
    act(() => {
      started = result.current.start()
    })
    act(hideTab)
    await act(async () => {
      resolve(streamOf(tracks))
      await started
    })
    expect(tracks[0].stop).toHaveBeenCalledTimes(1)
    expect(result.current.state).toBe('paused')
  })

  it('stops a stream that arrives after unmount', async () => {
    let resolve!: (s: MediaStream) => void
    getUserMedia.mockReturnValue(new Promise<MediaStream>((r) => (resolve = r)))
    const { result, unmount } = renderHook(() => useCamera())
    let started!: Promise<void>
    act(() => {
      started = result.current.start()
    })
    unmount()
    const tracks = [track()]
    await act(async () => {
      resolve(streamOf(tracks))
      await started
    })
    expect(tracks[0].stop).toHaveBeenCalledTimes(1)
  })
})
