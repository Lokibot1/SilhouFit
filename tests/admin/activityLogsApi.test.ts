import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProductListError, request } from '../../src/service/fetchProductList'

vi.mock('../../src/service/fetchProductList', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/service/fetchProductList')>()),
  request: vi.fn(),
}))
const send = vi.mocked(request)

const { fetchActivityLogs } = await import('../../src/service/activityLogs')

const entry = (over: Record<string, unknown> = {}) => ({
  id: 'a1',
  action: 'ORDER_STATUS_CHANGED',
  description: 'Order SHF-1 moved to PROCESSING',
  changes: null,
  metadata: null,
  createdAt: '2026-11-10T02:30:00.000Z',
  actor: { id: 'u1', type: 'USER', role: 'staff', email: 'liza@silhoufit.dev', fullName: 'Liza Cruz' },
  target: { type: 'ORDER', id: 'o1', label: 'SHF-1' },
  request: { ipAddress: null, userAgent: null, requestId: null },
  ...over,
})
const page = (data: unknown[]) => ({ data, meta: { total: data.length, page: 1, limit: 25, totalPages: 1, hasNextPage: false, hasPreviousPage: false } })

beforeEach(() => {
  vi.resetAllMocks()
})

describe('fetchActivityLogs', () => {
  it('sends only keys the API knows, with a Manila start of day and the limit capped at 100', async () => {
    send.mockResolvedValue(page([]))
    await fetchActivityLogs({ page: 2, limit: 500, action: 'ORDER_CREATED', actorId: 'u1', since: '2026-11-01', search: 'SHF' })
    const path = send.mock.calls[0][1]
    expect(send.mock.calls[0][0]).toBe('GET')
    const query = new URL(`http://x${path}`).searchParams
    expect(path).toMatch(/^\/admin\/audit-logs\?/)
    expect([...query.keys()]).toEqual(['page', 'limit', 'action', 'actorId', 'startDate', 'search'])
    expect(query.get('limit')).toBe('100')
    expect(query.get('startDate')).toBe('2026-11-01T00:00:00+08:00')
  })

  it('leaves out every filter that is not set', async () => {
    send.mockResolvedValue(page([]))
    await fetchActivityLogs({})
    expect(send).toHaveBeenCalledWith('GET', '/admin/audit-logs?page=1&limit=25', undefined, undefined)
  })

  it('maps an entry with the staff member as the actor, their role and the target label', async () => {
    send.mockResolvedValue(page([entry()]))
    const { data, meta } = await fetchActivityLogs({})
    expect(meta.total).toBe(1)
    expect(data[0]).toMatchObject({ category: 'order', actor: 'Liza Cruz', actorId: 'u1', actorRole: 'staff', target: 'SHF-1', detail: 'Order SHF-1 moved to PROCESSING' })
  })

  it('falls back from the name to the email, then to a removed account; the target to its id', async () => {
    send.mockResolvedValue(
      page([
        entry({ actor: { id: 'u1', type: 'USER', role: 'staff', email: 'liza@silhoufit.dev', fullName: null } }),
        entry({ id: 'a2', actor: { id: null, type: 'USER', role: null, email: null, fullName: null }, target: { type: 'ORDER', id: 'o1', label: null } }),
      ]),
    )
    const { data } = await fetchActivityLogs({})
    expect(data.map((log) => log.actor)).toEqual(['liza@silhoufit.dev', 'Removed account'])
    expect(data[1].target).toBe('o1')
  })

  it('labels the system, and webhooks by type: the courier for shipments, the payment gateway otherwise', async () => {
    const hook = { id: null, type: 'WEBHOOK', role: null, email: null, fullName: null }
    send.mockResolvedValue(
      page([
        entry({ id: 's', actor: { id: null, type: 'SYSTEM', role: null, email: null, fullName: null } }),
        entry({ id: 'c', action: 'SHIPMENT_STATUS_CHANGED', actor: hook }),
        entry({ id: 'p', action: 'PAYMENT_FAILED', actor: hook }),
      ]),
    )
    const { data } = await fetchActivityLogs({})
    expect(data.map((log) => [log.actor, log.actorRole])).toEqual([['System', null], ['Courier', null], ['Payment gateway', null]])
  })

  it("never labels a webhook by the customer's name, though payment webhooks carry it", async () => {
    send.mockResolvedValue(page([entry({ action: 'ORDER_PAID', actor: { id: 'c1', type: 'WEBHOOK', role: 'customer', email: 'anne@example.com', fullName: 'Anne Santos' } })]))
    const { data } = await fetchActivityLogs({})
    expect(data[0]).toMatchObject({ category: 'transaction', actor: 'Payment gateway', actorRole: null })
  })

  it('keeps an action it does not know under Accounts instead of failing the list', async () => {
    send.mockResolvedValue(page([entry({ action: 'COUPON_USED' })]))
    const { data } = await fetchActivityLogs({})
    expect(data[0]).toMatchObject({ action: 'COUPON_USED', category: 'account' })
  })

  it('files the messaging block and unblock under Accounts', async () => {
    send.mockResolvedValue(page([entry({ action: 'USER_MESSAGING_BLOCKED' }), entry({ id: 'a2', action: 'USER_MESSAGING_UNBLOCKED' })]))
    const { data } = await fetchActivityLogs({})
    expect(data.map((log) => [log.action, log.category])).toEqual([['USER_MESSAGING_BLOCKED', 'account'], ['USER_MESSAGING_UNBLOCKED', 'account']])
  })

  it('files every refund action under Transactions, a gateway one as the payment gateway', async () => {
    const actions = ['REFUND_REQUESTED', 'REFUND_SUCCEEDED', 'REFUND_FAILED', 'REFUND_MANUAL_ACTION_REQUIRED', 'REFUND_RETRIED', 'REFUND_MANUALLY_RESOLVED']
    send.mockResolvedValue(page(actions.map((action, i) => entry({ id: `r${i}`, action, ...(i === 1 && { actor: { id: null, type: 'WEBHOOK', role: null, email: null, fullName: null } }) }))))
    const { data } = await fetchActivityLogs({})
    expect(data.map((log) => [log.action, log.category])).toEqual(actions.map((action) => [action, 'transaction']))
    expect(data[1].actor).toBe('Payment gateway')
  })

  it('files every pickup location action under Orders', async () => {
    const actions = ['PICKUP_LOCATION_CREATED', 'PICKUP_LOCATION_UPDATED', 'PICKUP_LOCATION_DELETED']
    send.mockResolvedValue(page(actions.map((action, i) => entry({ id: `p${i}`, action, target: { type: 'PICKUP_LOCATION', id: 'p1', label: 'Main warehouse' } }))))
    const { data } = await fetchActivityLogs({})
    expect(data.map((log) => [log.action, log.category])).toEqual(actions.map((action) => [action, 'order']))
  })

  it.each([
    ['a body that is not an object', 'nope'],
    ['no data list', { meta: { total: 0 } }],
    ['no total', { data: [], meta: {} }],
    ['an entry with no time', page([entry({ createdAt: 'later' })])],
    ['an entry with no actor', page([entry({ actor: null })])],
    ['an unknown actor type', page([entry({ actor: { id: null, type: 'ROBOT', role: null, email: null, fullName: null } })])],
    ['an entry with no target id', page([entry({ target: { type: 'ORDER', id: null, label: null } })])],
  ])('rejects %s as a server fault', async (_name, body) => {
    send.mockResolvedValue(body)
    await expect(fetchActivityLogs({})).rejects.toMatchObject({ kind: 'server' })
    await expect(fetchActivityLogs({})).rejects.toBeInstanceOf(ProductListError)
  })
})
