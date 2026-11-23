import { describe, expect, it } from 'vitest'
import type { ThreadMessage } from '../../src/hooks/useConversation'
import { lastSeenId, lastSentId } from '../../src/utils/chatThread'

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
