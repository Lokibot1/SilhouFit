import type { ThreadMessage } from '../hooks/useConversation'

/** The viewer's newest message the server has confirmed (not pending, not failed). */
export const lastSentId = (messages: ThreadMessage[], selfId?: string) => messages.findLast((m) => m.senderId === selfId && !m.status)?.id

/** The id of the viewer's last sent message when the other person has read it, else undefined. */
export function lastSeenId(messages: ThreadMessage[], selfId?: string, otherReadAt?: string | null) {
  const last = messages.find((m) => m.id === lastSentId(messages, selfId))
  return last && otherReadAt && Date.parse(otherReadAt) >= Date.parse(last.createdAt) ? last.id : undefined
}
