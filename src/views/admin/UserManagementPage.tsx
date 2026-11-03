import { useSearchParams } from 'react-router-dom'
import { AdminsTab } from '../../components/admin/users/AdminsTab'
import { CustomersTab } from '../../components/admin/users/CustomersTab'
import { StaffTab } from '../../components/admin/users/StaffTab'
import { SuperadminsTab } from '../../components/admin/users/SuperadminsTab'
import { SegmentedTabs } from '../../components/staff/measurements/SegmentedTabs'
import { Tooltip } from '../../components/ui/Tooltip'
import { ACCOUNTS_SAMPLE_DATA } from '../../config/accountPolicy'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useMetaDescription } from '../../hooks/useMetaDescription'
import { useCurrentUser } from '../../hooks/useCurrentUser'

const META_DESCRIPTION =
  'Look up SilhouFit customers and their orders, add staff and admin accounts, hand over temporary credentials, reset passwords and archive staff who have left.'

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
  // Only a superadmin has the Superadmins tab, and only a superadmin can reset or archive an admin.
  const superadmin = useCurrentUser()?.role === 'superadmin'
  const tabs = TABS.filter((t) => superadmin || t.value !== 'superadmins')
  const requested = params.get('tab')
  const tab: Tab = tabs.find((t) => t.value === requested)?.value ?? 'customers'

  return (
    <div className="grid gap-3">
      <header className="flex min-h-8 flex-wrap items-center justify-between gap-3">
        <h1 className="display min-w-0 text-2xl text-fg sm:text-3xl">User management</h1>
        {ACCOUNTS_SAMPLE_DATA && (
          <Tooltip label="These accounts are saved in this browser only, until the accounts backend is connected." describe>
            <span tabIndex={0} className="font-ui inline-flex h-8 items-center rounded-full border border-line-strong px-3 text-sm font-medium text-fg-muted">
              Sample data
            </span>
          </Tooltip>
        )}
      </header>
      <div>
        <SegmentedTabs label="Account type" name="users" options={tabs} value={tab} onChange={(next) => setParams({ tab: next }, { replace: true })} />
      </div>
      <div role="tabpanel" aria-labelledby={`users-tab-${tab}`}>
        {tab === 'customers' ? <CustomersTab /> : tab === 'staff' ? <StaffTab /> : tab === 'admins' ? <AdminsTab manage={superadmin} /> : <SuperadminsTab />}
      </div>
    </div>
  )
}
