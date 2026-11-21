import { Link } from 'react-router-dom'
import { LockIcon, MailIcon } from '../../components/form/icons'
import { KralErrorScreen } from '../../components/KralErrorScreen'
import { KRAL_PRIMARY, KRAL_SECONDARY } from '../../components/shop/shopControls'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useMetaDescription } from '../../hooks/useMetaDescription'

const META_DESCRIPTION =
  'This SilhouFit link has expired or was already used. Request a new link to reset your password or finish joining, or go back to the login page to continue.'

export function LinkExpiredPage() {
  useDocumentTitle('Link expired — SilhouFit')
  useMetaDescription(META_DESCRIPTION)

  return (
    <KralErrorScreen code="410" status="Link expired" heading="This link has expired" raised>
      <p className="mt-3 max-w-md text-base leading-relaxed text-kral-muted">
        Email links work once and stop working after a short time, so this one can no longer be used. Request a new link to continue.
      </p>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <Link to="/forgot-password" className={KRAL_PRIMARY}>
          <MailIcon size={16} />
          Request a new link
        </Link>
        <Link to="/login" className={KRAL_SECONDARY}>
          <LockIcon size={16} />
          Back to login
        </Link>
      </div>
    </KralErrorScreen>
  )
}
