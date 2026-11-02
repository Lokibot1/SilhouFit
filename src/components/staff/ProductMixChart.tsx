import { motion } from 'motion/react'
import { useCallback, useState } from 'react'
import { useReveal } from '../../hooks/useReveal'
import { useSection } from '../../hooks/useSection'
import { DURATION, EASE_OUT, staggerDelay } from '../../motion/tokens'
import { fetchProductMix, type ProductMixItem } from '../../service/fetchStaffAnalytics'
import type { RequestOptions } from '../../service/simulateRequest'
import { donutSegments } from '../../utils/chartPath'
import { defaultFilter, describe, resolvePeriod } from '../../utils/period'
import { EmptyNote, SectionBody, StaffSection } from './StaffSection'
import { DONUT_SIZE, DonutSkeleton, LEGEND_LIST } from './StaffSkeleton'

// Literal class names, so Tailwind sees them. The last slot is the neutral "Other".
const SWATCH = ['bg-chart-1', 'bg-chart-2', 'bg-chart-3', 'bg-chart-4', 'bg-chart-5', 'bg-chart-other']
const STROKE = ['stroke-chart-1', 'stroke-chart-2', 'stroke-chart-3', 'stroke-chart-4', 'stroke-chart-5', 'stroke-chart-other']
const SLICES = 5

/** Units sold by category over the chosen period, as a donut with a legend. */
export function ProductMixChart() {
  const [filter, setFilter] = useState(defaultFilter)
  const { period, year } = filter
  const fetcher = useCallback((options: RequestOptions) => fetchProductMix({ ...options, filter: { period, year } }), [period, year])
  const section = useSection(fetcher)

  return (
    <StaffSection
      id="product-mix"
      title="Products sold"
      description={describe(filter, 'Units by category')}
      filter={{ name: 'Products sold', value: filter, onChange: setFilter }}
    >
      <SectionBody section={section} what="the products sold" skeleton={<DonutSkeleton />}>
        {(mix) =>
          mix.length === 0 ? (
            <EmptyNote>No products sold {resolvePeriod(filter).when}. The mix shows here once the first order is placed.</EmptyNote>
          ) : (
            <DonutFigure key={`${period}-${year}`} mix={mix} />
          )
        }
      </SectionBody>
    </StaffSection>
  )
}

/** Keeps the biggest categories and folds the rest into "Other", so the donut never needs more than five hues. */
// Half the ring's stroke width (6) and the visible gap between arcs, in the ring's 100-unit circumference.
const CAP = 3
const GAP = 1.5
// A round-capped dot is two caps wide, so a slice needs at least that much room plus the gap or it touches its neighbours.
const MIN_SHARE = (CAP * 2 + GAP) / 100 + 0.005

function withOther(mix: ProductMixItem[]) {
  if (mix.length <= SLICES) return mix
  const rest = mix.slice(SLICES - 1)
  return [...mix.slice(0, SLICES - 1), { category: 'Other', units: rest.reduce((sum, m) => sum + m.units, 0) }]
}

