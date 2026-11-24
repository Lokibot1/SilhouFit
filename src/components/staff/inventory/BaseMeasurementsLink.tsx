import { useCurrentUser } from '../../../hooks/useCurrentUser'
import { useCanView } from '../../../hooks/usePermissions'
import { RestoreIcon } from '../../form/icons'
import { SECONDARY_BUTTON_SM } from '../../ui/buttonStyles'

/**
 * What to do when a category's base measurements lack a size: a link to the Base measurements page for the category (new tab, so the form
 * keeps its work) and Check again, which re-reads the rows once one is added. Without access to that page it says to ask an admin.
 */
export function BaseMeasurementsLink({ category, sizes, onCheckAgain }: { category: string; sizes: string; onCheckAgain: () => void }) {
  const canView = useCanView(useCurrentUser()?.role ?? 'staff')
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {canView('measurements') ? (
        // Relative, so it resolves under /staff or /admin, whichever page this is.
        <a
          href={`measurements?category=${encodeURIComponent(category)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center text-sm font-semibold text-fg underline underline-offset-2"
        >
          Add {sizes} in Base measurements<span className="sr-only"> (opens in a new tab)</span>
        </a>
      ) : (
        <span className="text-xs text-fg-muted">Ask an admin to add {sizes} in Base measurements.</span>
      )}
      <button type="button" onClick={onCheckAgain} className={SECONDARY_BUTTON_SM}>
        <RestoreIcon />
        Check again
      </button>
    </div>
  )
}
