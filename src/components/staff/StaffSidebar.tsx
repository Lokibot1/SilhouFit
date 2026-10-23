import type { Area } from '../../utils/staffRole'
import { AREA_LABEL, StaffNav } from './StaffNav'
import { staffAside } from './StaffSkeleton'

interface StaffSidebarProps {
  area: Area
  collapsed: boolean
}

/** The desktop sidebar for any role: its links come from `NAV[area]`. It collapses to an icon rail; the top bar's burger toggles it. */
export function StaffSidebar({ area, collapsed }: StaffSidebarProps) {
  return (
    <aside aria-label={`${AREA_LABEL[area]} sidebar`} className={staffAside(collapsed)}>
      <StaffNav area={area} collapsed={collapsed} />
    </aside>
  )
}
