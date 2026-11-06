import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  activateAccountApi,
  countAccounts,
  deactivateAccountApi,
  inviteAdminAccountApi,
  inviteStaffAccountApi,
  inviteSuperadminAccountApi,
  listAdminAccounts,
  listCustomerAccounts,
  listStaffAccounts,
  listSuperadminAccounts,
  StaffApiError,
  subscribeAccountChanges,
} from '../../src/service/staffApi'
import { errorKind } from '../../src/components/staff/StaffSection'

vi.mock('../../src/service/supabase', () => ({
  getSupabase: async () => ({ auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }) } }),
}))

const fetchMock = vi.fn()
const reply = (body: unknown, status = 200) => fetchMock.mockResolvedValue(new Response(JSON.stringify(body), { status }))
const requested = () => new URL(String(fetchMock.mock.calls[0][0]), 'http://api.test')
const sent = () => JSON.parse(fetchMock.mock.calls[0][1].body)

// A UserResponseDto.
const ITEM = { id: 'u1', firstName: 'Sam', lastName: 'Reyes', fullName: 'Sam Reyes', email: 'sam.reyes@example.com', role: 'staff', isActive: true, createdAt: '2026-03-01T08:00:00.000Z' }
const META = { total: 0, page: 1, limit: 10, totalPages: 1, hasNextPage: false, hasPreviousPage: false }

beforeEach(() => vi.stubGlobal('fetch', fetchMock))
afterEach(() => {
  fetchMock.mockReset()
  vi.unstubAllGlobals()
})

const failure = async (call: Promise<unknown>) => {
  const error = await call.catch((e: unknown) => e)
  expect(error).toBeInstanceOf(StaffApiError)
  return error as StaffApiError
}

describe('listing accounts from GET /users', () => {
  it('sends role, search, sortBy, sortOrder and paging with the bearer token, and maps the accounts', async () => {
    reply({ data: [ITEM], meta: { ...META, total: 11, page: 2, totalPages: 2 } })
    const result = await listStaffAccounts({ search: ' sam ', sort: 'createdAt', dir: 'desc', page: 2, limit: 10 })
    const url = requested()
    expect(url.pathname).toBe('/users')
    expect(Object.fromEntries(url.searchParams)).toEqual({ role: 'staff', search: 'sam', sortBy: 'createdAt', sortOrder: 'desc', page: '2', limit: '10' })
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({ Authorization: 'Bearer tok' })
    expect(result.meta).toEqual({ total: 11, page: 2, limit: 10, totalPages: 2 })
    expect(result.data[0]).toMatchObject({ id: 'u1', firstName: 'Sam', lastName: 'Reyes', email: 'sam.reyes@example.com', role: 'staff', status: 'active', username: 'sam.reyes', createdAt: ITEM.createdAt })
  })

  it.each([
    [listCustomerAccounts, 'customer'],
    [listStaffAccounts, 'staff'],
    [listAdminAccounts, 'admin'],
    [listSuperadminAccounts, 'superadmin'],
  ] as const)('asks for the %s role', async (list, role) => {
    reply({ data: [{ ...ITEM, role }], meta: META })
    const result = await list({})
    expect(requested().searchParams.get('role')).toBe(role)
    expect(result.data[0].role).toBe(role)
  })

  it('sorts by fullName unless it is the date, and leaves out an empty search', async () => {
    reply({ data: [], meta: META })
    await listStaffAccounts({ search: '  ', sort: 'status' })
    expect(Object.fromEntries(requested().searchParams)).toEqual({ role: 'staff', sortBy: 'fullName', sortOrder: 'asc', page: '1', limit: '10' })
  })

  it.each([
    ['active', 'true'],
    ['inactive', 'false'],
    [undefined, null],
  ] as const)('sends status %s as isActive=%s (no status is all)', async (status, isActive) => {
    reply({ data: [], meta: META })
    await listStaffAccounts({ status })
    expect(requested().searchParams.get('isActive')).toBe(isActive)
  })

  it('maps isActive to Active / Inactive, and a missing flag to active', async () => {
    reply({ data: [{ ...ITEM, isActive: false }, { ...ITEM, id: 'u2' }, { ...ITEM, id: 'u3', isActive: undefined }], meta: META })
    const [off, on, bare] = (await listStaffAccounts({})).data
    expect(off.status).toBe('inactive')
    expect(on.status).toBe('active')
    expect(bare.status).toBe('active')
  })

  it('gives a superadmin row only active or inactive', async () => {
    reply({ data: [{ ...ITEM, role: 'superadmin', isActive: false }], meta: META })
    expect((await listSuperadminAccounts({})).data[0].status).toBe('inactive')
  })

  it('rejects a body that is not a list', async () => {
    reply({ data: [{ id: 'u1' }], meta: { total: 1 } })
    expect((await failure(listStaffAccounts({}))).kind).toBe('server')
    reply({ nope: true })
    expect((await failure(listStaffAccounts({}))).kind).toBe('server')
  })

  it.each([
    [401, 'forbidden'],
    [403, 'forbidden'],
    [429, 'rate-limit'],
    [500, 'server'],
    [503, 'server'],
  ])('maps a %i answer to %s, readable by errorKind', async (status, kind) => {
    reply({ message: 'no' }, status)
    const error = await failure(listStaffAccounts({}))
    expect(error).toMatchObject({ kind, status })
    expect(errorKind(error)).toBe(kind)
  })

  it('reports a dropped connection as network', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    expect((await failure(listStaffAccounts({}))).kind).toBe('network')
  })
})

