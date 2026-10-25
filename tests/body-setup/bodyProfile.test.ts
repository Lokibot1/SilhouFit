import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getSession = vi.fn()
vi.mock('../../src/service/supabase', () => ({
  getSupabase: async () => ({ auth: { getSession } }),
}))

const { BodyProfileError, getBodyProfile, saveBodyProfile } = await import('../../src/service/bodyProfile')

const PROFILE = {
  heightCm: 171.3,
  weightKg: 62.5,
  shoulderWidthCm: 40.2,
  chestCm: 91.7,
  bustCm: null,
  torsoLengthCm: null,
  waistCm: 73.4,
  hipsCm: 96.8,
  inseamCm: null,
  outseamCm: null,
  thighCm: null,
  armLengthCm: 58.1,
  bodyModel: 'male' as const,
  bodyBuild: 'lean' as const,
}
const fetchMock = vi.fn()
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

beforeEach(() => {
  getSession.mockResolvedValue({ data: { session: { access_token: 'token-123' } } })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('getBodyProfile', () => {
  it('loads the profile with the Supabase access token as a bearer, and no body or content type', async () => {
    fetchMock.mockResolvedValue(json(PROFILE))
    expect(await getBodyProfile()).toEqual(PROFILE)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toMatch(/\/users\/me\/body-profile$/)
    expect(init.method).toBe('GET')
    expect(init.headers).toEqual({ Authorization: 'Bearer token-123' })
    expect(init.body).toBeUndefined()
  })

  it('returns null when no profile is saved (404)', async () => {
    fetchMock.mockResolvedValue(json({}, 404))
    expect(await getBodyProfile()).toBeNull()
  })

  it('is unauthorized without a session, and sends no request', async () => {
    getSession.mockResolvedValue({ data: { session: null } })
    await expect(getBodyProfile()).rejects.toMatchObject({ kind: 'unauthorized' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('is a server error when the session cannot be read', async () => {
    getSession.mockRejectedValue(new Error('storage blocked'))
    await expect(getBodyProfile()).rejects.toMatchObject({ kind: 'server' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    [400, 'invalid'],
    [401, 'unauthorized'],
    [422, 'invalid'],
    [429, 'rate-limit'],
    [500, 'server'],
    [503, 'server'],
    [403, 'server'],
  ])('maps a %i response to %s', async (status, kind) => {
    fetchMock.mockResolvedValue(json({ message: 'no' }, status))
    const failure = await getBodyProfile().catch((e) => e)
    expect(failure).toBeInstanceOf(BodyProfileError)
    expect(failure.kind).toBe(kind)
  })

  it('maps a network failure to network', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(getBodyProfile()).rejects.toMatchObject({ kind: 'network' })
  })

  it.each([
    ['null', 'null'],
    ['an object without heightCm', JSON.stringify({ chestCm: 90 })],
    ['a string height', JSON.stringify({ heightCm: '170' })],
    ['a non-JSON body', '<html>oops</html>'],
  ])('treats a 200 with %s as a server error', async (_name, body) => {
    fetchMock.mockResolvedValue(new Response(body, { status: 200 }))
    await expect(getBodyProfile()).rejects.toMatchObject({ kind: 'server' })
  })

  it('coerces wrong-typed optional fields to null instead of passing them on', async () => {
    fetchMock.mockResolvedValue(json({ heightCm: 170, chestCm: '90', waistCm: 70, bodyModel: 'robot', bodyBuild: 'giant', extra: 1 }))
    expect(await getBodyProfile()).toEqual({
      heightCm: 170,
      weightKg: null,
      shoulderWidthCm: null,
      chestCm: null,
      bustCm: null,
      torsoLengthCm: null,
      waistCm: 70,
      hipsCm: null,
      inseamCm: null,
      outseamCm: null,
      thighCm: null,
      armLengthCm: null,
      bodyModel: null,
      bodyBuild: null,
    })
  })

  it('gives fetch its own signal, so one consumer aborting cannot cancel the shared request', async () => {
    fetchMock.mockResolvedValue(json(PROFILE))
    const controller = new AbortController()
    await getBodyProfile({ signal: controller.signal })
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal)
    expect(fetchMock.mock.calls[0][1].signal).not.toBe(controller.signal)
  })

  it('shares one request between callers that overlap, and sends a new one once it has settled', async () => {
    fetchMock.mockResolvedValue(json(PROFILE))
    const [a, b, c] = await Promise.all([getBodyProfile(), getBodyProfile(), getBodyProfile({ signal: new AbortController().signal })])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(a).toEqual(PROFILE)
    expect(b).toEqual(PROFILE)
    expect(c).toEqual(PROFILE)
    fetchMock.mockResolvedValue(json({ ...PROFILE, heightCm: 180 }))
    expect((await getBodyProfile())?.heightCm).toBe(180)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('shares a failure too, then lets the next call try again', async () => {
    fetchMock.mockResolvedValueOnce(json({}, 500))
    const results = await Promise.allSettled([getBodyProfile(), getBodyProfile()])
    expect(results.map((r) => r.status)).toEqual(['rejected', 'rejected'])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    fetchMock.mockResolvedValue(json(PROFILE))
    expect(await getBodyProfile()).toEqual(PROFILE)
  })

  it('lets one caller abort without cancelling the request the others are waiting on', async () => {
    let answer: (response: Response) => void = () => {}
    fetchMock.mockReturnValue(new Promise<Response>((resolve) => (answer = resolve)))
    const controller = new AbortController()
    const aborted = getBodyProfile({ signal: controller.signal }).catch((e) => e)
    const other = getBodyProfile()
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
    controller.abort()
    expect((await aborted).name).toBe('AbortError')
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(false)
    answer(json(PROFILE))
    expect(await other).toEqual(PROFILE)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('fails as a network error when the server does not answer within 8 seconds', async () => {
    vi.useFakeTimers()
    try {
      fetchMock.mockImplementation(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))),
      )
      const failure = getBodyProfile().catch((e) => e)
      await vi.advanceTimersByTimeAsync(7999)
      expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(false)
      await vi.advanceTimersByTimeAsync(1)
      expect(await failure).toMatchObject({ kind: 'network' })
      expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('also times out when the session lookup itself hangs', async () => {
    vi.useFakeTimers()
    try {
      getSession.mockReturnValue(new Promise(() => {}))
      const failure = getBodyProfile().catch((e) => e)
      await vi.advanceTimersByTimeAsync(8000)
      expect(await failure).toMatchObject({ kind: 'network' })
      expect(fetchMock).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not start a fetch for a signal that is already aborted, even while another request is pending', async () => {
    let answer: (response: Response) => void = () => {}
    fetchMock.mockReturnValue(new Promise<Response>((resolve) => (answer = resolve)))
    const first = getBodyProfile()
    const controller = new AbortController()
    controller.abort()
    await expect(getBodyProfile({ signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    answer(json(PROFILE))
    await first
  })

  it('rejects with the AbortError itself when aborted mid-request, not a network error', async () => {
    const controller = new AbortController()
    fetchMock.mockImplementation(async () => {
      controller.abort()
      throw new DOMException('Aborted', 'AbortError')
    })
    const failure = await getBodyProfile({ signal: controller.signal }).catch((e) => e)
    expect(failure).not.toBeInstanceOf(BodyProfileError)
    expect(failure.name).toBe('AbortError')
  })

  it('rejects before any request when already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(getBodyProfile({ signal: controller.signal })).rejects.toBeDefined()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('saveBodyProfile', () => {
  it('PUTs the profile as JSON with the bearer token and returns the saved profile', async () => {
    fetchMock.mockResolvedValue(json(PROFILE))
    expect(await saveBodyProfile(PROFILE)).toEqual(PROFILE)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toMatch(/\/users\/me\/body-profile$/)
    expect(init.method).toBe('PUT')
    expect(init.headers).toEqual({ Authorization: 'Bearer token-123', 'Content-Type': 'application/json' })
    expect(JSON.parse(init.body)).toEqual(PROFILE)
  })

  it('sends cleared fields as explicit nulls', async () => {
    fetchMock.mockResolvedValue(json(PROFILE))
    await saveBodyProfile(PROFILE)
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(sent.bustCm).toBeNull()
    expect('inseamCm' in sent).toBe(true)
  })

  it('is unauthorized without a session, and sends no request', async () => {
    getSession.mockResolvedValue({ data: { session: null } })
    await expect(saveBodyProfile(PROFILE)).rejects.toMatchObject({ kind: 'unauthorized' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('treats 404 on save as a server error (only GET maps it to "none saved")', async () => {
    fetchMock.mockResolvedValue(json({}, 404))
    await expect(saveBodyProfile(PROFILE)).rejects.toMatchObject({ kind: 'server' })
  })

  it.each([
    [400, 'invalid'],
    [401, 'unauthorized'],
    [422, 'invalid'],
    [429, 'rate-limit'],
    [500, 'server'],
  ])('maps a %i response to %s', async (status, kind) => {
    fetchMock.mockResolvedValue(json({}, status))
    await expect(saveBodyProfile(PROFILE)).rejects.toMatchObject({ kind })
  })

  it('maps a network failure to network', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(saveBodyProfile(PROFILE)).rejects.toMatchObject({ kind: 'network' })
  })

  it('treats a malformed 200 as a server error', async () => {
    fetchMock.mockResolvedValue(json({ ok: true }))
    await expect(saveBodyProfile(PROFILE)).rejects.toMatchObject({ kind: 'server' })
  })

  it('drops a GET still on the wire, so the next read is not the old profile', async () => {
    let answer: (response: Response) => void = () => {}
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => (answer = resolve)))
    const stale = getBodyProfile()
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    fetchMock.mockImplementation(async () => json({ ...PROFILE, heightCm: 190 }))
    await saveBodyProfile({ ...PROFILE, heightCm: 190 })
    expect((await getBodyProfile())?.heightCm).toBe(190)
    answer(json(PROFILE))
    await stale
  })

  it('passes the AbortSignal to fetch', async () => {
    fetchMock.mockResolvedValue(json(PROFILE))
    const controller = new AbortController()
    await saveBodyProfile(PROFILE, { signal: controller.signal })
    expect(fetchMock.mock.calls[0][1].signal).toBe(controller.signal)
  })
})

describe('privacy', () => {
  it('never writes measurement values to the console, on success or on any failure', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) => vi.spyOn(console, level).mockImplementation(() => {}))
    const outcomes: Array<() => Promise<unknown>> = [
      async () => {
        fetchMock.mockResolvedValue(json(PROFILE))
        return saveBodyProfile(PROFILE)
      },
      async () => {
        fetchMock.mockResolvedValue(json(PROFILE, 500))
        return saveBodyProfile(PROFILE)
      },
      async () => {
        fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
        return saveBodyProfile(PROFILE)
      },
      async () => {
        fetchMock.mockResolvedValue(new Response('{"heightCm":171.3,"chestCm":"91.7"', { status: 200 }))
        return getBodyProfile()
      },
      async () => {
        fetchMock.mockResolvedValue(json(PROFILE))
        return getBodyProfile()
      },
    ]
    for (const outcome of outcomes) await outcome().catch(() => {})
    const printed = spies.flatMap((spy) => spy.mock.calls).map((args) => args.map(String).join(' ')).join('\n')
    for (const value of ['171.3', '62.5', '40.2', '91.7', '73.4', '96.8', '58.1']) expect(printed).not.toContain(value)
  })

  it('keeps measurements out of the error it throws', async () => {
    fetchMock.mockResolvedValue(json(PROFILE, 500))
    const failure = await saveBodyProfile(PROFILE).catch((e) => e)
    expect(`${failure.message} ${failure.stack}`).not.toContain('171.3')
  })
})

