import { useSyncExternalStore } from 'react'
import { getModerationStatus, listModerationHistory, listOffenses, moderationVersion, subscribeModeration } from '../service/moderation'

/** A customer's offenses, moderation status and action history; re-renders whenever any of them changes. */
export function useModeration(userId: string) {
  useSyncExternalStore(subscribeModeration, moderationVersion)
  return { offenses: listOffenses(userId), status: getModerationStatus(userId), history: listModerationHistory(userId) }
}
