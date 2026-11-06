import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { archiveAdminAccountApi, archiveStaffAccountApi, createAdminAccountApi, createStaffAccountApi, createSuperadminAccountApi, listAdminAccounts, listStaffAccounts, listSuperadminAccounts, resetAdminPasswordApi, resetStaffPasswordApi, restoreAdminAccountApi, restoreStaffAccountApi, StaffApiError } from '../../src/service/staffApi'
import { errorKind } from '../../src/components/staff/StaffSection'

vi.mock('../../src/service/supabase', () => ({
  getSupabase: async () => ({ auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }) } }),
}))

const fetchMock = vi.fn()
const reply = (body: unknown, status = 200) => fetchMock.mockResolvedValue(new Response(JSON.stringify(body), { status }))
const requested = () => new URL(String(fetchMock.mock.calls[0][0]), 'http://api.test')

const ITEM = { id: 'u1', firstName: 'Sam', lastName: 'Reyes', fullName: 'Sam Reyes', email: 'sam.reyes@silhoufit.dev', role: 'staff', createdAt: '2026-03-01T08:00:00.000Z' }
const CREDENTIALS = { email: 'sam.reyes@silhoufit.dev', password: 'Xk9#mQ2!', mustChangePassword: true }

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

describe('listStaffAccounts', () => {
  it('sends search, sort, direction and paging with the bearer token, and maps the accounts', async () => {
    reply({ data: [ITEM], meta: { total: 11, page: 2, limit: 10, totalPages: 2 } })
    const result = await listStaffAccounts({ search: ' sam ', sort: 'createdAt', dir: 'desc', page: 2, limit: 10 })
    const url = requested()
    expect(url.pathname).toBe('/users/staff')
    expect(Object.fromEntries(url.searchParams)).toEqual({ search: 'sam', sort: 'createdAt', dir: 'desc', page: '2', limit: '10', status: 'all' })
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({ Authorization: 'Bearer tok' })
    expect(result.meta).toEqual({ total: 11, page: 2, limit: 10, totalPages: 2 })
    expect(result.data[0]).toMatchObject({ id: 'u1', firstName: 'Sam', lastName: 'Reyes', email: 'sam.reyes@silhoufit.dev', role: 'staff', createdAt: ITEM.createdAt })
  })

  it('falls back to name for a sort the server does not have, and leaves out an empty search', async () => {
    reply({ data: [], meta: { total: 0, page: 1, limit: 10, totalPages: 0 } })
    await listStaffAccounts({ search: '  ', sort: 'status' })
    expect(Object.fromEntries(requested().searchParams)).toEqual({ sort: 'name', dir: 'asc', page: '1', limit: '10', status: 'all' })
  })

  it.each([
    ['active', 'active'],
    ['archived', 'archived'],
    [undefined, 'all'],
  ] as const)('sends status %s as %s (no status is All)', async (status, sent) => {
    reply({ data: [], meta: { total: 0, page: 1, limit: 10, totalPages: 0 } })
    await listStaffAccounts({ status })
    expect(requested().searchParams.get('status')).toBe(sent)
  })

  it('reads status and archivedAt from the server, and treats a missing status as active', async () => {
    reply({
      data: [{ ...ITEM, status: 'archived', archivedAt: '2026-04-01T08:00:00.000Z' }, { ...ITEM, id: 'u2', status: 'active', archivedAt: null }, { ...ITEM, id: 'u3' }],
      meta: { total: 3, page: 1, limit: 10, totalPages: 1 },
    })
    const [archived, active, bare] = (await listStaffAccounts({ status: 'archived' })).data
    expect(archived).toMatchObject({ status: 'archived', archivedAt: '2026-04-01T08:00:00.000Z' })
    expect(active.status).toBe('active')
    expect(active.archivedAt).toBeUndefined()
    expect(bare.status).toBe('active')
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

describe('createStaffAccountApi', () => {
  it('posts the names and returns the account with its credentials', async () => {
    reply({ account: ITEM, credentials: CREDENTIALS }, 201)
    const result = await createStaffAccountApi({ firstName: 'Sam', lastName: 'Reyes' })
    expect(requested().pathname).toBe('/users/staff')
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST', body: JSON.stringify({ firstName: 'Sam', lastName: 'Reyes' }) })
    expect(result.account).toMatchObject({ id: 'u1', email: 'sam.reyes@silhoufit.dev' })
    expect(result.credentials).toMatchObject(CREDENTIALS)
  })

  it('carries the server message on a 400, whether it is a string or a list', async () => {
    reply({ message: ['firstName must contain letters only', 'lastName is too long'] }, 400)
    expect(await failure(createStaffAccountApi({ firstName: 'x', lastName: 'y' }))).toMatchObject({
      kind: 'validation',
      status: 400,
      detail: 'firstName must contain letters only; lastName is too long',
    })
    reply({ message: 'Bad names' }, 400)
    expect((await failure(createStaffAccountApi({ firstName: 'x', lastName: 'y' }))).detail).toBe('Bad names')
  })

  it.each([
    [409, 'conflict'],
    [403, 'forbidden'],
    [429, 'rate-limit'],
    [502, 'server'],
    [503, 'server'],
  ])('maps a %i answer to %s', async (status, kind) => {
    reply({}, status)
    expect(await failure(createStaffAccountApi({ firstName: 'Sam', lastName: 'Reyes' }))).toMatchObject({ kind, status })
  })

  it('rejects a created answer without credentials', async () => {
    reply({ account: ITEM }, 201)
    expect((await failure(createStaffAccountApi({ firstName: 'Sam', lastName: 'Reyes' }))).kind).toBe('server')
  })
})

describe('listAdminAccounts', () => {
  const ADMIN_ITEM = { ...ITEM, id: 'a1', firstName: 'Ivy', lastName: 'Lim', fullName: 'Ivy Lim', email: 'ivy.lim@silhoufit.dev', role: 'admin' }

  it('sends search, sort, direction, paging and status, and maps the admins', async () => {
    reply({ data: [ADMIN_ITEM], meta: { total: 11, page: 2, limit: 10, totalPages: 2 } })
    const result = await listAdminAccounts({ search: ' ivy ', status: 'active', sort: 'createdAt', dir: 'desc', page: 2, limit: 10 })
    const url = requested()
    expect(url.pathname).toBe('/users/admins')
    expect(Object.fromEntries(url.searchParams)).toEqual({ search: 'ivy', sort: 'createdAt', dir: 'desc', page: '2', limit: '10', status: 'active' })
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({ Authorization: 'Bearer tok' })
    expect(result.meta).toEqual({ total: 11, page: 2, limit: 10, totalPages: 2 })
    expect(result.data[0]).toMatchObject({ id: 'a1', firstName: 'Ivy', email: 'ivy.lim@silhoufit.dev', role: 'admin', username: 'ivy.lim', status: 'active' })
  })

  it('falls back to name for a sort the server does not have', async () => {
    reply({ data: [], meta: { total: 0, page: 1, limit: 10, totalPages: 0 } })
    await listAdminAccounts({ search: '  ', sort: 'status' })
    expect(Object.fromEntries(requested().searchParams)).toEqual({ sort: 'name', dir: 'asc', page: '1', limit: '10', status: 'all' })
  })

  it.each([
    ['active', 'active'],
    ['archived', 'archived'],
    [undefined, 'all'],
  ] as const)('sends status %s as %s (no status is All)', async (status, sent) => {
    reply({ data: [], meta: { total: 0, page: 1, limit: 10, totalPages: 0 } })
    await listAdminAccounts({ status })
    expect(requested().searchParams.get('status')).toBe(sent)
  })

  it('reads status and archivedAt from the server', async () => {
    reply({ data: [{ ...ADMIN_ITEM, status: 'archived', archivedAt: '2026-04-01T08:00:00.000Z' }], meta: { total: 1, page: 1, limit: 10, totalPages: 1 } })
    expect((await listAdminAccounts({ status: 'archived' })).data[0]).toMatchObject({ status: 'archived', archivedAt: '2026-04-01T08:00:00.000Z' })
  })

  it('rejects a body that is not a list', async () => {
    reply({ data: [{ id: 'a1' }], meta: { total: 1 } })
    expect((await failure(listAdminAccounts({}))).kind).toBe('server')
  })

  it.each([
    [401, 'forbidden'],
    [403, 'forbidden'],
    [429, 'rate-limit'],
    [500, 'server'],
    [503, 'server'],
  ])('maps a %i answer to %s, readable by errorKind', async (status, kind) => {
    reply({ message: 'no' }, status)
    const error = await failure(listAdminAccounts({}))
    expect(error).toMatchObject({ kind, status })
    expect(errorKind(error)).toBe(kind)
  })

  it('reports a dropped connection as network', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    expect((await failure(listAdminAccounts({}))).kind).toBe('network')
  })
})

describe('createAdminAccountApi', () => {
  it('posts the names to /users/admins and returns the admin with its credentials', async () => {
    reply({ account: { ...ITEM, role: 'admin' }, credentials: CREDENTIALS }, 201)
    const result = await createAdminAccountApi({ firstName: 'Sam', lastName: 'Reyes' })
    expect(requested().pathname).toBe('/users/admins')
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST', body: JSON.stringify({ firstName: 'Sam', lastName: 'Reyes' }) })
    expect(result.account).toMatchObject({ id: 'u1', role: 'admin' })
    expect(result.credentials).toMatchObject(CREDENTIALS)
  })

  it('carries the server message on a 400', async () => {
    reply({ message: ['firstName must contain letters only'] }, 400)
    expect(await failure(createAdminAccountApi({ firstName: 'x', lastName: 'y' }))).toMatchObject({ kind: 'validation', status: 400, detail: 'firstName must contain letters only' })
  })

  it.each([
    [409, 'conflict'],
    [403, 'forbidden'],
    [429, 'rate-limit'],
    [502, 'server'],
    [503, 'server'],
  ])('maps a %i answer to %s', async (status, kind) => {
    reply({}, status)
    expect(await failure(createAdminAccountApi({ firstName: 'Sam', lastName: 'Reyes' }))).toMatchObject({ kind, status })
  })

  it('rejects a created answer without credentials', async () => {
    reply({ account: ITEM }, 201)
    expect((await failure(createAdminAccountApi({ firstName: 'Sam', lastName: 'Reyes' }))).kind).toBe('server')
  })
})

describe('listSuperadminAccounts', () => {
  const SUPER_ITEM = { ...ITEM, id: 's1', firstName: 'Ivy', lastName: 'Lim', fullName: 'Ivy Lim', email: 'ivy.lim@silhoufit.dev', role: 'superadmin' }

  it('sends search, sort, direction and paging but no status, and maps the superadmins as active', async () => {
    reply({ data: [SUPER_ITEM], meta: { total: 11, page: 2, limit: 10, totalPages: 2 } })
    const result = await listSuperadminAccounts({ search: ' ivy ', status: 'active', sort: 'createdAt', dir: 'desc', page: 2, limit: 10 })
    const url = requested()
    expect(url.pathname).toBe('/users/superadmins')
    expect(Object.fromEntries(url.searchParams)).toEqual({ search: 'ivy', sort: 'createdAt', dir: 'desc', page: '2', limit: '10' })
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({ Authorization: 'Bearer tok' })
    expect(result.meta).toEqual({ total: 11, page: 2, limit: 10, totalPages: 2 })
    expect(result.data[0]).toMatchObject({ id: 's1', firstName: 'Ivy', email: 'ivy.lim@silhoufit.dev', role: 'superadmin', username: 'ivy.lim', status: 'active' })
  })

  it('falls back to name for a sort the server does not have', async () => {
    reply({ data: [], meta: { total: 0, page: 1, limit: 10, totalPages: 0 } })
    await listSuperadminAccounts({ search: '  ', sort: 'status' })
    expect(Object.fromEntries(requested().searchParams)).toEqual({ sort: 'name', dir: 'asc', page: '1', limit: '10' })
  })

  it('rejects a body that is not a list', async () => {
    reply({ data: [{ id: 's1' }], meta: { total: 1 } })
    expect((await failure(listSuperadminAccounts({}))).kind).toBe('server')
  })

  it.each([
    [401, 'forbidden'],
    [403, 'forbidden'],
    [429, 'rate-limit'],
    [500, 'server'],
    [503, 'server'],
  ])('maps a %i answer to %s, readable by errorKind', async (status, kind) => {
    reply({ message: 'no' }, status)
    const error = await failure(listSuperadminAccounts({}))
    expect(error).toMatchObject({ kind, status })
    expect(errorKind(error)).toBe(kind)
  })

  it('reports a dropped connection as network', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    expect((await failure(listSuperadminAccounts({}))).kind).toBe('network')
  })
})

describe('createSuperadminAccountApi', () => {
  it('posts the names to /users/superadmins and returns the superadmin with its credentials', async () => {
    reply({ account: { ...ITEM, role: 'superadmin' }, credentials: CREDENTIALS }, 201)
    const result = await createSuperadminAccountApi({ firstName: 'Sam', lastName: 'Reyes' })
    expect(requested().pathname).toBe('/users/superadmins')
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST', body: JSON.stringify({ firstName: 'Sam', lastName: 'Reyes' }) })
    expect(result.account).toMatchObject({ id: 'u1', role: 'superadmin' })
    expect(result.credentials).toMatchObject(CREDENTIALS)
  })

  it('carries the server message on a 400', async () => {
    reply({ message: ['firstName must contain letters only'] }, 400)
    expect(await failure(createSuperadminAccountApi({ firstName: 'x', lastName: 'y' }))).toMatchObject({ kind: 'validation', status: 400, detail: 'firstName must contain letters only' })
  })

  it.each([
    [409, 'conflict'],
    [403, 'forbidden'],
    [429, 'rate-limit'],
    [502, 'server'],
    [503, 'server'],
  ])('maps a %i answer to %s', async (status, kind) => {
    reply({}, status)
    expect(await failure(createSuperadminAccountApi({ firstName: 'Sam', lastName: 'Reyes' }))).toMatchObject({ kind, status })
  })

  it('rejects a created answer without credentials', async () => {
    reply({ account: ITEM }, 201)
    expect((await failure(createSuperadminAccountApi({ firstName: 'Sam', lastName: 'Reyes' }))).kind).toBe('server')
  })
})

describe('resetStaffPasswordApi', () => {
  it('posts to the staff reset path with no body and returns the id', async () => {
    reply({ id: 'u1', mustChangePassword: true, sessionsRevoked: true })
    expect(await resetStaffPasswordApi('u1')).toEqual({ id: 'u1' })
    expect(requested().pathname).toBe('/users/staff/u1/reset-password')
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST', body: undefined })
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({ Authorization: 'Bearer tok' })
    expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty('Content-Type')
  })

  it('encodes the id in the path', async () => {
    reply({ id: 'a/b' })
    await resetStaffPasswordApi('a/b')
    expect(requested().pathname).toBe('/users/staff/a%2Fb/reset-password')
  })

  it('rejects an answer without an id', async () => {
    reply({ mustChangePassword: true })
    expect((await failure(resetStaffPasswordApi('u1'))).kind).toBe('server')
  })

  it.each([
    [403, 'not_a_staff_account', 'forbidden'],
    [403, 'forbidden', 'forbidden'],
    [404, 'staff_not_found', 'not-found'],
    [422, 'weak_password', 'server'],
    [429, undefined, 'rate-limit'],
    [502, undefined, 'server'],
    [503, undefined, 'server'],
  ])('keeps the %i status and code %s on a %s error', async (status, code, kind) => {
    reply(code ? { code } : {}, status)
    expect(await failure(resetStaffPasswordApi('u1'))).toMatchObject({ kind, status, code })
  })

  it('reports a dropped connection as network', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    expect((await failure(resetStaffPasswordApi('u1'))).kind).toBe('network')
  })
})

describe('resetAdminPasswordApi', () => {
  it('posts to the admin reset path with no body and returns the id', async () => {
    reply({ id: 'a1', mustChangePassword: true, sessionsRevoked: true })
    expect(await resetAdminPasswordApi('a1')).toEqual({ id: 'a1' })
    expect(requested().pathname).toBe('/users/admins/a1/reset-password')
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST', body: undefined })
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({ Authorization: 'Bearer tok' })
  })

  it('encodes the id in the path', async () => {
    reply({ id: 'a/b' })
    await resetAdminPasswordApi('a/b')
    expect(requested().pathname).toBe('/users/admins/a%2Fb/reset-password')
  })

  it('rejects an answer without an id', async () => {
    reply({ mustChangePassword: true })
    expect((await failure(resetAdminPasswordApi('a1'))).kind).toBe('server')
  })

  it.each([
    [403, 'not_an_admin_account', 'forbidden'],
    [403, 'forbidden', 'forbidden'],
    [404, 'admin_not_found', 'not-found'],
    [422, 'weak_password', 'server'],
    [429, undefined, 'rate-limit'],
    [502, 'reset_incomplete', 'server'],
    [503, undefined, 'server'],
  ])('keeps the %i status and code %s on a %s error', async (status, code, kind) => {
    reply(code ? { code } : {}, status)
    expect(await failure(resetAdminPasswordApi('a1'))).toMatchObject({ kind, status, code })
  })

  it('reports a dropped connection as network', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    expect((await failure(resetAdminPasswordApi('a1'))).kind).toBe('network')
  })
})

