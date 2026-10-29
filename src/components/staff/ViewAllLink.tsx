import { Link } from 'react-router-dom'
import { SECONDARY_BUTTON_SM } from '../ui/buttonStyles'
import { ChevronRightIcon } from '../form/icons'

/** The tile's way into its full page. */
export function ViewAllLink({ to, what }: { to: string; what: string }) {
  return (
    <Link to={to} aria-label={`View all ${what}`} className={`${SECONDARY_BUTTON_SM} shrink-0`}>
      View all
      <ChevronRightIcon size={16} />
    </Link>
  )
}
