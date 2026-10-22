import { useReducedMotion } from 'motion/react'
import { lazy, Suspense, useEffect, useId, useReducer, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { BuildStep, ModelStep } from '../../components/body-setup/ChoiceSteps'
import {
  clearBodyDraft,
  draftReducer,
  lastStep,
  loadDraft,
  newDraft,
  saveDraft,
  type Draft,
} from '../../components/body-setup/draft'
import { MeasureStep } from '../../components/body-setup/MeasureStep'
import { fieldsFor, fromProfile, toPayload, warnings as crossChecks } from '../../components/body-setup/measurements'
import { ReviewStep } from '../../components/body-setup/ReviewStep'
import { SectionBoundary } from '../../components/body-setup/SectionBoundary'
import { STEP_BODY, STEP_BODY_PINNED, STEP_CARD_PINNED, STEP_FOOTER } from '../../components/body-setup/stepLayout'
import { StudioFlat, StudioFrame } from '../../components/body-setup/StudioFallback'
import { AlertIcon, XIcon } from '../../components/form/icons'
import { PROFILE_CARD, PROFILE_SHELL } from '../../components/profile/ProfileSkeleton'
import { useToast } from '../../components/toast/useToast'
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from '../../components/ui/buttonStyles'
import { Tooltip } from '../../components/ui/Tooltip'
import { useCurrentUser } from '../../hooks/useCurrentUser'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useMetaDescription } from '../../hooks/useMetaDescription'
import { useOnboarding } from '../../hooks/useOnboarding'
import { BodyProfileError, getBodyProfile, saveBodyProfile, type BodyProfileErrorKind } from '../../service/bodyProfile'

// Three.js stays out of every other chunk: the studio loads here, and its import starts as soon as the page mounts.
const loadStudio = () => import('../../components/body-setup/BodyStudio').then((m) => ({ default: m.BodyStudio }))
// A chunk that failed to load stays failed inside its lazy component, so Try again swaps in a fresh one.
let BodyStudio = lazy(loadStudio)

const META_DESCRIPTION =
  'Choose your avatar, pick your body build and enter your tape measurements so SilhouFit can recommend sizes and prepare AR try-on. Skip now and add them later.'

const SKIP_TOAST = 'You can add your measurements any time from your profile.'
// On a phone the studio takes about a quarter of what is visible (the keyboard shrinks it), so the field stays in view.
const STUDIO_SIZE = 'h-[clamp(7rem,calc(var(--vvh,100dvh)*0.26),20rem)] lg:sticky lg:top-4 lg:h-[calc(100svh-9rem)]'
const CARD = 'glass-card rounded-2xl p-4 lg:p-8'
const DISABLED_PRIMARY =
  'disabled:cursor-not-allowed disabled:border-line-strong disabled:bg-fg/10 disabled:text-fg-muted disabled:opacity-100! disabled:hover:border-line-strong disabled:hover:bg-fg/10'
const SKIP_LINK =
  'font-ui flex min-h-11 shrink-0 cursor-pointer items-center rounded-xl px-3 text-base font-semibold whitespace-nowrap text-fg underline underline-offset-4 hover:text-chrome-strong'
// A text field being typed in, where Escape belongs to the user: not a radio, checkbox or button.
const TEXT_ENTRY = 'textarea, input:not([type="radio"], [type="checkbox"], [type="button"], [type="submit"], [type="reset"], [type="range"])'

const SAVE_ERROR: Record<BodyProfileErrorKind, string> = {
  network: "We couldn't save your measurements. The connection dropped before the server replied. Your answers are kept on this page, so check your connection and retry.",
  'rate-limit': "We couldn't save your measurements. Our servers are limiting requests right now. Your answers are kept, so wait a minute and retry.",
  invalid: "We couldn't save your measurements. The server did not accept one of the values. Check each measurement on the review screen, then retry.",
  unauthorized: "We couldn't save your measurements. Your session has ended, so nothing was sent. Sign in again, then come back to this page; your answers are kept in this tab.",
  server: "We couldn't save your measurements. Something went wrong on our side. Your answers are kept, so retry in a moment.",
}

type Load = { status: 'loading' } | { status: 'error'; kind: BodyProfileErrorKind } | { status: 'ready'; draft: Draft }

