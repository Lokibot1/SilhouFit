import type { ThreadMessage } from '../hooks/useConversation'
import { manilaDay } from './format'

/** A new time label shows when this much quiet passes between two messages. */
const TIME_GAP_MS = 15 * 60_000

/** A centered time goes before `next` when it opens a day or follows a gap of 15+ minutes after `prev`. */
export const needsTimeDivider = (prev: { createdAt: string } | undefined, next: { createdAt: string }) =>
  !prev || manilaDay(prev.createdAt) !== manilaDay(next.createdAt) || Date.parse(next.createdAt) - Date.parse(prev.createdAt) >= TIME_GAP_MS

/** The viewer's newest message the server has confirmed (not pending, not failed). */
export const lastSentId = (messages: ThreadMessage[], selfId?: string) => messages.findLast((m) => m.senderId === selfId && !m.status)?.id

/** The id of the viewer's last sent message when the other person has read it, else undefined. */
export function lastSeenId(messages: ThreadMessage[], selfId?: string, otherReadAt?: string | null) {
  const last = messages.find((m) => m.id === lastSentId(messages, selfId))
  return last && otherReadAt && Date.parse(otherReadAt) >= Date.parse(last.createdAt) ? last.id : undefined
}
