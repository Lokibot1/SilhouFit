import { Link } from 'react-router-dom'
import { BagIcon, MailIcon } from '../../components/form/icons'
import { KralErrorScreen } from '../../components/KralErrorScreen'
import { KRAL_PRIMARY, KRAL_SECONDARY } from '../../components/shop/shopControls'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useMetaDescription } from '../../hooks/useMetaDescription'

const META_DESCRIPTION =
  'This SilhouFit page could not be found. It may have moved or sold out, so head back to the shop or contact the team to keep browsing the full catalogue.'

export function NotFoundPage() {
  useDocumentTitle('Page not found — SilhouFit')
  useMetaDescription(META_DESCRIPTION)

  return (
    <>
      <KralErrorScreen code="404" status="Page not found" heading="This page doesn't exist" raised>
        <p className="mt-3 max-w-md text-base leading-relaxed text-kral-muted">
          The link may be wrong, or the page has moved. Check the address, or head back to the shop.
        </p>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <Link to="/shop" className={KRAL_PRIMARY}>
            <BagIcon size={16} />
            Back to shop
          </Link>
          <Link to="/contact" className={KRAL_SECONDARY}>
            <MailIcon size={16} />
            Contact us
          </Link>
        </div>
      </KralErrorScreen>
    </>
  )
}
