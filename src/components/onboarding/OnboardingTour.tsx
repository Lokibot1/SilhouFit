import { MotionConfig, motion, useMotionValue, useReducedMotion, useSpring } from 'motion/react'
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useCartCount } from '../../hooks/useCart'
import { useCurrentUser } from '../../hooks/useCurrentUser'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { useOnboarding } from '../../hooks/useOnboarding'
import { useProducts } from '../../hooks/useProducts'
import { DURATION, EASE_OUT, SPRING } from '../../motion/tokens'
import { saveOnboardingStatus, type OnboardingChoice } from '../../service/onboarding'
import { CheckIcon, SpinnerIcon, XIcon } from '../form/icons'
import { SilhouetteMark } from '../landing/SilhouetteMark'
import { useToast } from '../toast/useToast'
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from '../ui/buttonStyles'
import { Modal } from '../ui/Modal'
import { Tooltip } from '../ui/Tooltip'
import { Confetti } from './Confetti'
import { Spotlight } from './Spotlight'
import { tourProduct, tourSteps } from './steps'
import { dockFor, freeArea, PAD, useTourTarget, type Box } from './useTourTarget'

const SKIPPED_TOAST = 'Tour skipped. Replay it any time from your profile.'
const SAVE_FAILED_TOAST =
  "We couldn't save your tour choice. Your account did not confirm the save, so it is only remembered on this device. We'll try again next time you open SilhouFit, so keep shopping."

const PARTICLES = [
  { top: '12%', left: '14%', delay: '0s' },
  { top: '24%', left: '82%', delay: '0.9s' },
  { top: '68%', left: '10%', delay: '1.7s' },
  { top: '78%', left: '88%', delay: '2.4s' },
  { top: '8%', left: '54%', delay: '3.1s' },
]

/** A silhouette that leans a few pixels toward the pointer. Decorative; held still on touch and reduced motion. */
function WelcomeMark() {
  const fine = useMediaQuery('(pointer: fine)')
  const reduced = useReducedMotion()
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const sx = useSpring(x, SPRING.pointer)
  const sy = useSpring(y, SPRING.pointer)
  const live = fine && !reduced

  return (
    <div
      aria-hidden="true"
      onPointerMove={
        live
          ? (event) => {
              const rect = event.currentTarget.getBoundingClientRect()
              x.set(((event.clientX - rect.left) / rect.width - 0.5) * 16)
              y.set(((event.clientY - rect.top) / rect.height - 0.5) * 12)
            }
          : undefined
      }
      className="relative mb-4 flex h-32 items-center justify-center rounded-xl border border-line bg-fg/5"
    >
      {PARTICLES.map((p) => (
        <span
          key={p.top + p.left}
          className="animate-twinkle absolute size-1.5 rounded-full bg-fg opacity-40 motion-reduce:animate-none"
          style={{ top: p.top, left: p.left, animationDelay: p.delay }}
        />
      ))}
      <motion.div style={live ? { x: sx, y: sy } : undefined}>
        <SilhouetteMark className="h-24 w-[4.6rem] text-fg" />
      </motion.div>
    </div>
  )
}

