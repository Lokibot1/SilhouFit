import { useTheme } from '../../contexts/ThemeContext'
import type { CurrentUser } from '../../hooks/useCurrentUser'
import type { Area } from '../../utils/staffRole'
import { AccountMenu } from '../AccountMenu'
import { ThemeToggle } from '../ThemeToggle'
import { Tooltip } from '../ui/Tooltip'
import { StaffBrand } from './StaffNav'
import { STAFF_TOPBAR } from './StaffSkeleton'

interface StaffTopbarProps {
  area: Area
  /** The current section's name. */
  section: string
  user: CurrentUser
  onMenu: () => void
  /** Called as the account menu signs out, before the session clears. */
  onSignOut: () => void
}

/** The staff pages' top bar: the Menu button and brand below `lg`, then the theme switch and the account menu. */
export function StaffTopbar({ area, section, user, onMenu, onSignOut }: StaffTopbarProps) {
  const { theme } = useTheme()

  return (
    <header className={STAFF_TOPBAR}>
      <div className="flex min-w-0 items-center gap-3">
        <button type="button" onClick={onMenu} aria-haspopup="dialog" className="pill glass-btn glass min-h-11 shrink-0 text-fg lg:hidden!">
          Menu
        </button>
        {/* Below 400px the area name is dropped so the switch and avatar fit at 320px. */}
        <span className="lg:hidden max-[399px]:[&_span]:hidden">
          <StaffBrand area={area} />
        </span>
        <span className="font-ui truncate text-base font-semibold text-fg-muted max-[399px]:hidden">{section}</span>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {/* The switch's own label is stretched to 44px so the touch target is real, not just an ::after. */}
        <div className="flex [&_label]:min-h-11 [&_label]:min-w-11 [&_label]:items-center [&_label]:justify-center [&_label]:after:inset-0">
          <Tooltip label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
            <ThemeToggle nativeTitle={false} />
          </Tooltip>
        </div>
        <AccountMenu user={user} profileTo={`/${area}/profile`} onSignOut={onSignOut} />
      </div>
    </header>
  )
}
