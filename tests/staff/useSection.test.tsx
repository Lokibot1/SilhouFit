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
