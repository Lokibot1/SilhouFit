import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArIcon, DownloadIcon, MessageIcon, SpinnerIcon, StoreIcon } from '../../components/form/icons'
import { KRAL_PRIMARY, KRAL_SECONDARY } from '../../components/shop/shopControls'
import { useToast } from '../../components/toast/useToast'
import { SampleDataBadge } from '../../components/ui/SampleDataBadge'
import { useCurrentUser } from '../../hooks/useCurrentUser'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useMetaDescription } from '../../hooks/useMetaDescription'
import { DURATION, EASE_OUT } from '../../motion/tokens'
import { clearLastOrder, loadLastOrder } from '../../utils/checkout'
import { formatPeso, formatPlacedAt } from '../../utils/format'

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
    <svg viewBox="0 0 64 64" width="64" height="64" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-kral-fg">
      <motion.circle cx="32" cy="32" r="28" {...draw(0)} />
      <motion.path d="m20 33 8 8 16-18" {...draw(0.25)} />
    </svg>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="shrink-0 text-fg-muted">{label}</dt>
      <dd className="min-w-0 break-words text-right text-fg">{children}</dd>
    </div>
  )
}

const RULE = 'border-t border-dashed border-line-strong'

export function OrderSuccessPage() {
  useDocumentTitle('Order placed — SilhouFit')
  useMetaDescription(META_DESCRIPTION)

  // Read once. A delivery order holds an address and phone: they are dropped from session storage when this page is
  // left (and on sign-out), so reloading shows the empty state rather than personal details again.
  const [saved] = useState(loadLastOrder)
  // Signing out (here or in another tab) ends the session: the details go at once, not only from storage.
  const signedIn = useCurrentUser() !== null
  const order = signedIn ? saved : null
  const toast = useToast()
  const heading = useRef<HTMLHeadingElement>(null)
  const [downloading, setDownloading] = useState(false)
  const [downloadFailed, setDownloadFailed] = useState(false)
  useEffect(() => {
    if (!signedIn) clearLastOrder()
    heading.current?.focus()
  }, [signedIn])
  useEffect(() => clearLastOrder, [])

  if (!order) {
    return (
      <div className="mx-auto flex max-w-xl flex-col px-6 pt-32 pb-24">
        <div className="border border-kral-rule p-6 sm:p-8">
          <h1 ref={heading} tabIndex={-1} className="font-kral-display text-2xl leading-[1.05] font-extrabold text-kral-fg uppercase outline-none sm:text-3xl">
            No recent order
          </h1>
          <p className="font-kral-mono mt-3 text-base leading-relaxed text-kral-muted">
            There is no order to show in this tab. Order details are kept only while you are on this page. Find a piece
            you like in the shop and choose Buy now.
          </p>
          <Link to="/shop" className={`${KRAL_PRIMARY} mt-6 w-fit`}>
            <StoreIcon />
            Back to shop
          </Link>
        </div>
      </div>
    )
  }

  async function downloadReceipt() {
    if (!order || downloading) return
    setDownloading(true)
    setDownloadFailed(false)
    try {
      const { renderReceiptPdf } = await import('../../utils/receiptPdf')
      const url = URL.createObjectURL(await renderReceiptPdf(order))
      const link = document.createElement('a')
      link.href = url
      link.download = `SilhouFit-receipt-${order.orderId}.pdf`
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      toast.show({ kind: 'success', message: 'Receipt downloaded.' })
    } catch {
      setDownloadFailed(true)
    } finally {
      setDownloading(false)
    }
  }

  const arReady = order.items.some((item) => item.arReady)
  const subtotal = order.items.reduce((sum, item) => sum + item.price * item.qty, 0)

  return (
    <div className="mx-auto grid max-w-5xl gap-10 px-6 pt-28 pb-24 lg:grid-cols-[minmax(0,24rem)_1fr] lg:items-start lg:gap-16">
      {/* The receipt: a narrow paper slip with a torn bottom edge. */}
      <article aria-label="Order receipt" className="receipt font-kral-mono text-base text-fg md:text-sm">
        <div className="bg-canvas-raised px-6 pt-6 pb-4">
          <p className="font-kral-display text-center text-xl leading-[1.05] font-extrabold uppercase">KRAL</p>
          <p className="mt-1 text-center text-fg-muted">Order receipt</p>
          {order.placedAt && <p className="text-center text-fg-muted tabular-nums">{formatPlacedAt(order.placedAt)}</p>}
          <p className="mt-3 text-center text-base font-semibold tracking-wider tabular-nums">{order.orderId}</p>

          <ul className={`mt-4 space-y-3 pt-4 ${RULE}`}>
            {order.items.map((item) => (
              <li key={`${item.name}|${item.size}|${item.color}`} className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 break-words">
                  {item.name}
                  <span className="block text-xs text-fg-muted">
                    Size {item.size} · {item.color} · {formatPeso(item.price)} × <span className="tabular-nums">{item.qty}</span>
                  </span>
                </span>
                <span className="shrink-0 text-right font-semibold tabular-nums">{formatPeso(item.price * item.qty)}</span>
              </li>
            ))}
          </ul>

          <dl className={`mt-4 space-y-1 pt-4 ${RULE}`}>
            <Row label="Subtotal">
              <span className="tabular-nums">{formatPeso(subtotal)}</span>
            </Row>
            <Row label="Shipping">
              <span className="tabular-nums">{order.shipping === 0 ? 'Free' : formatPeso(order.shipping)}</span>
            </Row>
            <Row label="Total">
              <span className="text-lg font-semibold tabular-nums">{formatPeso(order.total)}</span>
            </Row>
          </dl>

          <h2 className={`mt-4 pt-4 text-xs font-semibold tracking-wider text-fg-muted uppercase ${RULE}`}>
            On its way to
          </h2>
          <dl className="mt-2 space-y-1">
            <Row label="Name">{order.recipient}</Row>
            <Row label="Address">{order.address}</Row>
            <Row label="Phone">
              <span className="tabular-nums">{order.phone}</span>
            </Row>
            <Row label="When">{order.eta}</Row>
            <Row label="Payment">{order.payment}</Row>
            {order.note && <Row label="Your note">{order.note}</Row>}
          </dl>

          <p className={`mt-4 pt-4 text-center text-fg-muted ${RULE}`}>Thank you for shopping at KRAL.</p>
        </div>
        <div aria-hidden="true" className="receipt-edge" />
      </article>

      {/* Phones show this first: what happened and what to do next, then the receipt. */}
      <div className="max-lg:order-first lg:sticky lg:top-28">
        <DrawnCheck />
        <h1 ref={heading} tabIndex={-1} className="font-kral-display mt-4 text-3xl leading-[1.05] font-extrabold [overflow-wrap:anywhere] text-kral-fg uppercase outline-none sm:text-4xl xl:text-5xl">
          Order placed
        </h1>
        <div className="mt-3">
          <SampleDataBadge tone="kral" reason="This order is a demo until the orders backend is connected. Nothing was charged or saved." />
        </div>
        <p className="font-kral-mono mt-3 text-base leading-relaxed text-kral-muted lg:text-lg">
          Reserved for you. We&apos;ll keep you posted until it&apos;s in your hands.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:max-w-sm">
          <Link to="/shop" className={KRAL_PRIMARY}>
            <StoreIcon />
            Back to shop
          </Link>
          {arReady && (
            <Link to={{ pathname: '/about', hash: '#how-it-works' }} className={KRAL_SECONDARY}>
              <ArIcon />
              Try it on with AR
            </Link>
          )}
          <button type="button" onClick={() => void downloadReceipt()} disabled={downloading} className={KRAL_SECONDARY}>
            {downloading ? <SpinnerIcon /> : <DownloadIcon />}
            Download receipt
          </button>
          <Link to="/messages" className={KRAL_SECONDARY}>
            <MessageIcon size={16} />
            Message staff
          </Link>
          {downloadFailed && (
            <p role="alert" className="font-kral-mono text-base leading-snug text-danger md:text-sm">
              We couldn&apos;t make your receipt. Something went wrong while building the PDF. Press Download receipt to try again.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
