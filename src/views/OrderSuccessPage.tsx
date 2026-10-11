import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from '../components/ui/buttonStyles'
import { useCurrentUser } from '../hooks/useCurrentUser'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useMetaDescription } from '../hooks/useMetaDescription'
import { DURATION, EASE_OUT } from '../motion/tokens'
import { clearLastOrder, loadLastOrder } from '../utils/checkout'
import { formatPeso } from '../utils/format'

const META_DESCRIPTION =
  'Your SilhouFit order is placed and reserved for you. See your order reference, what you bought, how it reaches you and when, then head back to the shop.'

/** A check that draws itself once; with reduced motion it is simply there. */
function DrawnCheck() {
  const reduced = useReducedMotion()
  const draw = (delay: number) =>
    reduced
      ? { initial: false as const }
      : {
          initial: { pathLength: 0, opacity: 0 },
          animate: { pathLength: 1, opacity: 1 },
          transition: { duration: DURATION.entrance, delay, ease: EASE_OUT },
        }
  return (
    <svg viewBox="0 0 64 64" width="64" height="64" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-success">
      <motion.circle cx="32" cy="32" r="28" {...draw(0)} />
      <motion.path d="m20 33 8 8 16-18" {...draw(0.25)} />
    </svg>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
      <dt className="shrink-0 text-fg-muted">{label}</dt>
      <dd className="min-w-0 break-words text-fg sm:text-right">{children}</dd>
    </div>
  )
}

export function OrderSuccessPage() {
  useDocumentTitle('Order placed — SilhouFit')
  useMetaDescription(META_DESCRIPTION)

  // Read once. A delivery order holds an address and phone: they are dropped from session storage when this page is
  // left (and on sign-out), so reloading shows the empty state rather than personal details again.
  const [saved] = useState(loadLastOrder)
  // Signing out (here or in another tab) ends the session: the details go at once, not only from storage.
  const signedIn = useCurrentUser() !== null
  const order = signedIn ? saved : null
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (!signedIn) clearLastOrder()
    heading.current?.focus()
  }, [signedIn])
  useEffect(() => clearLastOrder, [])

  if (!order) {
    return (
      <div className="mx-auto flex max-w-xl flex-col px-6 pt-32 pb-24">
        <div className="glass-card rounded-2xl p-6 sm:p-8">
          <h1 ref={heading} tabIndex={-1} className="display text-3xl text-fg outline-none">
            No recent order
          </h1>
          <p className="mt-3 text-base leading-relaxed text-fg-muted">
            There is no order to show in this tab. Order details are kept only while you are on this page. Find a piece
            you like in the shop and choose Buy now.
          </p>
          <Link to="/shop" className={`${PRIMARY_BUTTON} mt-6 inline-flex`}>
            Back to shop
          </Link>
        </div>
      </div>
    )
  }

  const arReady = order.items.some((item) => item.arReady)
  const delivery = order.fulfilment === 'Delivery'

  return (
    <div className="mx-auto max-w-2xl px-6 pt-28 pb-24">
      <div className="glass-card glass-elevated rounded-2xl p-6 sm:p-10">
        <DrawnCheck />
        <h1 ref={heading} tabIndex={-1} className="display mt-4 text-4xl text-fg outline-none sm:text-5xl">
          Order placed
        </h1>
        <p className="mt-3 text-lg leading-relaxed text-fg-muted">
          Reserved for you. We&apos;ll keep you posted until it&apos;s in your hands.
        </p>

        <div className="mt-6 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 rounded-xl border border-line-strong px-4 py-3">
          <span className="text-fg-muted">Order reference</span>
          <span className="font-ui text-lg font-semibold tracking-wider text-fg tabular-nums">{order.orderId}</span>
        </div>

        <h2 className="display mt-8 text-xl text-fg">What you ordered</h2>
        <ul className="mt-3 space-y-3 border-b border-line pb-4">
          {order.items.map((item) => (
            <li key={`${item.name}|${item.size}|${item.color}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span className="min-w-0 break-words text-base text-fg">
                {item.name}
                <span className="block text-sm text-fg-muted">
                  Size {item.size} · {item.color} · {formatPeso(item.price)} × <span className="tabular-nums">{item.qty}</span>
                </span>
              </span>
              <span className="ml-auto text-right text-base font-semibold text-fg tabular-nums">{formatPeso(item.price * item.qty)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-4 space-y-2 text-base">
          <Row label="Shipping">
            <span className="tabular-nums">{order.shipping === 0 ? 'Free' : formatPeso(order.shipping)}</span>
          </Row>
          <Row label="Total">
            <span className="text-xl font-semibold tabular-nums">{formatPeso(order.total)}</span>
          </Row>
        </dl>

        <h2 className="display mt-8 text-xl text-fg">{delivery ? 'On its way to' : 'Waiting for you at'}</h2>
        <dl className="mt-3 space-y-2 text-base">
          {delivery ? (
            <>
              <Row label="Name">{order.recipient}</Row>
              <Row label="Address">{order.address}</Row>
              <Row label="Phone">
                <span className="tabular-nums">{order.phone}</span>
              </Row>
            </>
          ) : (
            <Row label="Boutique">{order.pickupAt}</Row>
          )}
          <Row label="When">{order.eta}</Row>
          <Row label="Payment">{order.payment}</Row>
          {order.note && <Row label="Your note">{order.note}</Row>}
        </dl>

        <div className="mt-10 flex flex-col gap-3 sm:flex-row *:flex-1">
          <Link to="/shop" className={PRIMARY_BUTTON}>
            Back to shop
          </Link>
          {arReady && (
            <Link to="/#ar-fitting" className={SECONDARY_BUTTON}>
              Try it on with AR
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
