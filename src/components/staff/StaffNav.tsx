import { NavLink } from 'react-router-dom'
import type { Area } from '../../utils/staffRole'
import { BrandMark } from '../BrandMark'
import { Tooltip } from '../ui/Tooltip'
import { NAV } from './navConfig'

export const AREA_LABEL: Record<Area, string> = { staff: 'Staff', admin: 'Admin', superadmin: 'Super Admin' }

const ROW = 'font-ui flex min-h-11 items-center gap-2.5 rounded-xl px-2.5 text-sm font-semibold'
// Collapsed rows are a centred 44px square, so the icon is the whole target.
const ROW_COLLAPSED = 'font-ui flex size-11 items-center justify-center rounded-xl text-sm font-semibold'

export function StaffBrand({ area = 'staff' }: { area?: Area }) {
  return (
    <BrandMark bold inline>
      <span className="font-ui text-sm font-semibold tracking-normal text-fg-muted">{AREA_LABEL[area]}</span>
    </BrandMark>
  )
}

interface StaffNavProps {
  area: Area
  /** Icons only, with each label as a tooltip. The mobile drawer is never collapsed. */
  collapsed?: boolean
  /** Called when a live item is chosen, so the sheet can close. */
  onNavigate?: () => void
}

export function StaffNav({ area, collapsed = false, onNavigate }: StaffNavProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <nav aria-label={AREA_LABEL[area]} className="flex-1">
        <ul className={`grid gap-1 ${collapsed ? 'justify-center' : ''}`}>
          {NAV[area].map((item) => {
            const Icon = item.icon
            const row = collapsed ? ROW_COLLAPSED : ROW
            const content = (
              <>
                <Icon size={collapsed ? 20 : 16} />
                {collapsed ? <span className="sr-only">{item.label}</span> : <span className="min-w-0 flex-1 truncate">{item.label}</span>}
                {!collapsed && !item.to && (
                  <span className="rounded-full border border-line-strong px-1.5 py-0.5 text-xs font-medium">Soon</span>
                )}
              </>
            )
            const entry = item.to ? (
              <NavLink
                to={item.to}
                end
                onClick={onNavigate}
                className={({ isActive }) => `${row} ${isActive ? 'bg-chrome-strong text-canvas-sub' : 'text-fg hover:bg-fg/10'}`}
              >
                {content}
              </NavLink>
            ) : (
              <span role="link" aria-disabled="true" className={`${row} cursor-not-allowed text-fg-muted`}>
                {content}
              </span>
            )
            return (
              <li key={item.label}>
                {collapsed ? <Tooltip label={item.to ? item.label : `${item.label} (coming soon)`}>{entry}</Tooltip> : entry}
              </li>
            )
          })}
        </ul>
      </nav>
    </div>
  )
}
