import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getSession = vi.fn()
vi.mock('../../src/service/supabase', () => ({
  getSupabase: async () => ({ auth: { getSession } }),
}))

const { fetchMe } = await import('../../src/service/fetchMe')

const ME = {
  id: 'user-1',
  email: 'anne@example.com',
  firstName: 'Anne',
  middleName: null,
  lastName: 'Santos',
  suffix: null,
  fullName: 'Anne Santos',
  avatarUrl: null,
  createdAt: '2026-01-15T08:30:00.000Z',
  updatedAt: '2026-01-15T08:30:00.000Z',
}
const fetchMock = vi.fn()

beforeEach(() => {
  getSession.mockResolvedValue({ data: { session: { access_token: 'token-123' } } })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('fetchMe', () => {
  it('loads the profile with the Supabase access token as a bearer', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(ME), { status: 200 }))
    expect(await fetchMe()).toEqual(ME)
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/users\/me$/)
    expect(fetchMock.mock.calls[0][1].headers).toEqual({ Authorization: 'Bearer token-123' })
  })

  it('is unauthorized without a session, and sends no request', async () => {
    getSession.mockResolvedValue({ data: { session: null } })
    await expect(fetchMe()).rejects.toMatchObject({ kind: 'unauthorized' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    [401, 'unauthorized'],
    [404, 'not-found'],
    [429, 'rate-limit'],
    [500, 'server'],
  ])('maps a %i response to %s', async (status, kind) => {
    fetchMock.mockResolvedValue(new Response('{}', { status }))
    await expect(fetchMe()).rejects.toMatchObject({ kind })
  })

  it.each([
    ['null', 'null'],
    ['a body missing the name', JSON.stringify({ id: ME.id, email: ME.email })],
    ['a non-JSON body', '<html>oops</html>'],
  ])('maps a 200 with %s to server', async (_label, body) => {
    fetchMock.mockResolvedValue(new Response(body, { status: 200 }))
    await expect(fetchMe()).rejects.toMatchObject({ kind: 'server' })
  })

  it('maps a fetch TypeError to network', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(fetchMe()).rejects.toMatchObject({ kind: 'network' })
  })

  it('rejects with the AbortError, not a typed error, when aborted', async () => {
    const controller = new AbortController()
    fetchMock.mockImplementation(
      (_url: string, { signal }: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason))),
    )
    const request = fetchMe({ signal: controller.signal })
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
    controller.abort()
    await expect(request).rejects.toMatchObject({ name: 'AbortError' })
  })
})
