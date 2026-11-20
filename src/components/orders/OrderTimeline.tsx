import { formatOrderTime } from '../../utils/format'
import type { StepState, TimelineStep } from '../../utils/orders'
import { CheckIcon, XIcon } from '../form/icons'

const STATE_TEXT: Record<StepState, string> = { done: 'Done', current: 'Current step', upcoming: 'Not yet', cancelled: 'Cancelled' }

function Marker({ state }: { state: StepState }) {
  const base = 'flex size-4 shrink-0 items-center justify-center border-2'
  if (state === 'done') return <span aria-hidden="true" className={`${base} border-kral-fg bg-kral-fg text-kral-bg`}><CheckIcon size={16} className="size-3" /></span>
  if (state === 'cancelled') return <span aria-hidden="true" className={`${base} border-kral-muted bg-kral-muted text-kral-bg`}><XIcon size={16} className="size-3" /></span>
  if (state === 'current') return <span aria-hidden="true" className={`${base} border-kral-fg`}><span className="size-1.5 bg-kral-fg" /></span>
  return <span aria-hidden="true" className={`${base} border-kral-muted`} />
}

/**
 * An order's journey with the latest step first: a list down the page, across it (oldest on the left) only when its own column is wide enough for six steps.
 * Steps already behind the order are dimmed so the current one stands out. Each step says its state in words for screen readers.
 */
export function OrderTimeline({ steps }: { steps: TimelineStep[] }) {
  const latestFirst = [...steps].reverse()
  return (
    <div className="@container">
      <ol aria-label="Order progress" className="@4xl:flex @4xl:flex-row-reverse">
        {latestFirst.map((step, i) => {
          const last = i === latestFirst.length - 1
          const muted = step.state === 'upcoming' || step.state === 'done'
          return (
            <li key={step.key} aria-current={step.state === 'current' ? 'step' : undefined} className="grid grid-cols-[1rem_1fr] gap-x-3 @4xl:flex-1 @4xl:grid-cols-1 @4xl:gap-y-2">
              <span className="flex flex-col items-center @4xl:flex-row-reverse">
                <span className={step.state === 'done' ? 'opacity-50' : undefined}>
                  <Marker state={step.state} />
                </span>
                {!last && <span aria-hidden="true" className={`my-1 w-px flex-1 @4xl:mx-1 @4xl:my-0 @4xl:h-px @4xl:w-auto ${step.state === 'done' || step.state === 'current' ? 'bg-kral-muted' : 'bg-kral-muted/50'}`} />}
              </span>
              <div className={`min-w-0 ${last ? '' : 'pb-5 @4xl:pb-0 @4xl:pr-3'} font-kral-mono`}>
                <p className={`text-base leading-tight font-medium uppercase md:text-sm ${muted ? 'text-kral-muted' : 'text-kral-fg'}`}>
                  {step.label}
                  <span className="sr-only">. {STATE_TEXT[step.state]}.</span>
                </p>
                {step.at && <p className="mt-0.5 text-base text-kral-muted tabular-nums md:text-xs">{formatOrderTime(step.at)}</p>}
                {step.note && <p className="mt-0.5 text-base break-words text-kral-muted md:text-sm">{step.note}</p>}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