export function OnboardingTour() {
  const tour = useOnboarding()
  const user = useCurrentUser()
  const products = useProducts()
  const cartCount = useCartCount()
  const toast = useToast()
  const navigate = useNavigate()
  const { pathname, search } = useLocation()
  const reduced = useReducedMotion()
  const headingId = useId()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const [cardHeight, setCardHeight] = useState(0)

  const catalogue = products.status === 'success' ? products.data.products : null
  const product = useMemo(() => tourProduct(catalogue), [catalogue])
  const steps = useMemo(() => tourSteps(product), [product])
  const counts = useMemo(() => steps.map((s) => s.stops.length), [steps])
  const ready = products.status !== 'loading'

  const stepIndex = Math.min(tour.step, steps.length - 1)
  const step = steps[stepIndex]
  const stopIndex = Math.min(tour.stop, step.stops.length - 1)
  const stop = step.stops[stopIndex]
  const route = step.route(product)
  const noSample = route === null
  const inStep = tour.phase === 'step' && ready

  // Cart feedback is tour-only: while the Add to cart step is open, a rising count moves the spotlight to the cart.
  const cartStop = step.stops.findIndex((s) => s.targets.includes('cart'))
  const [entry, setEntry] = useState({ id: step.id, count: cartCount })
  if (entry.id !== step.id) setEntry({ id: step.id, count: cartCount })
  const added = step.id === 'cart' && entry.id === step.id && cartCount > entry.count
  const { setStop } = tour
  useEffect(() => {
    if (added) setStop(cartStop)
  }, [added, cartStop, setStop])
  const pulse = added && stopIndex === cartStop

  // Without a sample piece there is no page to look at, but a top-bar target (the cart) is still there to find.
  const noTarget = noSample && !stop.anyPage
  const target = useTourTarget(stop.targets, inStep && !noTarget, cardHeight)
  const box = target.status === 'found' ? target.box : null
  const missing = noTarget || target.status === 'missing'
  const searching = !pulse && !missing && target.status === 'searching'
  const text = pulse ? 'Added. Your cart count just went up, so the piece is saved there.' : missing ? stop.fallback : stop.body
  const routePath = route?.split('?')[0]
  const offRoute = routePath !== undefined && routePath !== pathname
  const first = user?.name.trim().split(/\s+/)[0] ?? ''
  const isLast = stepIndex === steps.length - 1 && stopIndex === step.stops.length - 1

  // A step opens on its own page. It navigates when the step changes, not on every render, so wandering off stays possible.
  const openedFor = useRef('')
  useEffect(() => {
    if (!inStep || !route || !offRoute || openedFor.current === step.id) return
    openedFor.current = step.id
    navigate(route)
  }, [inStep, route, offRoute, step.id, navigate])

  // Focus the heading at every stop so a screen reader starts there and the keyboard is already in the card.
  useEffect(() => {
    if (inStep) headingRef.current?.focus({ preventScroll: true })
  }, [inStep, step.id, stopIndex])

  // Escape closes the tour unless a modal dialog (the filter panel, the spec sheet) is open and owns it.
  useEffect(() => {
    if (tour.phase !== 'step') return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      if (document.querySelector('[aria-modal="true"]')) return
      exit()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  })

  // The card's height decides how much of the screen is left for the target, so it is measured as the copy changes.
  useLayoutEffect(() => {
    const card = cardRef.current
    if (!card) return
    const measure = () => setCardHeight(Math.round(card.getBoundingClientRect().height))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(card)
    return () => observer.disconnect()
  }, [inStep, step.id, stopIndex])

  /** The tour's checkout is a sample (marked `tour=1`), so leaving the tour leaves it too. A real Buy now stays. */
  function leaveCheckout() {
    if (pathname === '/checkout' && new URLSearchParams(search).get('tour') === '1') navigate('/shop', { replace: true })
  }

  function exit() {
    tour.exitTour()
    leaveCheckout()
  }

  async function save(choice: OnboardingChoice) {
    if (!user?.email) return
    if ((await saveOnboardingStatus(user.email, choice)) === 'failed') toast.show({ kind: 'error', message: SAVE_FAILED_TOAST })
  }

  function skip() {
    tour.endTour()
    leaveCheckout()
    toast.show({ kind: 'info', message: SKIPPED_TOAST })
    void save('skipped')
  }

  function finish() {
    tour.finishTour()
    void save('completed')
  }

  function startShopping() {
    tour.endTour()
    navigate('/shop', { replace: true })
  }

  const doneModal = (
    <Modal
      open={tour.phase === 'done'}
      onClose={startShopping}
      title="You're Ready to Shop!"
      icon={<CheckIcon className="text-success" />}
      footer={
        <button type="button" onClick={startShopping} className={`${PRIMARY_BUTTON} w-full sm:ml-auto sm:w-auto`}>
          Start Shopping
        </button>
      }
    >
      <p className="pb-4 text-base leading-relaxed text-fg-muted">
        {first ? `Welcome to SilhouFit, ${first}.` : 'Welcome to SilhouFit.'} You have seen search, the cart, checkout and
        store pickup. Replay the tour any time from your profile.
      </p>
    </Modal>
  )

  if (tour.phase === 'welcome') {
    return (
      <MotionConfig reducedMotion="user">
        <Modal
          open
          onClose={exit}
          title="Welcome to SilhouFit"
          footer={
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" onClick={skip} className={SECONDARY_BUTTON}>
                Skip tour
              </button>
              <button type="button" onClick={() => tour.next(counts)} className={PRIMARY_BUTTON}>
                Start the tour
              </button>
            </div>
          }
        >
          <WelcomeMark />
          <p className="pb-4 text-base leading-relaxed text-fg-muted">
            {first ? `${first}, here is a` : 'Here is a'} quick tour of searching the shop, adding to your cart, checking out
            and picking up in store. It takes about a minute and nothing is ordered.
          </p>
        </Modal>
      </MotionConfig>
    )
  }

  if (tour.phase === 'done') {
    return (
      <MotionConfig reducedMotion="user">
        {doneModal}
        <Confetti />
      </MotionConfig>
    )
  }

  if (!inStep) return null

  const dock = box ? dockFor(box.top + box.height / 2, window.innerHeight) : null
  const vertical = dock ? (dock === 'top' ? 'items-start pt-[4.5rem]' : 'items-end pb-3') : 'items-center'
  const horizontal = box ? (box.left + box.width / 2 > window.innerWidth / 2 ? 'sm:justify-start' : 'sm:justify-end') : 'sm:justify-center'

  // The spotlight only covers the part of a tall target that the card leaves free, so the card never covers it.
  let hole: Box | null = box
  if (box && dock) {
    const free = freeArea(dock, cardHeight, window.innerHeight)
    const top = dock === 'top' ? Math.max(box.top, free.top + PAD) : box.top
    const bottom = dock === 'bottom' ? Math.min(box.top + box.height, free.bottom - PAD) : box.top + box.height
    hole = bottom > top ? { ...box, top, height: bottom - top } : null
  }

  return (
    <MotionConfig reducedMotion="user">
      <Spotlight box={hole} pulse={pulse} />
      <p role="status" className="sr-only">
        Step {stepIndex + 1} of {steps.length}: {step.title}
      </p>
      <div className={`pointer-events-none fixed inset-0 z-[76] flex justify-center px-3 ${vertical} ${horizontal} sm:px-4`}>
        <motion.div
          ref={cardRef}
          key={`${step.id}-${stopIndex}`}
          role="dialog"
          aria-modal="false"
          aria-labelledby={headingId}
          initial={{ opacity: 0, y: reduced ? 0 : 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DURATION.state, ease: EASE_OUT }}
          className="glass-card glass-elevated glass-dense pointer-events-auto flex max-h-[55svh] w-full flex-col rounded-2xl p-5 sm:w-96"
        >
          <div className="flex shrink-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-ui text-base text-fg-muted tabular-nums">
                Step {stepIndex + 1} of {steps.length}
              </p>
              <h2 id={headingId} ref={headingRef} tabIndex={-1} className="display mt-1 text-xl text-fg outline-none">
                {step.title}
              </h2>
            </div>
            <Tooltip label="Close tour">
              <button
                type="button"
                onClick={exit}
                aria-label="Close tour"
                className="-mt-1 -mr-2 flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-xl text-fg-muted hover:text-fg"
              >
                <XIcon />
              </button>
            </Tooltip>
          </div>
          <div aria-hidden="true" className="mt-3 flex shrink-0 gap-1">
            {steps.map((s, i) => (
              <span key={s.id} className={`h-1 flex-1 rounded-full ${i <= stepIndex ? 'bg-fg' : 'bg-fg/15'}`} />
            ))}
          </div>
          {/* Only the copy scrolls; the buttons below stay in view on short screens. */}
          <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
            {searching ? (
              <p className="flex items-center gap-2 text-base leading-relaxed text-fg-muted">
                <SpinnerIcon className="shrink-0" />
                Finding it on the page…
              </p>
            ) : (
              <p className="text-base leading-relaxed text-fg-muted">{text}</p>
            )}
            {missing && offRoute && !noSample && (
              <button type="button" onClick={() => navigate(route!)} className={`${SECONDARY_BUTTON} mt-4 w-full`}>
                Take me there
              </button>
            )}
          </div>
          <div className="mt-4 flex shrink-0 flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={skip}
              className="font-ui mr-auto min-h-11 cursor-pointer rounded-xl text-base font-semibold text-fg underline underline-offset-4 hover:text-chrome-strong"
            >
              Skip tour
            </button>
            <button
              type="button"
              onClick={() => tour.back(counts)}
              disabled={stepIndex === 0 && stopIndex === 0}
              className={`${SECONDARY_BUTTON} disabled:cursor-not-allowed disabled:opacity-50`}
            >
              Back
            </button>
            <button type="button" onClick={isLast ? finish : () => tour.next(counts)} className={PRIMARY_BUTTON}>
              {isLast ? 'Finish' : 'Next'}
            </button>
          </div>
        </motion.div>
      </div>
    </MotionConfig>
  )
}
