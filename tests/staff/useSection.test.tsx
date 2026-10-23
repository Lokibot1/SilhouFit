import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useSection } from '../../src/hooks/useSection'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

describe('useSection', () => {
  it('shows loading on the same render a new fetcher arrives, then its data', async () => {
    const first = deferred<string>()
    const second = deferred<string>()
    const a = () => first.promise
    const b = () => second.promise
    const { result, rerender } = renderHook(({ fetcher }) => useSection(fetcher), { initialProps: { fetcher: a } })
    await act(async () => first.resolve('a'))
    expect(result.current.state).toEqual({ status: 'success', data: 'a' })
    rerender({ fetcher: b })
    expect(result.current.state).toEqual({ status: 'loading' })
    await act(async () => second.resolve('b'))
    expect(result.current.state).toEqual({ status: 'success', data: 'b' })
  })

  it('offers the last answer as `previous` while a new fetcher loads, and not for the current one', async () => {
    const first = deferred<string>()
    const second = deferred<string>()
    const a = () => first.promise
    const b = () => second.promise
    const { result, rerender } = renderHook(({ fetcher }) => useSection(fetcher), { initialProps: { fetcher: a } })
    expect(result.current.previous).toBeUndefined()
    await act(async () => first.resolve('a'))
    expect(result.current.previous).toBeUndefined()
    rerender({ fetcher: b })
    expect(result.current.previous).toBe('a')
    await act(async () => second.resolve('b'))
    expect(result.current.previous).toBeUndefined()
  })

  it('has no `previous` when the earlier request failed', async () => {
    const a = () => Promise.reject(Object.assign(new Error('x'), { kind: 'network' }))
    const b = () => new Promise<string>(() => {})
    const { result, rerender } = renderHook(({ fetcher }) => useSection(fetcher), { initialProps: { fetcher: a as () => Promise<string> } })
    await act(async () => {})
    rerender({ fetcher: b })
    expect(result.current.previous).toBeUndefined()
  })

  it('keeps the last good answer as `previous` when the next fetcher fails, and through its retry', async () => {
    let calls = 0
    const a = () => Promise.resolve('a')
    const b = () => (++calls === 1 ? Promise.reject(Object.assign(new Error('x'), { kind: 'network' })) : Promise.resolve('b'))
    const { result, rerender } = renderHook(({ fetcher }) => useSection(fetcher), { initialProps: { fetcher: a } })
    await act(async () => {})
    rerender({ fetcher: b })
    await act(async () => {})
    expect(result.current.state).toEqual({ status: 'error', kind: 'network' })
    expect(result.current.previous).toBe('a')
    await act(async () => result.current.retry())
    expect(result.current.state).toEqual({ status: 'success', data: 'b' })
    expect(result.current.previous).toBeUndefined()
  })

  it('ignores an answer that arrives after its request was replaced', async () => {
    const first = deferred<string>()
    const second = deferred<string>()
    const a = () => first.promise
    const b = () => second.promise
    const { result, rerender } = renderHook(({ fetcher }) => useSection(fetcher), { initialProps: { fetcher: a } })
    rerender({ fetcher: b })
    await act(async () => second.resolve('b'))
    await act(async () => first.resolve('a'))
    expect(result.current.state).toEqual({ status: 'success', data: 'b' })
  })

  it('retries the current fetcher after an error', async () => {
    let calls = 0
    const fetcher = () => (++calls === 1 ? Promise.reject(Object.assign(new Error('x'), { kind: 'network' })) : Promise.resolve('ok'))
    const { result } = renderHook(() => useSection(fetcher))
    await act(async () => {})
    expect(result.current.state).toEqual({ status: 'error', kind: 'network' })
    await act(async () => result.current.retry())
    expect(result.current.state).toEqual({ status: 'success', data: 'ok' })
  })
})
