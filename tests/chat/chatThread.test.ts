import { describe, expect, it } from 'vitest'
import type { ThreadMessage } from '../../src/hooks/useConversation'
import { formatSentAgo } from '../../src/utils/format'
import { lastSeenId, lastSentId, needsTimeDivider } from '../../src/utils/chatThread'

const msg = (id: string, senderId: string, createdAt: string, status?: ThreadMessage['status']): ThreadMessage => ({ id, conversationId: 'c', senderId, content: id, attachments: [], createdAt, updatedAt: createdAt, status })

describe('lastSentId', () => {
  it('is the viewer’s newest confirmed message, skipping pending, failed and the other person’s', () => {
    const list = [msg('a', 'me', '2025-11-03T01:00:00Z'), msg('b', 'me', '2025-11-03T01:01:00Z'), msg('c', 'me', '2025-11-03T01:02:00Z', 'failed'), msg('d', 'me', '2025-11-03T01:03:00Z', 'pending'), msg('e', 'st', '2025-11-03T01:04:00Z')]
    expect(lastSentId(list, 'me')).toBe('b')
    expect(lastSentId([msg('e', 'st', '2025-11-03T01:04:00Z')], 'me')).toBeUndefined()
  })
})

describe('lastSeenId', () => {
  const list = [msg('a', 'me', '2025-11-03T01:00:00Z'), msg('b', 'st', '2025-11-03T01:05:00Z')]
  it('is the last sent message once the other person has read at or after it', () => {
    expect(lastSeenId(list, 'me', '2025-11-03T01:00:00Z')).toBe('a')
    expect(lastSeenId(list, 'me', '2025-11-03T02:00:00Z')).toBe('a')
  })
  it('is nothing when they read earlier, never read, or the viewer sent nothing', () => {
    expect(lastSeenId(list, 'me', '2025-11-03T00:59:59Z')).toBeUndefined()
    expect(lastSeenId(list, 'me', null)).toBeUndefined()
    expect(lastSeenId(list, 'nobody', '2025-11-03T02:00:00Z')).toBeUndefined()
  })
})

describe('needsTimeDivider', () => {
  const at = (iso: string) => ({ createdAt: iso })
  it('opens the thread and every new day', () => {
    expect(needsTimeDivider(undefined, at('2025-11-03T01:00:00Z'))).toBe(true)
    // 15:59 UTC is 11:59 PM in Manila, 16:01 UTC is 12:01 AM the next day.
    expect(needsTimeDivider(at('2025-11-03T15:59:00Z'), at('2025-11-03T16:01:00Z'))).toBe(true)
  })
  it('follows a gap of 15 minutes or more, but not a shorter one', () => {
    expect(needsTimeDivider(at('2025-11-03T01:00:00Z'), at('2025-11-03T01:14:59Z'))).toBe(false)
    expect(needsTimeDivider(at('2025-11-03T01:00:00Z'), at('2025-11-03T01:15:00Z'))).toBe(true)
  })
})

describe('formatSentAgo', () => {
  const now = new Date('2025-11-03T05:00:00Z')
  it('reads as a sentence under the last message', () => {
    expect(formatSentAgo('2025-11-03T04:59:50Z', now)).toBe('Sent just now')
    expect(formatSentAgo('2025-11-03T04:58:00Z', now)).toBe('Sent 2m ago')
    expect(formatSentAgo('2025-11-03T02:00:00Z', now)).toBe('Sent 3h ago')
    expect(formatSentAgo('2025-11-01T02:00:00Z', now)).toBe('Sent Nov 1')
  })
})
