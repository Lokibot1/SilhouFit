import { Link } from 'react-router-dom'
import type { CurrentUser } from '../hooks/useCurrentUser'
import { homeFor, isStaffRole } from '../utils/staffRole'
import { Avatar } from './ui/Avatar'
import { Tooltip } from './ui/Tooltip'

/** The signed-in avatar on the public pages: no menu, it goes straight to the dashboard (staff, admin, superadmin) or the profile. */
export function AccountLink({ user, onNavigate }: { user: CurrentUser; onNavigate?: () => void }) {
  const label = isStaffRole(user.role) ? 'Dashboard' : 'Profile'
  return (
    <Tooltip label={label}>
      <Link
        to={homeFor(user.role)}
        aria-label={`${label}, ${user.name}`}
        onClick={onNavigate}
        className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-xl hover:bg-fg/10"
      >
        <Avatar name={user.name} src={user.avatarUrl} initials={user.initials} size="sm" />
      </Link>
    </Tooltip>
  )
}