describe.each([
  ['archiveStaffAccountApi', archiveStaffAccountApi, 'staff', 'archive', 'archived'],
  ['restoreStaffAccountApi', restoreStaffAccountApi, 'staff', 'restore', 'active'],
  ['archiveAdminAccountApi', archiveAdminAccountApi, 'admins', 'archive', 'archived'],
  ['restoreAdminAccountApi', restoreAdminAccountApi, 'admins', 'restore', 'active'],
] as const)('%s', (_name, call, kind, path, status) => {
  it('posts to the account path with no body and returns the id', async () => {
    reply({ id: 'u1', status, archivedAt: null })
    expect(await call('u1')).toEqual({ id: 'u1' })
    expect(requested().pathname).toBe(`/users/${kind}/u1/${path}`)
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST', body: undefined })
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({ Authorization: 'Bearer tok' })
    expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty('Content-Type')
  })

  it('encodes the id in the path', async () => {
    reply({ id: 'a/b' })
    await call('a/b')
    expect(requested().pathname).toBe(`/users/${kind}/a%2Fb/${path}`)
  })

  it('rejects an answer without an id', async () => {
    reply({ status })
    expect((await failure(call('u1'))).kind).toBe('server')
  })

  it.each([
    [403, 'not_a_staff_account', 'forbidden'],
    [403, 'not_an_admin_account', 'forbidden'],
    [404, 'staff_not_found', 'not-found'],
    [404, 'admin_not_found', 'not-found'],
    [409, 'already_archived', 'conflict'],
    [429, undefined, 'rate-limit'],
    [502, `${path}_incomplete`, 'server'],
    [502, `${path}_not_applied`, 'server'],
    [503, 'other', 'server'],
  ])('keeps the %i status and code %s on a %s error', async (statusCode, code, kind) => {
    reply(code ? { code } : {}, statusCode)
    expect(await failure(call('u1'))).toMatchObject({ kind, status: statusCode, code })
  })

  it('reports a dropped connection as network', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    expect((await failure(call('u1'))).kind).toBe('network')
  })
})
