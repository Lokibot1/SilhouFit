import { useReducedMotion } from 'motion/react'
import { lazy, Suspense, useEffect, useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { BodyProfileError, getBodyProfile, type BodyProfile } from '../../service/bodyProfile'
import {
  BUILD_LABEL,
  FIELDS,
  fieldsFor,
  formatValue,
  fromProfile,
  MODEL_LABEL,
  SPECS,
  unitLabel,
} from '../body-setup/measurements'
import { SectionBoundary } from '../body-setup/SectionBoundary'
import { StudioFlat, StudioFrame } from '../body-setup/StudioFallback'
import { AlertIcon } from '../form/icons'
import { PRIMARY_BUTTON } from '../ui/buttonStyles'
import { IconEditButton } from '../ui/IconEditButton'
import { PROFILE_CARD } from './ProfileSkeleton'

// Three.js stays out of the profile's own chunk. A chunk that failed to load stays failed inside its lazy component, so Try again swaps in a fresh one.
const loadStudio = () => import('../body-setup/BodyStudio').then((m) => ({ default: m.BodyStudio }))
let BodyStudio = lazy(loadStudio)

// Fixed, so the avatar arriving does not move the list beside it.
const AVATAR_SIZE = 'h-72 sm:h-80'

type State =
  | { status: 'loading' }
  | { status: 'error'; kind: BodyProfileError['kind'] }
  | { status: 'ready'; profile: BodyProfile | null }

const ERROR_COPY: Record<BodyProfileError['kind'], string> = {
  network: 'The connection dropped before we got a response. Check your connection and try again.',
  'rate-limit': 'Our servers are limiting requests right now. Wait a minute, then try again.',
  unauthorized: 'Your session has ended. Sign out and sign in again, then try again.',
  invalid: 'The server did not accept the request. Try again in a moment.',
  server: 'Something went wrong on our side. Try again in a moment.',
}

/** The saved avatar and body measurements. They live on the account, so this owns its own load and retry. */
export function BodyMeasurements() {
  const headingId = useId()
  const [state, setState] = useState<State>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const reduced = useReducedMotion() ?? false

  useEffect(() => {
    const controller = new AbortController()
    getBodyProfile({ signal: controller.signal }).then(
      (profile) => setState({ status: 'ready', profile }),
      (error: unknown) => {
        if (controller.signal.aborted) return
        setState({
          status: 'error',
          kind: error instanceof BodyProfileError ? error.kind : 'server',
        })
      },
    )
    return () => controller.abort()
  }, [attempt])

  const profile = state.status === 'ready' ? state.profile : null
  const saved = profile ? fromProfile(profile) : null

  return (
    <section aria-labelledby={headingId} className={PROFILE_CARD}>
      <div className="flex items-start justify-between gap-3">
        <h2 id={headingId} className="display text-xl text-fg">
          Body measurements
        </h2>
        {saved && <IconEditButton to="/profile/measurements" label="Edit measurements" className="-mt-2 -mr-2" />}
      </div>

      {state.status === 'loading' && (
        <div role="status" aria-label="Loading your body measurements" className="mt-4 animate-pulse">
          <div className="h-6 w-2/3 rounded-xl bg-line" />
          <div className="mt-2 h-6 w-1/2 rounded-xl bg-line" />
          <div className="mt-4 h-11 w-48 rounded-xl bg-line-strong" />
        </div>
      )}

      {state.status === 'error' && (
        <div role="alert" className="mt-4">
          <p className="flex items-start gap-2 text-base leading-relaxed text-fg">
            <AlertIcon size={20} className="mt-0.5 shrink-0 text-danger" />
            <span>We couldn&apos;t load your body measurements. {ERROR_COPY[state.kind]}</span>
          </p>
          <button
            type="button"
            onClick={() => {
              setState({ status: 'loading' })
              setAttempt((n) => n + 1)
            }}
            className={`${PRIMARY_BUTTON} mt-4`}
          >
            Try again
          </button>
        </div>
      )}

      {state.status === 'ready' && !saved && (
        <>
          <p className="mt-2 max-w-xl text-base leading-relaxed text-fg-muted">
            You have not saved any measurements yet. Add them to pick your AR fitting avatar and get size
            recommendations.
          </p>
          <Link to="/profile/measurements" className={`${PRIMARY_BUTTON} mt-4 w-fit`}>
            Add your measurements
          </Link>
        </>
      )}

      {saved && (
        <div className="mt-4 grid gap-6 md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] md:items-start">
          <SectionBoundary
            fallback={(retry) => (
              <StudioFrame className={AVATAR_SIZE}>
                <StudioFlat
                  focus={null}
                  unavailable={false}
                  onRetry={() => {
                    BodyStudio = lazy(loadStudio)
                    retry()
                  }}
                />
              </StudioFrame>
            )}
          >
            <Suspense fallback={<div className={`animate-pulse rounded-2xl bg-line ${AVATAR_SIZE}`} />}>
              <BodyStudio
                model={saved.model ?? 'male'}
                build={saved.build}
                cm={saved.entered}
                focus={null}
                reduced={reduced}
                autoRotate={!reduced}
                controls={false}
                className={AVATAR_SIZE}
              />
            </Suspense>
          </SectionBoundary>
          {/* Beside the avatar the list is as tall as it and scrolls on its own; the avatar never moves. */}
          <div
            role="region"
            aria-label="Saved measurements"
            tabIndex={0}
            className="md:h-80 md:overflow-y-auto md:pr-2 md:overscroll-contain"
          >
            <dl className="grid gap-x-6 sm:grid-cols-2 md:grid-cols-1">
              {[
                {
                  key: 'model',
                  label: 'Body model',
                  value: saved.model ? MODEL_LABEL[saved.model] : 'Not chosen',
                },
                {
                  key: 'build',
                  label: 'Body build',
                  value: saved.build ? BUILD_LABEL[saved.build] : 'Not chosen',
                },
                ...FIELDS.filter((f) => fieldsFor(saved.model).includes(f) && saved.entered[f] !== undefined).map(
                  (f) => ({
                    key: f,
                    label: SPECS[f].label,
                    value: `${formatValue(f, saved.entered[f]!, 'metric')} ${unitLabel(f, 'metric')}`,
                  }),
                ),
              ].map((row) => (
                <div key={row.key} className="flex items-baseline justify-between gap-3 border-b border-line py-2">
                  <dt className="text-base text-fg-muted">{row.label}</dt>
                  <dd className="text-right text-base text-fg tabular-nums">{row.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      )}
    </section>
  )
}
