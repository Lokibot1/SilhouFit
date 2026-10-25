import { Link } from 'react-router-dom'
import { GlobeIcon } from './form/icons'
import { Tooltip } from './ui/Tooltip'

/** Signed-in navbars: the logo stops being a link, and this globe takes the user back to the landing page. */
export function VisitWebsiteLink({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Tooltip label="Visit website">
      <Link
        to="/"
        aria-label="Visit website"
        onClick={onNavigate}
        className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-xl text-fg hover:bg-fg/10"
      >
        <GlobeIcon />
      </Link>
    </Tooltip>
  )
}
