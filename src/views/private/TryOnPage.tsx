import { MotionConfig } from 'motion/react'
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useLocation, useParams, useSearchParams } from 'react-router-dom'
import { CameraOverlay } from '../../components/ar/CameraOverlay'
import { TryOnFlat } from '../../components/ar/TryOnFlat'
import { RowsSkeleton, STAGE_SIZE, TRY_ON_BODY, TRY_ON_GRID, TryOnPanelSkeleton } from '../../components/ar/TryOnSkeleton'
import { SectionBoundary } from '../../components/body-setup/SectionBoundary'
import { fromProfile, SPECS, type Entered } from '../../components/body-setup/measurements'
import { AlertIcon, CameraIcon, PaletteIcon, RulerIcon } from '../../components/form/icons'
import { NearViewport } from '../../components/NearViewport'
import { KRAL_BLOCK, KRAL_BODY, KRAL_LABEL, KRAL_PANEL } from '../../components/profile/profileKral'
import { ShopHeader } from '../../components/shop/ShopHeader'
import { KRAL_PRIMARY, KRAL_SECONDARY } from '../../components/shop/shopControls'
import { KRAL_OPTION } from '../../components/shop/SpecSheet'
import { Tooltip } from '../../components/ui/Tooltip'
import type { Product } from '../../data/products'
import { useCamera } from '../../hooks/useCamera'
import { useCurrentUser } from '../../hooks/useCurrentUser'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useMetaDescription } from '../../hooks/useMetaDescription'
import { useProduct } from '../../hooks/useProducts'
import { useSizeGuide } from '../../hooks/useSizeGuide'
import { BodyProfileError, getBodyProfile } from '../../service/bodyProfile'
import { useProductSizing } from '../../service/customSizings'
import type { ProductVariant } from '../../service/fetchProductList'
import { compareFit, recommendSize, type FitLevel, type FitRegion } from '../../utils/arFit'
import { canTryOn, garmentScale } from '../../utils/arGarment'

// Three.js stays out of every other chunk: the stage loads here, and its import starts as soon as the page mounts.
const loadStage = () => import('../../components/ar/TryOnStage').then((m) => ({ default: m.TryOnStage }))
// A chunk that failed to load stays failed inside its lazy component, so Try again swaps in a fresh one.
let TryOnStage = lazy(loadStage)

const META_DESCRIPTION =
  'Try this piece on in AR with SilhouFit: see how each size fits your saved measurements, switch colours and preview the shirt over your camera on this device.'
const NO_VARIANTS: ProductVariant[] = []
const LEGEND = 'font-kral-mono text-base font-medium text-kral-fg uppercase md:text-xs md:tracking-[0.08em]'
const LEVEL: Record<FitLevel, string> = { 'too-tight': 'Too tight', fitted: 'Fitted', regular: 'Regular fit', loose: 'Loose fit', oversized: 'Oversized' }
const REGION: Record<FitRegion, string> = { chest: 'Chest', waist: 'Waist', shoulders: 'Shoulders', sleeve: 'Sleeve' }
const BODY_FIELDS = ['chest', 'shoulders', 'sleeve', 'waist'] as const

type Profile = { status: 'loading' } | { status: 'error' } | { status: 'ready'; entered: Entered | null }

const ease = (cm: number) => `${cm > 0 ? '+' : ''}${cm.toFixed(1)} cm`

