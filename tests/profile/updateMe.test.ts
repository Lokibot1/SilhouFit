import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getSession = vi.fn()
vi.mock('../../src/service/supabase', () => ({
  getSupabase: async () => ({ auth: { getSession } }),
}))

const { UpdateMeError, updateMe } = await import('../../src/service/updateMe')

const ME = {
  id: 'user-1',
  email: 'anne@example.com',
  firstName: 'Anne',
  middleName: null,
  lastName: 'Reyes',
  suffix: null,
  fullName: 'Anne Reyes',
  avatarUrl: null,
  birthday: '1995-05-15',
  gender: 'female',
  createdAt: '2026-01-15T08:30:00.000Z',
  updatedAt: '2026-02-01T08:30:00.000Z',
}
const fetchMock = vi.fn()
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

beforeEach(() => {
  getSession.mockResolvedValue({ data: { session: { access_token: 'token-123' } } })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('updateMe', () => {
  it('PATCHes only the passed fields as JSON with the bearer token, and returns the saved profile', async () => {
    fetchMock.mockResolvedValue(json(ME))
    expect(await updateMe({ lastName: 'Reyes' })).toEqual(ME)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toMatch(/\/users\/me$/)
    expect(init.method).toBe('PATCH')
    expect(init.headers).toEqual({ Authorization: 'Bearer token-123', 'Content-Type': 'application/json' })
    expect(JSON.parse(init.body)).toEqual({ lastName: 'Reyes' })
  })

  it('sends a cleared field as an explicit null', async () => {
    fetchMock.mockResolvedValue(json(ME))
    await updateMe({ suffix: null, birthday: null })
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ suffix: null, birthday: null })
  })

  it('is unauthorized without a session, and sends no request', async () => {
    getSession.mockResolvedValue({ data: { session: null } })
    await expect(updateMe({ lastName: 'Reyes' })).rejects.toMatchObject({ kind: 'unauthorized' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('is a server error when the session cannot be read', async () => {
    getSession.mockRejectedValue(new Error('storage blocked'))
    await expect(updateMe({ lastName: 'Reyes' })).rejects.toMatchObject({ kind: 'server' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    [400, 'invalid'],
    [401, 'unauthorized'],
    [404, 'not-found'],
    [422, 'invalid'],
    [429, 'rate-limit'],
    [500, 'server'],
    [403, 'server'],
  ])('maps a %i response to %s', async (status, kind) => {
    fetchMock.mockResolvedValue(json({}, status))
    const failure = await updateMe({ lastName: 'Reyes' }).catch((e) => e)
    expect(failure).toBeInstanceOf(UpdateMeError)
    expect(failure.kind).toBe(kind)
  })

  it('carries the server message on an invalid response, joining a list of them', async () => {
    fetchMock.mockResolvedValue(json({ message: ['birthday must be a valid ISO 8601 date string', 'gender is invalid'] }, 400))
    await expect(updateMe({ birthday: 'x' })).rejects.toMatchObject({
      kind: 'invalid',
      detail: 'birthday must be a valid ISO 8601 date string; gender is invalid',
    })
    fetchMock.mockResolvedValue(json({ message: 'avatarUrl is not yours' }, 400))
    await expect(updateMe({ avatarUrl: 'x' })).rejects.toMatchObject({ detail: 'avatarUrl is not yours' })
  })

  it('has no detail when an invalid response is not JSON', async () => {
    fetchMock.mockResolvedValue(new Response('<html>', { status: 400 }))
    await expect(updateMe({ lastName: 'Reyes' })).rejects.toMatchObject({ kind: 'invalid', detail: undefined })
  })

  it('maps a fetch TypeError to network', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(updateMe({ lastName: 'Reyes' })).rejects.toMatchObject({ kind: 'network' })
  })

  it.each([
    ['null', 'null'],
    ['a body missing the name', JSON.stringify({ id: ME.id, email: ME.email })],
    ['a non-JSON body', '<html>oops</html>'],
  ])('maps a 200 with %s to server', async (_label, body) => {
    fetchMock.mockResolvedValue(new Response(body, { status: 200 }))
    await expect(updateMe({ lastName: 'Reyes' })).rejects.toMatchObject({ kind: 'server' })
  })

  it('rejects with the AbortError, not a typed error, when aborted', async () => {
    const controller = new AbortController()
    fetchMock.mockImplementation(
      (_url: string, { signal }: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason))),
    )
    const request = updateMe({ lastName: 'Reyes' }, { signal: controller.signal })
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
    controller.abort()
    await expect(request).rejects.toMatchObject({ name: 'AbortError' })
  })
})
