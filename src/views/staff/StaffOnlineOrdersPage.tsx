import { OrderLog } from '../../components/staff/OrderLog'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useMetaDescription } from '../../hooks/useMetaDescription'

const META_DESCRIPTION =
  'See every order customers placed online on SilhouFit, newest first, with who ordered, how many items, the total and when it was placed.'

/** Every online order, newest first. */
export function StaffOnlineOrdersPage() {
  useDocumentTitle('Online orders — SilhouFit')
  useMetaDescription(META_DESCRIPTION)

  return (
    <div className="grid gap-3">
      <header>
        <h1 className="display text-2xl text-fg sm:text-3xl">Online orders</h1>
      </header>
      <OrderLog all />
    </div>
  )
}
