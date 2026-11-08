import { Link } from 'react-router-dom'
import { GlobeIcon } from './form/icons'
import { KRAL_ICON_BUTTON } from './ui/kralIconButton'
import { Tooltip } from './ui/Tooltip'

/** Signed-in shop and staff bars: the logo stops being a link, and this globe takes the user back to the landing page. */
export function VisitWebsiteLink({ tone }: { tone?: 'kral' }) {
  return (
    <Tooltip label="Visit website">
      <Link
        to="/"
        aria-label="Visit website"
        className={
          tone === 'kral'
            ? KRAL_ICON_BUTTON
            : 'flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-xl text-fg hover:bg-fg/10'
        }
      >
        <GlobeIcon />
      </Link>
    </Tooltip>
  )
}
