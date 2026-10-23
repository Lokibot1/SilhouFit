import { AREA_LABEL } from '../../components/staff/StaffNav'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useMetaDescription } from '../../hooks/useMetaDescription'
import type { Area } from '../../utils/staffRole'
import { useStaffMe } from './StaffLayout'

/** The admin and superadmin dashboards until their pages are built. */
export function RoleDashboardPlaceholder({ area }: { area: Exclude<Area, 'staff'> }) {
  const label = AREA_LABEL[area]
  useDocumentTitle(`${label} dashboard — SilhouFit`)
  useMetaDescription(`The SilhouFit ${label.toLowerCase()} dashboard. Its tools are still being built, and this page will list them as they arrive.`)

  const me = useStaffMe()

  return (
    <header>
      <h1 className="display text-3xl text-fg sm:text-4xl">Hello, {me.firstName}</h1>
      <p className="mt-2 text-base text-fg-muted">
        The {label.toLowerCase()} dashboard is on the way. Its tools will show up here once they are built.
      </p>
    </header>
  )
}
