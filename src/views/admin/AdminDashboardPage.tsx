import { Link } from 'react-router-dom'
import { ActivityLogs } from '../../components/admin/ActivityLogs'
import { OperationsSummary } from '../../components/admin/AdminSummaryCards'
import { UsersIcon } from '../../components/form/icons'
import { longDate } from '../../components/staff/StaffSkeleton'
import { SECONDARY_BUTTON_SM } from '../../components/ui/buttonStyles'
import { SampleDataBadge } from '../../components/ui/SampleDataBadge'
import { SAMPLE_DATA } from '../../service/fetchStaffAnalytics'
import { useCurrentUser } from '../../hooks/useCurrentUser'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useMetaDescription } from '../../hooks/useMetaDescription'
import { StaffDashboardWidgets } from '../staff/StaffDashboardPage'
import { useStaffMe } from '../staff/StaffLayout'

const META_DESCRIPTION =
  'See refunds, AR-ready products and low stock at a glance, the latest account changes, and the shop sales and orders across SilhouFit.'

/** The admin's home: account and shop figures first, then the same sales and order widgets staff see. */
export function AdminDashboardPage() {
  useDocumentTitle('Admin dashboard — SilhouFit')
  useMetaDescription(META_DESCRIPTION)

  const me = useStaffMe()
  const superadmin = useCurrentUser()?.role === 'superadmin'
  const today = new Date()

  return (
    <div className="grid gap-3">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="display text-2xl text-fg sm:text-3xl">Hello, {me.firstName}</h1>
            {SAMPLE_DATA && <SampleDataBadge reason="These figures and log entries are placeholders until the orders and activity backends exist." />}
          </div>
          <p className="mt-1 text-xs text-fg-muted">
            <time dateTime={today.toISOString()}>{longDate(today)}</time>
          </p>
        </div>
        <Link to={superadmin ? '/superadmin/users' : '/admin/users'} className={SECONDARY_BUTTON_SM}>
          <UsersIcon size={16} />
          Manage users
        </Link>
      </header>
      <OperationsSummary base="/admin" />
      <StaffDashboardWidgets base="/admin" asideTop={<ActivityLogs />} />
    </div>
  )
}
