import { Link } from 'react-router-dom'
import { ActivityLogs } from '../../components/admin/ActivityLogs'
import { AdminSummaryCards } from '../../components/admin/AdminSummaryCards'
import { UsersIcon } from '../../components/form/icons'
import { longDate } from '../../components/staff/StaffSkeleton'
import { SECONDARY_BUTTON_SM } from '../../components/ui/buttonStyles'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useMetaDescription } from '../../hooks/useMetaDescription'
import { StaffDashboardWidgets } from '../staff/StaffDashboardPage'
import { useStaffMe } from '../staff/StaffLayout'

const META_DESCRIPTION =
  'See how many customers, staff and admins SilhouFit has, refunds, AR-ready products, low stock, the latest account changes, and the shop sales and orders.'

/** The admin's home: account and shop figures first, then the same sales and order widgets staff see. */
export function AdminDashboardPage() {
  useDocumentTitle('Admin dashboard — SilhouFit')
  useMetaDescription(META_DESCRIPTION)

  const me = useStaffMe()
  const today = new Date()

  return (
    <div className="grid gap-3">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="display text-2xl text-fg sm:text-3xl">Hello, {me.firstName}</h1>
          <p className="mt-1 text-xs text-fg-muted">
            <time dateTime={today.toISOString()}>{longDate(today)}</time>
          </p>
        </div>
        <Link to="/admin/users" className={SECONDARY_BUTTON_SM}>
          <UsersIcon size={16} />
          Manage users
        </Link>
      </header>
      <AdminSummaryCards />
      <StaffDashboardWidgets asideTop={<ActivityLogs />} />
    </div>
  )
}