function Failure({ title, body, onRetry, back }: { title: string; body: string; onRetry?: () => void; back?: string }) {
  return (
    <div role="alert" className={`${KRAL_PANEL} flex items-start gap-3`}>
      <AlertIcon size={20} className="mt-1 shrink-0 text-kral-red-ink" />
      <div className="min-w-0">
        <h2 className="font-kral-display text-lg leading-[1.05] font-extrabold text-kral-fg uppercase">{title}</h2>
        <p className={`${KRAL_BODY} mt-2 max-w-xl`}>{body}</p>
        <div className="mt-4 flex flex-wrap gap-3">
          {onRetry && (
            <button type="button" onClick={onRetry} className={KRAL_PRIMARY}>
              Try again
            </button>
          )}
          {back && (
            <Link to={back} className={KRAL_SECONDARY}>
              Back to shop
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}

/** The signed-in customer's try-on of an AR-ready shirt: the model scaled to a size over an optional camera feed, and how that size fits. */
export function TryOnPage() {
  const { id } = useParams()
  const { pathname, search } = useLocation()
  const [query] = useSearchParams()
  const user = useCurrentUser()
  const signedIn = user !== null
  const [hadUser] = useState(signedIn)
  const products = useProduct(id)
  const product = products.status === 'success' ? products.product : undefined
  const missing = products.status === 'missing'

  useDocumentTitle(product ? `Try on ${product.name} in AR — SilhouFit` : missing ? 'Piece not found — SilhouFit' : 'Loading the try-on — SilhouFit')
  useMetaDescription(META_DESCRIPTION)

  const loginNext = `/login?next=${encodeURIComponent(pathname + search)}`
  const [profile, setProfile] = useState<Profile>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [expired, setExpired] = useState(false)

  useEffect(() => {
    if (!signedIn) return
    const controller = new AbortController()
    getBodyProfile({ signal: controller.signal }).then(
      (saved) => setProfile({ status: 'ready', entered: saved ? fromProfile(saved).entered : null }),
      (error: unknown) => {
        if (controller.signal.aborted) return
        if (error instanceof BodyProfileError && error.kind === 'unauthorized') setExpired(true)
        else setProfile({ status: 'error' })
      },
    )
    return () => controller.abort()
  }, [signedIn, attempt])

  const tryable = !!product && canTryOn(product)
  useEffect(() => {
    if (tryable) loadStage().catch(() => {}) // the stage's own boundary reports a chunk that will not load
  }, [tryable])
  const guide = useSizeGuide(product?.category ?? 'Shirt', product?.variants ?? NO_VARIANTS, tryable, useProductSizing(product?.id))
  const camera = useCamera()
  const [pickedSize, setPickedSize] = useState<string | null>(null)
  const [pickedColor, setPickedColor] = useState<string | null>(null)

  const entered = profile.status === 'ready' ? profile.entered : null
  // Smallest first; a size with no measurements cannot be tried on.
  const sizes = useMemo(() => guide.guide.rows.filter((r) => r.source !== 'none'), [guide.guide])
  const recommended = useMemo(() => (entered ? recommendSize(entered, sizes) : null), [entered, sizes])
  const row = sizes.find((r) => r.size === pickedSize) ?? sizes.find((r) => r.size === recommended) ?? sizes[0]
  const size = row?.size
  const colour = product?.colors.find((c) => c.name === pickedColor) ?? product?.colors.find((c) => c.name.toLowerCase() === query.get('color')?.toLowerCase()) ?? product?.colors[0]

  const scale = useMemo(() => garmentScale(row?.values ?? {}), [row])
  const largest = useMemo(() => {
    const all = sizes.map((r) => garmentScale(r.values))
    return { x: Math.max(1, ...all.map((s) => s.x)), y: Math.max(1, ...all.map((s) => s.y)), z: Math.max(1, ...all.map((s) => s.z)) }
  }, [sizes])
  const fit = entered && row ? compareFit(entered, row.values) : null

  if (!user) return <Navigate to={hadUser && !expired ? '/' : loginNext} replace />
  if (expired) return <Navigate to={loginNext} replace />

  const back = product ? `/shop/${product.slug ?? product.id}` : '/shop'
  const summary = size ? `Size ${size}${colour ? ` in ${colour.name}` : ''}${fit?.overall ? `: ${LEVEL[fit.overall].toLowerCase()}` : ''}` : ''

  function stage(item: Product) {
    return (
      <div
        role="group"
        aria-label="AR try-on preview"
        data-size={size ?? ''}
        data-scale={`${scale.x.toFixed(3)},${scale.y.toFixed(3)},${scale.z.toFixed(3)}`}
        className={`relative overflow-hidden border border-kral-rule bg-kral-fg/5 ${STAGE_SIZE}`}
      >
        <video
          ref={camera.videoRef}
          playsInline
          muted
          autoPlay
          aria-label="Your camera feed"
          className={`absolute inset-0 size-full -scale-x-100 object-cover ${camera.state === 'live' ? '' : 'invisible'}`}
        />
        <NearViewport className="absolute inset-0">
          <SectionBoundary
            fallback={(retry) => (
              <TryOnFlat
                image={item.image}
                alt={item.alt}
                unavailable={false}
                onRetry={() => {
                  TryOnStage = lazy(loadStage)
                  retry()
                }}
              />
            )}
          >
            <Suspense fallback={<div className="absolute inset-0 animate-pulse" />}>
              <TryOnStage colorHex={colour?.hex ?? '#ffffff'} scale={scale} largest={largest} image={item.image} alt={item.alt} />
            </Suspense>
          </SectionBoundary>
        </NearViewport>
        <p className="font-kral-mono absolute top-3 left-3 flex items-center gap-2 bg-kral-bg/85 px-3 py-1.5 text-base text-kral-fg backdrop-blur-sm">
          <CameraIcon size={16} />
          Preview: not tracked to your body yet
        </p>
        <CameraOverlay camera={camera} />
      </div>
    )
  }

  function panel(item: Product) {
    return (
      <div className="flex min-w-0 flex-col gap-6">
        <p role="status" aria-live="polite" className="font-kral-mono min-h-6 text-base font-medium text-kral-fg">
          {summary}
        </p>

        <fieldset>
          <legend className={`${LEGEND} float-left w-full p-0`}>
            <RulerIcon size={16} className="mr-2 -mt-0.5 inline align-middle" />
            Size{size && <span className="font-normal text-kral-muted">: {size}</span>}
          </legend>
          <div className="clear-both pt-3">
            {guide.loading ? (
              <RowsSkeleton label="Loading the sizes" rows={1} />
            ) : guide.failed ? (
              <Failure
                title="The sizes did not load"
                body="The request for this piece's size measurements failed, most likely because the connection dropped. Check your connection, then try again."
                onRetry={guide.retry}
              />
            ) : !guide.available ? (
              <p className={KRAL_BODY}>This piece has no size measurements yet, so the shirt is shown at its standard size.</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  {guide.guide.rows.map((r) => {
                    const none = r.source === 'none'
                    const option = (
                      <label className="relative">
                        <input
                          type="radio"
                          name="try-on-size"
                          value={r.size}
                          checked={size === r.size}
                          disabled={none}
                          onChange={() => setPickedSize(r.size)}
                          className="peer sr-only"
                        />
                        <span data-checked={size === r.size} className={`${KRAL_OPTION} min-w-11 tabular-nums`}>
                          {r.size}
                          {none && <span className="sr-only"> (no measurements)</span>}
                        </span>
                      </label>
                    )
                    return none ? (
                      <Tooltip key={r.size} tone="kral" label="No measurements for this size">
                        {option}
                      </Tooltip>
                    ) : (
                      <span key={r.size}>{option}</span>
                    )
                  })}
                </div>
                {recommended && <p className={`${KRAL_LABEL} mt-2`}>Recommended for your measurements: {recommended}</p>}
              </>
            )}
          </div>
        </fieldset>

        {item.colors.length > 0 && (
          <fieldset>
            <legend className={`${LEGEND} float-left w-full p-0`}>
              <PaletteIcon size={16} className="mr-2 -mt-0.5 inline align-middle" />
              Colour{colour && <span className="font-normal text-kral-muted">: {colour.name}</span>}
            </legend>
            <div className="clear-both flex flex-wrap gap-2 pt-3">
              {item.colors.map((c) => (
                <label key={c.name} className="relative">
                  <input type="radio" name="try-on-color" value={c.name} checked={colour?.name === c.name} onChange={() => setPickedColor(c.name)} className="peer sr-only" />
                  <span data-checked={colour?.name === c.name} className={KRAL_OPTION}>
                    <span aria-hidden="true" className="size-4 border border-kral-muted" style={{ backgroundColor: c.hex }} />
                    {c.name}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <section aria-labelledby="try-on-fit" className={KRAL_PANEL}>
          <h2 id="try-on-fit" className={LEGEND}>
            How it fits
          </h2>
          <div className="mt-3">
            {profile.status === 'loading' || guide.loading ? (
              <RowsSkeleton label="Loading the fit" rows={4} height="h-6" />
            ) : profile.status === 'error' ? (
              <Failure
                title="Your measurements did not load"
                body="The request for your saved measurements failed, most likely because the connection dropped. Check your connection, then try again."
                onRetry={() => {
                  setProfile({ status: 'loading' })
                  setAttempt((n) => n + 1)
                }}
              />
            ) : !fit || Object.keys(fit.regions).length === 0 ? (
              <p className={KRAL_BODY}>Add your measurements to see how each size fits.</p>
            ) : (
              <table className="font-kral-mono w-full text-base text-kral-fg">
                <caption className="sr-only">Fit of size {size} by body area</caption>
                <thead className="sr-only">
                  <tr>
                    <th scope="col">Area</th>
                    <th scope="col">Fit</th>
                    <th scope="col">Ease</th>
                  </tr>
                </thead>
                <tbody>
                  {(Object.keys(REGION) as FitRegion[]).flatMap((region) => {
                    const r = fit.regions[region]
                    return r
                      ? [
                          <tr key={region} className="border-b border-kral-rule last:border-0">
                            <th scope="row" className="py-2 pr-3 text-left font-normal text-kral-muted">
                              {REGION[region]}
                            </th>
                            <td className="py-2 pr-3 text-left">{LEVEL[r.level]}</td>
                            <td className="py-2 text-right tabular-nums">{ease(r.easeCm)}</td>
                          </tr>,
                        ]
                      : []
                  })}
                </tbody>
              </table>
            )}
          </div>
        </section>

        <section aria-labelledby="try-on-body" className={KRAL_PANEL}>
          <h2 id="try-on-body" className={LEGEND}>
            Your measurements
          </h2>
          {entered && (
            <dl className="font-kral-mono mt-3 text-base text-kral-fg">
              {BODY_FIELDS.map((field) => (
                <div key={field} className="flex justify-between gap-3 border-b border-kral-rule py-2 last:border-0">
                  <dt className="text-kral-muted">{SPECS[field].label}</dt>
                  <dd className="text-right tabular-nums">{entered[field] === undefined ? 'Not set' : `${entered[field]} cm`}</dd>
                </div>
              ))}
            </dl>
          )}
          {profile.status === 'ready' && !entered && <p className={`${KRAL_BODY} mt-3`}>You have not saved any measurements yet.</p>}
          <Link to="/profile/measurements" className={`${KRAL_SECONDARY} mt-4 w-fit`}>
            {entered ? 'Edit measurements' : 'Add measurements'}
          </Link>
        </section>

        <Link to={back} className={`${KRAL_SECONDARY} w-fit`}>
          Back to product
        </Link>
      </div>
    )
  }

  return (
    <MotionConfig reducedMotion="user">
      <ShopHeader tone="kral" title="AR try-on" crumb={product?.name ?? 'AR try-on'} compact />
      <div className={TRY_ON_BODY}>
        {products.status === 'loading' && (
          <div className={TRY_ON_GRID}>
            <div aria-hidden="true" className={`animate-pulse ${KRAL_BLOCK} ${STAGE_SIZE}`} />
            <TryOnPanelSkeleton />
          </div>
        )}
        {products.status === 'error' && (
          <Failure
            title="This piece did not load"
            body="The request for this piece failed, most likely because the connection dropped or the service is briefly unavailable. Check your connection, then try again."
            onRetry={products.retry}
            back="/shop"
          />
        )}
        {missing && (
          <div className={KRAL_PANEL}>
            <h2 className="font-kral-display text-xl leading-[1.05] font-extrabold text-kral-fg uppercase sm:text-2xl">This piece is no longer in the catalogue</h2>
            <p className={`${KRAL_BODY} mt-3 max-w-xl`}>It may have sold out for good or the link may be out of date. The shop has the current pieces.</p>
            <Link to="/shop" className={`${KRAL_PRIMARY} mt-6 w-fit`}>
              Browse the shop
            </Link>
          </div>
        )}
        {product && !tryable && (
          <div className={KRAL_PANEL}>
            <h2 className="font-kral-display text-xl leading-[1.05] font-extrabold text-kral-fg uppercase sm:text-2xl">AR try-on isn&apos;t available for this piece yet</h2>
            <p className={`${KRAL_BODY} mt-3 max-w-xl`}>Only some shirts have a 3D model so far. You can still check the sizes and measurements on the product page.</p>
            <Link to={back} className={`${KRAL_PRIMARY} mt-6 w-fit`}>
              Back to product
            </Link>
          </div>
        )}
        {product && tryable && (
          <div className={TRY_ON_GRID}>
            {stage(product)}
            {panel(product)}
          </div>
        )}
      </div>
    </MotionConfig>
  )
}