function Skeleton({ onSkip }: { onSkip: () => void }) {
  return (
    <div className={PROFILE_SHELL}>
      <div className={PROFILE_CARD}>
        <div role="status" aria-label="Loading your measurements" className="animate-pulse">
          <div className="h-8 w-2/3 rounded-xl bg-line" />
          <div className="mt-4 h-6 w-full rounded-xl bg-line" />
          <div className="mt-2 h-6 w-1/2 rounded-xl bg-line" />
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <div aria-hidden="true" className="h-11 w-36 animate-pulse rounded-xl bg-line-strong" />
          <button type="button" onClick={onSkip} className={SECONDARY_BUTTON}>
            Skip for now
          </button>
        </div>
      </div>
    </div>
  )
}

/** The optional avatar and measurements setup: part of the first-time tour, and reachable any time from the profile. */
export function BodySetupPage() {
  useDocumentTitle('Body measurements and avatar setup — SilhouFit')
  useMetaDescription(META_DESCRIPTION)

  const user = useCurrentUser()
  const email = user?.email
  const navigate = useNavigate()
  const toast = useToast()
  const tour = useOnboarding()
  const [hadUser] = useState(user !== null)
  const [stored] = useState(() => (email ? loadDraft(email) : null))
  const [load, setLoad] = useState<Load>(stored ? { status: 'ready', draft: stored } : { status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [expired, setExpired] = useState(false)

  useEffect(() => {
    loadStudio().catch(() => {}) // the studio's own boundary reports a chunk that will not load
  }, [])

  // A draft in this tab wins; otherwise a saved profile pre-fills the setup for editing.
  useEffect(() => {
    if (!email || stored) return
    const controller = new AbortController()
    getBodyProfile({ signal: controller.signal }).then(
      (profile) => setLoad({ status: 'ready', draft: newDraft(email, profile ? fromProfile(profile) : {}) }),
      (error: unknown) => {
        if (controller.signal.aborted) return
        const kind = error instanceof BodyProfileError ? error.kind : 'server'
        if (kind === 'unauthorized') setExpired(true)
        else setLoad({ status: 'error', kind })
      },
    )
    return () => controller.abort()
  }, [email, stored, attempt])

  const inTour = tour.phase === 'body'
  const { finishTour } = tour

  /** Nothing is saved. In the tour this ends the body step; the address is left as it was. */
  function skip() {
    clearBodyDraft()
    toast.show({ kind: 'info', message: SKIP_TOAST })
    if (inTour) finishTour()
    navigate('/profile')
  }

  // Escape is Skip for now, unless a modal dialog is open and owns it, or the user is typing (a stray Escape would discard the draft).
  const skipRef = useRef(skip)
  useEffect(() => {
    skipRef.current = skip
  })
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape' || event.defaultPrevented || document.querySelector('[aria-modal="true"]')) return
      if (event.target instanceof Element && event.target.matches(TEXT_ENTRY)) return
      skipRef.current()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  if (!user) return <Navigate to={hadUser && !expired ? '/' : '/login?next=%2Fprofile%2Fmeasurements'} replace />
  if (expired) return <Navigate to="/login?next=%2Fprofile%2Fmeasurements" replace />

  if (load.status === 'loading') return <Skeleton onSkip={skip} />

  if (load.status === 'error') {
    return (
      <div className={PROFILE_SHELL}>
        <div role="alert" className={`${PROFILE_CARD} flex items-start gap-3`}>
          <AlertIcon size={20} className="mt-1 shrink-0 text-danger" />
          <div className="min-w-0">
            <h1 className="display text-2xl text-fg">We couldn&apos;t load your saved measurements.</h1>
            <p className="mt-3 max-w-xl text-base leading-relaxed text-fg-muted">
              {load.kind === 'network'
                ? 'The connection dropped before we got a response. Check your connection and try again.'
                : load.kind === 'rate-limit'
                  ? 'Our servers are limiting requests right now. Wait a minute, then try again.'
                  : 'Something went wrong on our side. Try again in a moment.'}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => {
                  setLoad({ status: 'loading' })
                  setAttempt((n) => n + 1)
                }}
                className={PRIMARY_BUTTON}
              >
                Try again
              </button>
              <button type="button" onClick={skip} className={SECONDARY_BUTTON}>
                Skip for now
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return <BodySetup initial={load.draft} inTour={inTour} onSkip={skip} onFinished={finishTour} />
}

interface BodySetupProps {
  initial: Draft
  inTour: boolean
  onSkip: () => void
  onFinished: () => void
}

function BodySetup({ initial, inTour, onSkip, onFinished }: BodySetupProps) {
  const [draft, dispatch] = useReducer(draftReducer, initial)
  const navigate = useNavigate()
  const toast = useToast()
  const reduced = useReducedMotion() ?? false
  const headingId = useId()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const [consent, setConsent] = useState(false)
  const [pending, setPending] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const { model, build, step, reviewing, entered } = draft
  const fields = fieldsFor(model)
  const total = 2 + fields.length + 1
  const current = reviewing ? total : step + 1
  const field = !reviewing && step >= 2 ? fields[step - 2] : null
  const checks = crossChecks(entered)

  useEffect(() => {
    saveDraft(draft)
  }, [draft])

  // The on-screen keyboard shrinks the visual viewport but not the layout one; on a phone the page is sized to what is visible.
  useEffect(() => {
    const root = rootRef.current
    const viewport = window.visualViewport
    if (!root || !viewport) return
    const fit = () => {
      root.style.setProperty('--vvh', `${viewport.height}px`)
      root.style.setProperty('--vvtop', `${viewport.offsetTop}px`)
    }
    fit()
    viewport.addEventListener('resize', fit)
    viewport.addEventListener('scroll', fit)
    return () => {
      viewport.removeEventListener('resize', fit)
      viewport.removeEventListener('scroll', fit)
    }
  }, [])

  // Retry from the toast must send what is on screen now, not what was there when the toast was raised.
  const finishRef = useRef<() => Promise<void>>(async () => {})

  // Each step opens with its heading focused, so a screen reader starts there and the keyboard is already in the panel.
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true })
  }, [step, reviewing])

  async function finish() {
    const payload = toPayload(entered, model, build)
    if (!payload || pending) return
    setPending(true)
    try {
      await saveBodyProfile(payload)
    } catch (error) {
      const kind = error instanceof BodyProfileError ? error.kind : 'server'
      toast.show({ kind: 'error', message: SAVE_ERROR[kind], action: { label: 'Retry', onClick: () => void finishRef.current() } })
      setPending(false)
      return
    }
    clearBodyDraft()
    toast.show({ kind: 'success', message: 'Measurements saved. SilhouFit can now recommend sizes.' })
    if (inTour) onFinished()
    navigate('/profile', { replace: true })
  }

  useEffect(() => {
    finishRef.current = finish
  })

  const go = (to: number) => dispatch({ type: 'step', step: to })

  const nav = (next: () => void, canNext: boolean, hint?: string) => (
    <div className={STEP_FOOTER}>
      {hint && !canNext && <p className="mb-3 text-sm text-fg-muted">{hint}</p>}
      <div className="flex flex-wrap justify-between gap-3">
        <button type="button" onClick={() => go(step - 1)} disabled={step === 0} className={`${SECONDARY_BUTTON} disabled:cursor-not-allowed disabled:opacity-50`}>
          Back
        </button>
        <button type="button" onClick={next} disabled={!canNext} className={`${PRIMARY_BUTTON} ${DISABLED_PRIMARY}`}>
          Next
        </button>
      </div>
    </div>
  )

  const panel = reviewing ? (
    <ReviewStep
      draft={draft}
      warnings={checks}
      consent={consent}
      pending={pending}
      headingRef={headingRef}
      onConsent={setConsent}
      onEditStep={go}
      onFinish={() => void finish()}
    />
  ) : step === 0 ? (
    <>
      <div className={STEP_BODY}>
        <ModelStep headingRef={headingRef} headingId={headingId} value={model} onChange={(m) => dispatch({ type: 'model', model: m })} />
      </div>
      {nav(() => go(1), model !== null, 'Choose a body model to continue.')}
    </>
  ) : step === 1 && model ? (
    <>
      <div className={`${STEP_BODY} ${STEP_BODY_PINNED}`}>
        <BuildStep headingRef={headingRef} headingId={headingId} model={model} value={build} onChange={(b) => dispatch({ type: 'build', build: b })} />
      </div>
      {nav(() => go(2), true)}
    </>
  ) : field && model ? (
    <MeasureStep
      field={field}
      fields={fields}
      model={model}
      unit={draft.unit}
      entered={entered}
      warnings={checks}
      headingRef={headingRef}
      onValue={(value) => dispatch({ type: 'set', field, value })}
      onUnit={(unit) => dispatch({ type: 'unit', unit })}
      onGo={(i) => go(2 + i)}
      onPrev={() => go(step - 1)}
      onNext={() => (step === lastStep(model) ? dispatch({ type: 'review', reviewing: true }) : go(step + 1))}
    />
  ) : null

  const stepArea = (
    <SectionBoundary
      fallback={(retry) => (
        <div role="alert" className="flex min-h-0 flex-1 flex-col justify-center">
          <h2 className="display flex items-start gap-3 text-xl text-fg">
            <AlertIcon size={20} className="mt-1 shrink-0 text-danger" />
            This step could not be shown.
          </h2>
          <p className="mt-3 text-base leading-relaxed text-fg-muted">
            Something went wrong on this screen, not with your answers: they are kept in this tab. Try again, or skip for now and
            add your measurements later from your profile.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" onClick={retry} className={PRIMARY_BUTTON}>
              Try again
            </button>
            <button type="button" onClick={onSkip} className={SECONDARY_BUTTON}>
              Skip for now
            </button>
          </div>
        </div>
      )}
    >
      {panel}
    </SectionBoundary>
  )

  return (
    <div
      ref={rootRef}
      className="mx-auto flex max-w-6xl flex-col px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 max-lg:fixed max-lg:inset-x-0 max-lg:top-[var(--vvtop,0px)] max-lg:h-[var(--vvh,100dvh)] max-lg:overflow-y-auto lg:min-h-svh lg:pt-4 lg:pb-8"
    >
      <header className="flex flex-wrap items-center gap-x-3">
        <h1 className="display text-xl text-fg max-sm:sr-only sm:flex-1">Avatar and measurements</h1>
        <p role="status" aria-live="polite" className="font-ui text-base text-fg-muted tabular-nums max-sm:flex-1 sm:order-last sm:mt-3 sm:w-full">
          Step {current} of {total}
        </p>
        <button type="button" onClick={onSkip} className={SKIP_LINK}>
          Skip for now
        </button>
        <Tooltip label="Close and skip">
          <button
            type="button"
            onClick={onSkip}
            aria-label="Close avatar setup and skip for now"
            className="-mr-2 flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-xl text-fg-muted hover:text-fg"
          >
            <XIcon />
          </button>
        </Tooltip>
      </header>
      <div aria-hidden="true" className="mt-1 flex shrink-0 gap-1 sm:mt-2">
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={`h-1 flex-1 rounded-full ${i < current ? 'bg-fg' : 'bg-fg/15'}`} />
        ))}
      </div>

      {step === 0 && !reviewing ? (
        <section aria-label="Choose a body model" className={`${CARD} mx-auto mt-3 flex w-full max-w-3xl flex-col max-lg:min-h-0 max-lg:flex-1 lg:mt-6`}>
          {stepArea}
        </section>
      ) : (
        <div className="mt-3 flex min-h-0 flex-1 flex-col gap-3 lg:mt-6 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] lg:items-start lg:gap-6">
          {/* On a phone the review list needs the room more than the preview does. */}
          <div className={`min-w-0 max-lg:shrink-0 ${reviewing ? 'max-lg:hidden' : ''}`}>
            <SectionBoundary
              fallback={(retry) => (
                <StudioFrame className={STUDIO_SIZE}>
                  <StudioFlat
                    focus={field}
                    unavailable={false}
                    onRetry={() => {
                      BodyStudio = lazy(loadStudio)
                      retry()
                    }}
                  />
                </StudioFrame>
              )}
            >
              <Suspense fallback={<div className={`animate-pulse rounded-2xl bg-line ${STUDIO_SIZE}`} />}>
                <BodyStudio model={model ?? 'male'} build={build} cm={entered} focus={field} reduced={reduced} className={STUDIO_SIZE} />
              </Suspense>
            </SectionBoundary>
            <p className="mt-1.5 text-sm leading-snug text-fg-muted lg:mt-2">
              Approximate preview. Enter your own tape measurements: the avatar does not measure you.
            </p>
          </div>
          <section aria-label="Measurements" className={`${CARD} flex min-h-0 min-w-0 flex-1 flex-col lg:flex-none ${!reviewing ? STEP_CARD_PINNED : ''}`}>
            {stepArea}
          </section>
        </div>
      )}
    </div>
  )
}
