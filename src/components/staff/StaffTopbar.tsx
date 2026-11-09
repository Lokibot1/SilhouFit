import type { CurrentUser } from '../../hooks/useCurrentUser'
import type { Area } from '../../utils/staffRole'
import { AccountMenu } from '../AccountMenu'
import { MessagesButton } from '../chat/dock/MessagesButton'
import { MenuIcon } from '../form/icons'
import { Tooltip } from '../ui/Tooltip'
import { VisitWebsiteLink } from '../VisitWebsiteLink'
import { NotificationMenu } from './NotificationMenu'
import { StaffBrand } from './StaffNav'
import { STAFF_TOPBAR } from './StaffSkeleton'

interface StaffTopbarProps {
  area: Area
  user: CurrentUser
  /** From `lg` the sidebar is on screen and the burger collapses it; below, it opens the drawer. */
  wide: boolean
  collapsed: boolean
  onToggleSidebar: () => void
  onMenu: () => void
  /** Called as the account menu signs out, before the session clears. */
  onSignOut: () => void
}

/** The staff pages' top bar: the burger and logo, then the visit-website globe, the notifications bell, the messages icon and the account menu. */
export function StaffTopbar({ area, user, wide, collapsed, onToggleSidebar, onMenu, onSignOut }: StaffTopbarProps) {
  const label = !wide ? 'Open menu' : collapsed ? 'Expand sidebar' : 'Collapse sidebar'

  return (
    <header className={STAFF_TOPBAR}>
      <div className="flex min-w-0 items-center gap-3">
        <Tooltip label={label}>
          <button
            type="button"
            onClick={wide ? onToggleSidebar : onMenu}
            aria-label={label}
            aria-expanded={wide ? !collapsed : undefined}
            aria-haspopup={wide ? undefined : 'dialog'}
            className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-xl text-fg hover:bg-fg/10"
          >
            <MenuIcon />
          </button>
        </Tooltip>
        <StaffBrand area={area} />
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <VisitWebsiteLink />
        <NotificationMenu />
        <MessagesButton area={area} />
        <AccountMenu user={user} profileTo={`/${area}/profile`} ordersTo={null} onSignOut={onSignOut} themeSwitch />
      </div>
    </header>
  )
}
