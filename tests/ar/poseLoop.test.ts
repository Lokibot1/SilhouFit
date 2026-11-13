import { afterEach, describe, expect, it, vi } from 'vitest'
import { startPoseLoop, type Detector } from '../../src/components/ar/poseTracker'
import { RateHealth } from '../../src/utils/arPose'

// Session start: the detector outlives a session, so each session must begin with its mask matching the session's RateHealth, and within a
// session the mask is only ever dropped, never turned back on.

/** A video whose frame callbacks the test fires by hand, and a detector that takes `detectMs` of fake time. */
function rig(mask: boolean) {
  let callback: ((now: number) => void) | null = null
  const video = {
    videoWidth: 640,
    requestVideoFrameCallback: (cb: (now: number) => void) => ((callback = cb), 1),
    cancelVideoFrameCallback: vi.fn(),
  } as unknown as HTMLVideoElement
  const setMask = vi.fn()
  let clock = 0
  vi.spyOn(performance, 'now').mockImplementation(() => clock)
  const health = new RateHealth(false, mask)
  // Each detection takes 25 ms of fake time with the mask on (over 60% of the 33 ms budget) and 2 ms without.
  const detector: Detector = { detect: () => ((clock += health.mask ? 25 : 2), null), close: () => {}, setMask, delegate: 'feed' }
  const stop = startPoseLoop(video, detector, health, () => {}, () => {})
  const tick = (now: number) => {
    clock = now
    callback!(now)
  }
  return { setMask, health, stop, tick }
}

afterEach(() => vi.restoreAllMocks())

describe('startPoseLoop mask', () => {
  it('starts a session with the mask on when its health has it on, and off when a busy drop already happened', () => {
    const on = rig(true)
    expect(on.setMask.mock.calls).toEqual([[true]])
    on.stop()
    const off = rig(false)
    expect(off.setMask.mock.calls).toEqual([[false]])
    off.stop()
  })
  it('drops the mask once when the device gets busy, and never sets it on again in the session', () => {
    const { setMask, health, tick, stop } = rig(true)
    setMask.mockClear()
    for (let t = 0; t < 4000; t += 34) {
      tick(t)
    }
    for (let t = 4000; t < 9000; t += 34) {
      tick(t)
    }
    expect(health.mask).toBe(false)
    expect(setMask.mock.calls.filter(([on]) => on === true)).toEqual([])
    expect(setMask.mock.calls).toEqual([[false]])
    stop()
  })
})
