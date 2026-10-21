import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const KEY = 'silhoufit-tour'

// The tour state is module-level and read from sessionStorage when the module loads, so each test loads a fresh copy.
async function freshHook(stored?: unknown) {
  sessionStorage.clear()
  if (stored !== undefined) sessionStorage.setItem(KEY, typeof stored === 'string' ? stored : JSON.stringify(stored))
  vi.resetModules()
  const module = await import('../../src/hooks/useOnboarding')
  return { ...renderHook(() => module.useOnboarding()), module }
}

beforeEach(() => sessionStorage.clear())

describe('useOnboarding restore', () => {
  it.each(['welcome', 'step', 'address', 'body', 'done'])('accepts the %s phase from a reload', async (phase) => {
    const { result } = await freshHook({ phase, step: 1, stop: 2, exited: false })
    expect(result.current.phase).toBe(phase)
    expect(result.current.step).toBe(1)
    expect(result.current.stop).toBe(2)
  })

  it.each([
    ['an unknown phase', { phase: 'banana', step: 3 }],
    ['a numeric phase', { phase: 3 }],
    ['an empty object', {}],
    ['null', 'null'],
    ['corrupt JSON', '{nope'],
  ])('falls back to idle for %s', async (_name, stored) => {
    const { result } = await freshHook(stored)
    expect(result.current.phase).toBeNull()
  })

  it('floors bad step and stop values to 0 and keeps exited only when true', async () => {
    const { result } = await freshHook({ phase: 'step', step: -1, stop: 1.5, exited: 'yes' })
    expect(result.current).toMatchObject({ phase: 'step', step: 0, stop: 0, exited: false })
  })
})

describe('useOnboarding transitions', () => {
  it('moves to body from the last stop (step) and from the address step', async () => {
    const fromStep = await freshHook({ phase: 'step', step: 4, stop: 0 })
    act(() => fromStep.result.current.askBody())
    expect(fromStep.result.current.phase).toBe('body')

    const fromAddress = await freshHook({ phase: 'address' })
    act(() => fromAddress.result.current.askBody())
    expect(fromAddress.result.current.phase).toBe('body')
    expect(JSON.parse(sessionStorage.getItem(KEY)!).phase).toBe('body')
  })

  it.each(['welcome', 'done'])('ignores askBody while on %s', async (phase) => {
    const { result } = await freshHook({ phase })
    act(() => result.current.askBody())
    expect(result.current.phase).toBe(phase)
  })

  it('ignores askBody when idle', async () => {
    const { result } = await freshHook()
    act(() => result.current.askBody())
    expect(result.current.phase).toBeNull()
  })

  it('finishTour accepts body and moves to done', async () => {
    const { result } = await freshHook({ phase: 'body' })
    act(() => result.current.finishTour())
    expect(result.current.phase).toBe('done')
  })

  it.each(['step', 'address'])('finishTour still moves %s to done', async (phase) => {
    const { result } = await freshHook({ phase })
    act(() => result.current.finishTour())
    expect(result.current.phase).toBe('done')
  })

  it('finishTour is ignored after the tour was closed', async () => {
    const { result } = await freshHook({ phase: 'body' })
    act(() => result.current.exitTour())
    act(() => result.current.finishTour())
    expect(result.current.phase).toBeNull()
    expect(result.current.exited).toBe(true)
  })

  it('askAddress still only works from a step', async () => {
    const step = await freshHook({ phase: 'step' })
    act(() => step.result.current.askAddress())
    expect(step.result.current.phase).toBe('address')
    const welcome = await freshHook({ phase: 'welcome' })
    act(() => welcome.result.current.askAddress())
    expect(welcome.result.current.phase).toBe('welcome')
  })

  it('walks welcome, stops, address, body, done in order', async () => {
    const { result } = await freshHook()
    act(() => result.current.startTour())
    expect(result.current.phase).toBe('welcome')
    act(() => result.current.next([2, 1]))
    expect(result.current).toMatchObject({ phase: 'step', step: 0, stop: 0 })
    act(() => result.current.next([2, 1]))
    expect(result.current).toMatchObject({ step: 0, stop: 1 })
    act(() => result.current.next([2, 1]))
    expect(result.current).toMatchObject({ step: 1, stop: 0 })
    act(() => result.current.askAddress())
    expect(result.current.phase).toBe('address')
    act(() => result.current.askBody())
    expect(result.current.phase).toBe('body')
    act(() => result.current.finishTour())
    expect(result.current.phase).toBe('done')
  })

  it('startTour with skipWelcome opens on the first stop, and back stays inside the steps', async () => {
    const { result } = await freshHook()
    act(() => result.current.startTour({ skipWelcome: true }))
    expect(result.current).toMatchObject({ phase: 'step', step: 0, stop: 0 })
    act(() => result.current.back([2, 1]))
    expect(result.current).toMatchObject({ step: 0, stop: 0 })
  })

  it('resetTour forgets everything, including the exited flag, and clears storage', async () => {
    const { result, module } = await freshHook({ phase: 'body', exited: true })
    act(() => module.resetTour())
    expect(result.current).toMatchObject({ phase: null, exited: false })
    expect(sessionStorage.getItem(KEY)).toBeNull()
  })

  it('never stores anything in localStorage', async () => {
    localStorage.clear()
    const { result } = await freshHook({ phase: 'address' })
    act(() => result.current.askBody())
    expect(localStorage.length).toBe(0)
  })
})