describe('listing customers', () => {
  it('sends the same params as the other roles and maps the profile, without orders or spend', async () => {
    reply({ data: [{ ...ITEM, role: 'customer', isActive: false }], meta: { ...META, total: 25, page: 3, totalPages: 3 } })
    const result = await listCustomerAccounts({ search: ' kim ', status: 'inactive', sort: 'createdAt', dir: 'desc', page: 3, limit: 10 })
    expect(Object.fromEntries(requested().searchParams)).toEqual({ role: 'customer', search: 'kim', isActive: 'false', sortBy: 'createdAt', sortOrder: 'desc', page: '3', limit: '10' })
    expect(result.meta).toEqual({ total: 25, page: 3, limit: 10, totalPages: 3 })
    expect(result.data[0]).toMatchObject({ id: 'u1', role: 'customer', status: 'inactive', email: ITEM.email, createdAt: ITEM.createdAt })
    expect(result.data[0]).not.toHaveProperty('orderCount')
    expect(result.data[0]).not.toHaveProperty('lifetimeSpend')
  })
})

describe('counting accounts with limit=1', () => {
  const totals = (byQuery: Record<string, number>) =>
    fetchMock.mockImplementation((url: string) => {
      const q = new URL(url, 'http://api.test').searchParams
      return Promise.resolve(new Response(JSON.stringify({ data: [], meta: { ...META, total: byQuery[`${q.get('role')}:${q.get('isActive')}`] ?? 0 } }), { status: 200 }))
    })

  it('reads meta.total of one row per role and active flag', async () => {
    totals({ 'customer:true': 120, 'customer:false': 7 })
    expect(await Promise.all([countAccounts('customer', true), countAccounts('customer', false)])).toEqual([120, 7])
    expect(fetchMock.mock.calls.map(([url]) => Object.fromEntries(new URL(String(url), 'http://api.test').searchParams))).toEqual([
      expect.objectContaining({ role: 'customer', isActive: 'true', limit: '1' }),
      expect.objectContaining({ role: 'customer', isActive: 'false', limit: '1' }),
    ])
  })

  it('shares one request between identical calls in flight, and asks again once it has settled', async () => {
    totals({ 'staff:true': 4 })
    await Promise.all([countAccounts('staff', true), countAccounts('staff', true)])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await countAccounts('staff', true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not keep a failure: the next call asks again', async () => {
    reply({}, 500)
    expect((await failure(countAccounts('admin', true))).kind).toBe('server')
    totals({ 'admin:true': 3 })
    expect(await countAccounts('admin', true)).toBe(3)
  })

  it('tells subscribers after an invite, a deactivate and an activate succeed, not after one fails, and stops when unsubscribed', async () => {
    const listener = vi.fn()
    const stop = subscribeAccountChanges(listener)
    reply({ user: ITEM, invited: true, message: 'ok' }, 201)
    await inviteStaffAccountApi({ email: 'a@b.co', firstName: 'A', lastName: 'B' })
    reply({ ...ITEM })
    await deactivateAccountApi('u1')
    reply({ ...ITEM })
    await activateAccountApi('u1')
    expect(listener).toHaveBeenCalledTimes(3)
    reply({}, 403)
    await failure(deactivateAccountApi('u1'))
    expect(listener).toHaveBeenCalledTimes(3)
    stop()
    reply({ ...ITEM })
    await deactivateAccountApi('u1')
    expect(listener).toHaveBeenCalledTimes(3)
  })

  it('does not hand a count that was in flight before a change to a call made after it', async () => {
    let staff = 4
    fetchMock.mockImplementation((url: string) => {
      const body = String(url).includes('/deactivate') ? ITEM : { data: [], meta: { ...META, total: staff } }
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))
    })
    const before = countAccounts('staff', true)
    await deactivateAccountApi('u1')
    staff = 3
    expect(await countAccounts('staff', true)).toBe(3)
    expect(await before).toBe(4)
  })
})