function DonutFigure({ mix }: { mix: ProductMixItem[] }) {
  const { ref, inView, reduced, fade } = useReveal<HTMLElement>()
  const slices = withOther(mix)
  const slot = (i: number) => (mix.length > SLICES && i === SLICES - 1 ? SLICES : i)
  const segments = donutSegments(slices.map((s) => s.units))
  // Where each arc is drawn: tiny slices are widened to MIN_SHARE and the rest give up that room. The labels keep the true shares.
  const small = segments.filter((segment) => segment.share < MIN_SHARE)
  const room = segments.length > 1 && small.length > 0 && small.length < segments.length ? (1 - small.length * MIN_SHARE) / (1 - small.reduce((sum, segment) => sum + segment.share, 0)) : 1
  const layout = donutSegments(segments.map((segment) => (room !== 1 && segment.share < MIN_SHARE ? MIN_SHARE : segment.share * room)))
  const total = slices.reduce((sum, s) => sum + s.units, 0)
  // Hover or keyboard focus previews a category; a click or tap pins it, which is how touch gets it.
  const [hover, setHover] = useState<number | null>(null)
  const [pinned, setPinned] = useState<number | null>(null)
  const active = hover ?? pinned
  const shown = active === null ? null : slices[active]
  const pin = (i: number) => setPinned((current) => (current === i ? null : i))
  const clearOnEscape = (event: React.KeyboardEvent) => {
    if (event.key !== 'Escape') return
    setPinned(null)
    setHover(null)
  }

  return (
    <motion.figure ref={ref} {...fade}>
      <div className={`relative ${DONUT_SIZE} mx-auto`}>
        <svg viewBox="0 0 42 42" aria-hidden="true" className="size-full">
          {layout.map((segment, i) => {
            // Round caps stick out by half the stroke at each end, so the arc is pulled in by that much plus a small gap.
            const round = layout.length > 1
            const length = round ? Math.max(0.01, segment.share * 100 - CAP * 2 - GAP) : segment.length
            const start = round ? segment.start + CAP + GAP / 2 : segment.start
            const dash = (arc: number) => `${arc} ${100 - arc}`
            return (
              <g
                key={slices[i].category}
                className={`cursor-pointer transition-opacity duration-200 motion-reduce:transition-none ${active !== null && active !== i ? 'opacity-30' : ''}`}
                onPointerEnter={(event) => event.pointerType === 'mouse' && setHover(i)}
                onPointerLeave={(event) => event.pointerType === 'mouse' && setHover(null)}
                onClick={() => pin(i)}
              >
              <motion.circle
                cx="21"
                cy="21"
                r="15.9155"
                fill="none"
                style={{ strokeWidth: active === i ? 7.5 : 6 }}
                transform="rotate(-90 21 21)"
                strokeDashoffset={-start}
                strokeLinecap={round ? 'round' : 'butt'}
                className={`${STROKE[slot(i)]} transition-[stroke-width] duration-200 motion-reduce:transition-none`}
                // A zero-length round-capped arc still paints a dot, so each arc fades in as it grows.
                initial={{ strokeDasharray: dash(reduced ? length : 0.01), opacity: reduced ? 1 : 0 }}
                animate={inView ? { strokeDasharray: dash(length), opacity: 1 } : undefined}
                transition={{ duration: DURATION.entrance, ease: EASE_OUT, delay: reduced ? 0 : staggerDelay(i) }}
              />
              </g>
            )
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="display text-3xl leading-none tabular-nums text-fg">{(shown?.units ?? total).toLocaleString('en-PH')}</span>
          <span className="max-w-28 truncate text-sm text-fg-muted">
            {shown && active !== null ? `${shown.category} · ${Math.round(segments[active].share * 100)}%` : 'units'}
          </span>
        </div>
      </div>
      <ul className={LEGEND_LIST}>
        {slices.map((slice, i) => (
          <li key={slice.category}>
            <button
              type="button"
              aria-pressed={pinned === i}
              onClick={() => pin(i)}
              onPointerEnter={(event) => event.pointerType === 'mouse' && setHover(i)}
              onPointerLeave={(event) => event.pointerType === 'mouse' && setHover(null)}
              onFocus={(event) => event.currentTarget.matches(':focus-visible') && setHover(i)}
              onBlur={() => setHover(null)}
              onKeyDown={clearOnEscape}
              className={`flex min-h-7 w-full cursor-pointer items-center gap-3 rounded-md px-1.5 text-left text-sm transition-colors duration-200 motion-reduce:transition-none ${active === i ? 'bg-fg/10' : 'hover:bg-fg/5'}`}
            >
              <span aria-hidden="true" className={`size-3 shrink-0 rounded-md ${SWATCH[slot(i)]}`} />
              <span className="min-w-0 flex-1 truncate text-fg">{slice.category}</span>
              <span className="w-14 text-right tabular-nums text-fg">{slice.units.toLocaleString('en-PH')}</span>
              <span className="w-12 text-right text-xs tabular-nums text-fg-muted">{Math.round(segments[i].share * 100)}%</span>
            </button>
          </li>
        ))}
      </ul>
    </motion.figure>
  )
}
