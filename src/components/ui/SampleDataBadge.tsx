import { Tooltip } from './Tooltip'

/** Marks a page or section that shows placeholder data until its backend is connected. `reason` says what is placeholder and what happens to it. `tone="kral"` sets it square and mono for the KRAL pages. */
export function SampleDataBadge({ reason, tone }: { reason: string; tone?: 'kral' }) {
  const kral = tone === 'kral'
  return (
    <Tooltip label={reason} describe tone={tone}>
      <span
        tabIndex={0}
        className={
          kral
            ? 'kral-focus font-kral-mono inline-flex min-h-8 items-center border border-kral-muted px-3 text-base text-kral-muted uppercase md:text-xs md:tracking-[0.08em]'
            : 'font-ui inline-flex h-8 items-center rounded-full border border-line-strong px-3 text-sm font-medium text-fg-muted'
        }
      >
        Sample data
      </span>
    </Tooltip>
  )
}
