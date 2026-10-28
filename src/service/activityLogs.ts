import { buildMockActivityLogs, CATEGORY_OF } from '../data/mockActivityLogs'
import type { ActivityLog } from '../types/activityLogs'
import { getAccounts } from './accountStore'
import { simulateRequest, type RequestOptions } from './simulateRequest'

/**
 * Every category, newest first. The account entries are the changes made in this browser (accountStore); the rest are sample data.
 * REPLACE: GET /admin/activity-logs?category=account|order|transaction|product&limit= -> ActivityLog[] (the API records all four categories itself)
 */
export async function getActivityLogs({ signal, delayMs = 700 }: RequestOptions = {}): Promise<ActivityLog[]> {
  await simulateRequest(delayMs, signal, () => false)
  const accounts = getAccounts().activity.map(
    (entry): ActivityLog => ({ id: entry.id, category: CATEGORY_OF[entry.kind], action: entry.kind, actor: entry.actor, target: entry.target, createdAt: entry.at }),
  )
  return [...accounts, ...buildMockActivityLogs()].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}
