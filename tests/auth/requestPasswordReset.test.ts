import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { requestPasswordReset } from '../../src/service/requestPasswordReset'

const fetchMock = vi.fn()
beforeEach(() => vi.stubGlobal('fetch', fetchMock))
afterEach(() => {
  fetchMock.mockReset()
  vi.unstubAllGlobals()
})

describe('requestPasswordReset', () => {
  it('POSTs the email to Supabase /auth/v1/recover with the anon key and the callback as redirect, without PKCE', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }))
    await expect(requestPasswordReset({ email: 'sam@example.com' })).resolves.toEqual({ ok: true })
    const [url, init] = fetchMock.mock.calls[0]
    const parsed = new URL(String(url))
    expect(parsed.pathname).toBe('/auth/v1/recover')
    expect(parsed.searchParams.get('redirect_to')).toBe(`${window.location.origin}/auth/callback`)
    expect(init.method).toBe('POST')
    expect(init.headers).toHaveProperty('apikey')
    expect(JSON.parse(init.body)).toEqual({ email: 'sam@example.com' })
  })

  it.each([
    [429, 'rate-limit'],
    [400, 'server'],
    [500, 'server'],
  ])('maps a %i answer to %s', async (status, kind) => {
    fetchMock.mockResolvedValue(new Response('{}', { status }))
    await expect(requestPasswordReset({ email: 'a@b.co' })).rejects.toMatchObject({ kind })
  })

  it('maps a dropped connection to network, and rethrows an abort', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await expect(requestPasswordReset({ email: 'a@b.co' })).rejects.toMatchObject({ kind: 'network' })
    const abort = new AbortController()
    abort.abort()
    fetchMock.mockRejectedValueOnce(new DOMException('Aborted', 'AbortError'))
    await expect(requestPasswordReset({ email: 'a@b.co' }, { signal: abort.signal })).rejects.toMatchObject({ name: 'AbortError' })
  })
})
