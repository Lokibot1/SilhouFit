import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/service/simulateRequest', () => ({ simulateRequest: () => Promise.resolve({ ok: true }) }))

let m: typeof import('../../src/service/moderation')
beforeEach(async () => {
  localStorage.clear()
  vi.resetModules()
  m = await import('../../src/service/moderation')
})

describe('moderation service', () => {
  it('lists seeded offenses newest first and counts them', () => {
    const list = m.listOffenses('cus-014')
    expect(list).toHaveLength(4)
    expect(list.map((o) => o.createdAt)).toEqual([...list.map((o) => o.createdAt)].sort().reverse())
    expect(m.offenseCount('cus-014')).toBe(4)
  })

  it('records an offense for a user and notifies subscribers', () => {
    const seen = vi.fn()
    m.subscribeModeration(seen)
    const before = m.offenseCount('cus-001')
    m.recordOffense({ userId: 'cus-001', conversationId: 'c1', excerpt: 'you ****' })
    expect(m.offenseCount('cus-001')).toBe(before + 1)
    expect(m.listOffenses('cus-001')[0]).toMatchObject({ excerpt: 'you ****', conversationId: 'c1' })
    expect(seen).toHaveBeenCalled()
  })

  it('moves a user through block, ban and back, recording who and why', async () => {
    expect(m.getModerationStatus('cus-001')).toBe('active')
    await m.blockMessaging('cus-001', 'Sam Reyes', ' spam ')
    expect(m.getModerationStatus('cus-001')).toBe('messaging_blocked')
    await m.banUser('cus-001', 'Dev Admin')
    expect(m.getModerationStatus('cus-001')).toBe('banned')
    await m.unbanUser('cus-001', 'Dev Admin')
    await m.unblockMessaging('cus-001', 'Dev Admin')
    expect(m.getModerationStatus('cus-001')).toBe('active')
    const history = m.listModerationHistory('cus-001')
    expect(history.map((h) => h.action)).toEqual(['unblock_messaging', 'unban', 'ban', 'block_messaging'])
    expect(history[3]).toMatchObject({ actor: 'Sam Reyes', reason: 'spam' })
  })

  it('starts the seeded blocked and banned customers in those states', () => {
    expect(m.getModerationStatus('cus-005')).toBe('messaging_blocked')
    expect(m.getModerationStatus('cus-014')).toBe('banned')
  })
})
