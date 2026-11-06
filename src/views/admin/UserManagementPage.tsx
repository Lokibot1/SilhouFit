import { useSearchParams } from 'react-router-dom'
import { AccountSummaryCards } from '../../components/admin/AdminSummaryCards'
import { AdminsTab } from '../../components/admin/users/AdminsTab'
import { CustomersTab } from '../../components/admin/users/CustomersTab'
import { StaffTab } from '../../components/admin/users/StaffTab'
import { SuperadminsTab } from '../../components/admin/users/SuperadminsTab'
import { SegmentedTabs } from '../../components/ui/SegmentedTabs'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useMetaDescription } from '../../hooks/useMetaDescription'
import { useCurrentUser } from '../../hooks/useCurrentUser'

const META_DESCRIPTION =
  'Invite SilhouFit staff and admins by email, look up customers, and manage accounts: search, filter, send password resets, and deactivate or reactivate people.'

const TABS = [
  { value: 'customers', label: 'Customers' },
  { value: 'staff', label: 'Staff' },
  { value: 'admins', label: 'Admins' },
  { value: 'superadmins', label: 'Superadmins' },
] as const
type Tab = (typeof TABS)[number]['value']

export function UserManagementPage() {
  useDocumentTitle('User management — SilhouFit')
  useMetaDescription(META_DESCRIPTION)

  const [params, setParams] = useSearchParams()
  // Only a superadmin has the Superadmins tab.
  const superadmin = useCurrentUser()?.role === 'superadmin'
  const tabs = TABS.filter((t) => superadmin || t.value !== 'superadmins')
  const requested = params.get('tab')
  const tab: Tab = tabs.find((t) => t.value === requested)?.value ?? 'customers'

  return (
    <div className="grid gap-3 md:[&_[role=combobox]]:min-h-11 md:[&_nav[aria-label=Pagination]_button]:min-h-11 md:[&_nav[aria-label=Pagination]_button]:min-w-11">
      <header className="flex min-h-8 flex-wrap items-center justify-between gap-3">
        <h1 className="display min-w-0 text-2xl text-fg sm:text-3xl">User management</h1>
      </header>
      <AccountSummaryCards base={superadmin ? '/superadmin' : '/admin'} superadmins={superadmin} />
      <div>
        <SegmentedTabs label="Account type" name="users" options={tabs} value={tab} onChange={(next) => setParams({ tab: next }, { replace: true })} />
      </div>
      <div role="tabpanel" aria-labelledby={`users-tab-${tab}`}>
        {tab === 'customers' ? <CustomersTab /> : tab === 'staff' ? <StaffTab /> : tab === 'admins' ? <AdminsTab /> : <SuperadminsTab />}
      </div>
    </div>
  )
}