describe('inviting accounts with POST /users/staff/invite', () => {
  const input = { email: 'sam.reyes@example.com', firstName: 'Sam', lastName: 'Reyes' }

  it.each([
    [inviteStaffAccountApi, 'staff'],
    [inviteAdminAccountApi, 'admin'],
    [inviteSuperadminAccountApi, 'superadmin'],
  ] as const)('posts the names, email, the %s role and the callback redirect, and never a password', async (invite, role) => {
    reply({ user: { ...ITEM, role }, invited: true, message: `Invitation sent to ${input.email}` }, 201)
    const result = await invite(input)
    expect(requested().pathname).toBe('/users/staff/invite')
    expect(fetchMock.mock.calls[0][1].method).toBe('POST')
    expect(sent()).toEqual({ ...input, role, redirectTo: `${window.location.origin}/auth/callback` })
    expect(sent()).not.toHaveProperty('password')
    expect(Object.keys(sent())).toEqual(['email', 'firstName', 'lastName', 'role', 'redirectTo'])
    expect(result.account).toMatchObject({ id: 'u1', role, status: 'active' })
    expect(result.message).toBe(`Invitation sent to ${input.email}`)
  })

  it('sends the optional fields when given, trimmed, with the email lowercased and the birthday as YYYY-MM-DD', async () => {
    reply({ user: ITEM, invited: true, message: 'ok' }, 201)
    await inviteStaffAccountApi({ email: ' Sam.Reyes@Example.com ', firstName: ' Sam ', middleName: ' de la ', lastName: ' Reyes ', suffix: ' Jr. ', birthday: '1998-04-23', gender: 'other' })
    expect(sent()).toEqual({
      email: 'sam.reyes@example.com',
      firstName: 'Sam',
      middleName: 'de la',
      lastName: 'Reyes',
      suffix: 'Jr.',
      birthday: '1998-04-23',
      gender: 'other',
      role: 'staff',
      redirectTo: `${window.location.origin}/auth/callback`,
    })
    expect(sent().birthday).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it.each(['male', 'female', 'other', 'unisex'] as const)('sends gender %s', async (gender) => {
    reply({ user: ITEM, invited: true, message: 'ok' }, 201)
    await inviteStaffAccountApi({ ...input, gender })
    expect(sent().gender).toBe(gender)
  })

  it('leaves out an empty or blank optional field instead of sending an empty string or null', async () => {
    reply({ user: ITEM, invited: true, message: 'ok' }, 201)
    await inviteStaffAccountApi({ ...input, middleName: '  ', suffix: '', birthday: '', gender: undefined })
    const body = sent()
    for (const key of ['middleName', 'suffix', 'birthday', 'gender']) expect(body).not.toHaveProperty(key)
  })

  it('never sends a key the backend DTO does not declare, even if the caller passes one', async () => {
    reply({ user: ITEM, invited: true, message: 'ok' }, 201)
    await inviteStaffAccountApi({ ...input, password: 'Secret123!', fullName: 'Sam Reyes', role: 'superadmin', isActive: true } as never)
    const DECLARED = ['email', 'firstName', 'middleName', 'lastName', 'suffix', 'birthday', 'gender', 'role', 'redirectTo', 'password']
    for (const key of Object.keys(sent())) expect(DECLARED).toContain(key)
    expect(sent()).not.toHaveProperty('password')
    expect(sent().role).toBe('staff')
  })

  it('maps the names the server sends to the account, keeping the middle name and suffix when there are any', async () => {
    reply({ data: [{ ...ITEM, middleName: 'Lee', suffix: 'III' }, { ...ITEM, id: 'u2', middleName: null, suffix: null }], meta: META })
    const [full, bare] = (await listStaffAccounts({})).data
    expect(full).toMatchObject({ middleName: 'Lee', suffix: 'III' })
    expect(bare).not.toHaveProperty('middleName')
    expect(bare).not.toHaveProperty('suffix')
  })

  it('carries the server message on a 400, whether it is a string or a list', async () => {
    reply({ message: ['email must be an email', 'lastName should not be empty'] }, 400)
    expect(await failure(inviteStaffAccountApi(input))).toMatchObject({ kind: 'validation', status: 400, detail: 'email must be an email; lastName should not be empty' })
    reply({ message: 'Bad names' }, 400)
    expect((await failure(inviteStaffAccountApi(input))).detail).toBe('Bad names')
  })

  it.each([
    [409, 'conflict'],
    [403, 'forbidden'],
    [429, 'rate-limit'],
    [502, 'server'],
    [503, 'server'],
  ])('maps a %i answer to %s', async (status, kind) => {
    reply({}, status)
    expect(await failure(inviteStaffAccountApi(input))).toMatchObject({ kind, status })
  })

  it('rejects an answer without the confirmation or the user', async () => {
    reply({ user: ITEM }, 201)
    expect((await failure(inviteStaffAccountApi(input))).kind).toBe('server')
    reply({ message: 'ok', user: { id: 'x' } }, 201)
    expect((await failure(inviteStaffAccountApi(input))).kind).toBe('server')
  })
})

describe('deactivating and activating', () => {
  it.each([
    [deactivateAccountApi, 'deactivate'],
    [activateAccountApi, 'activate'],
  ] as const)('posts to /users/:id/%s with no body and returns the id', async (call, action) => {
    reply({ ...ITEM, isActive: action === 'activate' })
    expect(await call('a b')).toEqual({ id: 'u1' })
    expect(requested().pathname).toBe(`/users/a%20b/${action}`)
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST', body: undefined })
  })

  it.each([
    [401, 'forbidden'],
    [403, 'forbidden'],
    [404, 'not-found'],
    [429, 'rate-limit'],
    [500, 'server'],
  ])('maps a %i answer to %s and keeps the server message', async (status, kind) => {
    reply({ message: 'You cannot deactivate your own account' }, status)
    expect(await failure(deactivateAccountApi('u1'))).toMatchObject({ kind, status, detail: 'You cannot deactivate your own account' })
  })

  it('rejects an answer without an id', async () => {
    reply({})
    expect((await failure(activateAccountApi('u1'))).kind).toBe('server')
  })
})
