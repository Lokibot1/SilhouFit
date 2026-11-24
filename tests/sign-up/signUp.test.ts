import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const signUp = vi.fn()
vi.mock('../../src/service/supabase', () => ({
  getSupabase: async () => ({ auth: { signUp } }),
}))

const { submitSignUp } = await import('../../src/service/signUp')

const PAYLOAD = {
  firstName: 'Anne',
  middleName: 'Dela Cruz',
  lastName: 'Santos',
  suffix: 'Jr.',
  email: 'anne@example.com',
  password: 'Str0ng!Pass-9',
  consent: true as const,
}

const failure = (error: object) => ({ data: { user: null, session: null }, error })

beforeEach(() => {
  signUp.mockResolvedValue({ data: { user: { identities: [{}] }, session: null }, error: null })
})
afterEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe('submitSignUp', () => {
  it('creates the user and returns ok without a session', async () => {
    expect(await submitSignUp(PAYLOAD)).toEqual({ ok: true })
    expect(signUp).toHaveBeenCalledTimes(1)
  })

  it('sends the email, the password and the profile metadata', async () => {
    await submitSignUp(PAYLOAD)
    expect(signUp).toHaveBeenCalledWith({
      email: 'anne@example.com',
      password: 'Str0ng!Pass-9',
      options: {
        data: {
          first_name: 'Anne',
          middle_name: 'Dela Cruz',
          last_name: 'Santos',
          suffix: 'Jr.',
          full_name: 'Anne Dela Cruz Santos Jr.',
        },
        emailRedirectTo: `${window.location.origin}/login`,
      },
    })
  })

  it('builds the full name from the parts that exist', async () => {
    await submitSignUp({ ...PAYLOAD, middleName: null, suffix: null })
    expect(signUp.mock.calls[0][0].options.data.full_name).toBe('Anne Santos')
  })

  it('treats an obfuscated existing email (empty identities, no error) exactly like success', async () => {
    signUp.mockResolvedValue({ data: { user: { identities: [] }, session: null }, error: null })
    expect(await submitSignUp(PAYLOAD)).toEqual({ ok: true })
  })

  it.each(['user_already_exists', 'email_exists'])('treats %s as success so the email is never revealed', async (code) => {
    signUp.mockResolvedValue(failure({ code, status: 422, message: code }))
    expect(await submitSignUp(PAYLOAD)).toEqual({ ok: true })
  })

  it('classifies weak_password (422) as weak-password', async () => {
    signUp.mockResolvedValue(failure({ code: 'weak_password', status: 422, message: 'Password is known to be weak' }))
    await expect(submitSignUp(PAYLOAD)).rejects.toMatchObject({ kind: 'weak-password' })
  })

  it('does not read a code-less 422 as a weak password', async () => {
    signUp.mockResolvedValue(failure({ status: 422, message: 'Unprocessable' }))
    await expect(submitSignUp(PAYLOAD)).rejects.toMatchObject({ kind: 'server' })
  })

  it.each(['email_address_invalid', 'email_address_not_authorized', 'validation_failed'])(
    'classifies %s as invalid-email',
    async (code) => {
      signUp.mockResolvedValue(failure({ code, status: 400, message: code }))
      await expect(submitSignUp(PAYLOAD)).rejects.toMatchObject({ kind: 'invalid-email' })
    },
  )

  it.each(['signup_disabled', 'email_provider_disabled'])('classifies %s as signup-disabled', async (code) => {
    signUp.mockResolvedValue(failure({ code, status: 422, message: code }))
    await expect(submitSignUp(PAYLOAD)).rejects.toMatchObject({ kind: 'signup-disabled' })
  })

  it('classifies 429 as rate-limit', async () => {
    signUp.mockResolvedValue(failure({ code: 'over_email_send_rate_limit', status: 429, message: 'limit' }))
    await expect(submitSignUp(PAYLOAD)).rejects.toMatchObject({ kind: 'rate-limit' })
  })

  it('classifies a supabase-js fetch failure (status 0) as network', async () => {
    signUp.mockResolvedValue(failure({ status: 0, message: 'fetch failed' }))
    await expect(submitSignUp(PAYLOAD)).rejects.toMatchObject({ kind: 'network' })
  })

  it('classifies a thrown fetch TypeError as network', async () => {
    signUp.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(submitSignUp(PAYLOAD)).rejects.toMatchObject({ kind: 'network' })
  })

  it('classifies anything else as server', async () => {
    signUp.mockResolvedValue(failure({ code: 'unexpected_failure', status: 500, message: 'boom' }))
    await expect(submitSignUp(PAYLOAD)).rejects.toMatchObject({ kind: 'server' })
  })

  it('rejects with the abort reason when aborted while the request settles', async () => {
    const abort = new AbortController()
    signUp.mockImplementation(async () => {
      abort.abort()
      return { data: { user: { identities: [{}] }, session: null }, error: null }
    })
    await expect(submitSignUp(PAYLOAD, { signal: abort.signal })).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('never writes the password to the console or into an error', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => {}),
    )
    const messages: string[] = []
    for (const outcome of [
      failure({ code: 'weak_password', status: 422, message: 'weak' }),
      failure({ status: 429, message: 'limit' }),
      failure({ status: 0, message: 'fetch failed' }),
    ]) {
      signUp.mockResolvedValue(outcome)
      await submitSignUp(PAYLOAD).catch((error: Error) => messages.push(error.message, String(error.stack)))
    }

    const logged = JSON.stringify([...spies.flatMap((spy) => spy.mock.calls), messages])
    expect(messages).toHaveLength(6)
    expect(logged).not.toContain(PAYLOAD.password)
  })
})
