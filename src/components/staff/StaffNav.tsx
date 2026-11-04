import { Fragment, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useCurrentUser } from '../../hooks/useCurrentUser'
import { useChatUnread } from '../../hooks/useChatUnread'
import { useCanView } from '../../hooks/usePermissions'
import type { Area } from '../../utils/staffRole'
import { BrandMark } from '../BrandMark'
import { UnreadBadge } from '../chat/InboxList'
import { Tooltip } from '../ui/Tooltip'
import { ChevronDownIcon } from '../form/icons'
import { NAV, NAV_GROUP_LABEL, type NavGroup } from './navConfig'

export const AREA_LABEL: Record<Area, string> = { staff: 'Staff', admin: 'Admin', superadmin: 'Super Admin' }

const ROW = 'font-ui flex min-h-11 items-center gap-2.5 rounded-xl px-2.5 text-sm font-semibold'
// Collapsed rows are a centred 44px square, so the icon is the whole target.
const ROW_COLLAPSED = 'font-ui relative flex size-11 items-center justify-center rounded-xl text-sm font-semibold'

export function StaffBrand({ area = 'staff' }: { area?: Area }) {
  return (
    <BrandMark bold inline>
      <span className="font-ui text-sm font-semibold tracking-normal text-fg-muted max-[399px]:hidden">{AREA_LABEL[area]}</span>
    </BrandMark>
  )
}

/** A group heading that opens and folds its links. */
function GroupToggle({ group, open, onToggle, first }: { group: NavGroup; open: boolean; onToggle: (group: string) => void; first: boolean }) {
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={() => onToggle(group)}
      className={`font-ui flex min-h-11 w-full items-center justify-between gap-2 rounded-xl px-2.5 text-xs font-semibold text-fg-muted hover:bg-fg/10 hover:text-fg ${first ? '' : 'mt-2'}`}
    >
      {NAV_GROUP_LABEL[group]}
      <ChevronDownIcon size={16} className={`shrink-0 transition-transform duration-200 motion-reduce:transition-none ${open ? '' : '-rotate-90'}`} />
    </button>
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
  const role = useCurrentUser()?.role ?? area
  const canView = useCanView(role)
  const unread = useChatUnread()
  // Staff who open an admin page (a superadmin turned it on) keep their own sidebar. Pages a superadmin turned off for the role are left out.
  const items = (role === 'staff' ? NAV.staff : NAV[area]).filter((item) => canView(item.page))
  // Groups the user folded shut. The icon rail always shows every link.
  // Only the admin and superadmin sidebars fold: they are the long ones. Staff keep a plain list.
  const foldable = !collapsed && role !== 'staff'
  const [folded, setFolded] = useState<Set<string>>(() => new Set())
  const toggleGroup = (group: string) =>
    setFolded((prev) => {
      const next = new Set(prev)
      if (!next.delete(group)) next.add(group)
      return next
    })
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <nav aria-label={AREA_LABEL[area]} className={`min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain pb-6 ${collapsed ? '' : '[scrollbar-gutter:stable] pr-2'}`}>
        <ul className={`grid gap-1 ${collapsed ? 'justify-center' : ''}`}>
          {items.map((item, index) => {
            if (foldable && item.group && folded.has(item.group)) {
              // A folded group still draws its heading, which is what opens it again.
              return item.group !== items[index - 1]?.group ? (
                <li key={item.label} role="presentation">
                  <GroupToggle group={item.group} open={false} onToggle={toggleGroup} first={index === 0} />
                </li>
              ) : null
            }
            const Icon = item.icon
            const badge = item.page === 'messages' ? unread : 0
            const row = collapsed ? ROW_COLLAPSED : ROW
            const content = (
              <>
                <Icon size={collapsed ? 20 : 16} />
                {collapsed ? <span className="sr-only">{item.label}</span> : <span className="min-w-0 flex-1 truncate">{item.label}</span>}
                {badge > 0 && <span className="sr-only">, {badge} unread</span>}
                {badge > 0 && (collapsed ? <span aria-hidden="true" className="absolute top-2 right-2 size-2.5 rounded-full bg-danger" /> : <span aria-hidden="true"><UnreadBadge count={badge} /></span>)}
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
            // Only grouped lists (the admin's) have headings: a divider stands in for one while the rail is collapsed.
            const heading =
              item.group && item.group !== items[index - 1]?.group ? (
                collapsed ? (
                  index > 0 && <li aria-hidden="true" className="my-1 h-px w-8 justify-self-center bg-line-strong" />
                ) : (
                  <li role="presentation">
                    {foldable ? (
                      <GroupToggle group={item.group} open onToggle={toggleGroup} first={index === 0} />
                    ) : (
                      <span className="font-ui block px-2.5 pt-3 pb-1 text-xs font-semibold text-fg-muted">{NAV_GROUP_LABEL[item.group]}</span>
                    )}
                  </li>
                )
              ) : null
            return (
              <Fragment key={item.label}>
                {heading}
                <li>{collapsed ? <Tooltip label={item.to ? item.label : `${item.label} (coming soon)`}>{entry}</Tooltip> : entry}</li>
              </Fragment>
            )
          })}
        </ul>
      </nav>
    </div>
  )
}
