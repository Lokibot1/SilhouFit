import { ActivityLogs } from '../../components/admin/ActivityLogs'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useMetaDescription } from '../../hooks/useMetaDescription'

const META_DESCRIPTION =
  'Review every action logged across SilhouFit accounts, orders, transactions and products, who did it and when, newest first, and filter by category.'

/** Every logged action, for admins. */
export function ActivityLogsPage() {
  useDocumentTitle('Activity logs — SilhouFit')
  useMetaDescription(META_DESCRIPTION)

  return (
    <div className="grid gap-3">
      <header>
        <h1 className="display text-2xl text-fg sm:text-3xl">Activity logs</h1>
      </header>
      <ActivityLogs full />
    </div>
  )
}
