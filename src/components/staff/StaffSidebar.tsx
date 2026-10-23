import type { Area } from '../../utils/staffRole'
import { AREA_LABEL, SidebarToggle, StaffBrand, StaffNav } from './StaffNav'
import { staffAside } from './StaffSkeleton'

interface StaffSidebarProps {
  area: Area
  collapsed: boolean
  onToggle: () => void
}

/** The desktop sidebar for any role: its links come from `NAV[area]`. It collapses to an icon rail. */
export function StaffSidebar({ area, collapsed, onToggle }: StaffSidebarProps) {
  return (
    <aside aria-label={`${AREA_LABEL[area]} sidebar`} className={staffAside(collapsed)}>
      <div className={`mb-6 flex min-h-11 items-center ${collapsed ? 'flex-col gap-2' : 'justify-between gap-2 pl-3'}`}>
        {collapsed ? (
          <span aria-label={`SilhouFit ${AREA_LABEL[area]}`} className="font-display text-lg font-bold tracking-[-0.02em] text-fg">
            SF
          </span>
        ) : (
          <StaffBrand area={area} />
        )}
        <SidebarToggle collapsed={collapsed} onToggle={onToggle} />
      </div>
      <StaffNav area={area} collapsed={collapsed} />
    </aside>
  )
}
