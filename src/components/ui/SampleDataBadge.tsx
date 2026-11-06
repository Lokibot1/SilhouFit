import { Tooltip } from './Tooltip'

/** Marks a page or section that shows placeholder data until its backend is connected. `reason` says what is placeholder and what happens to it. */
export function SampleDataBadge({ reason }: { reason: string }) {
  return (
    <Tooltip label={reason} describe>
      <span tabIndex={0} className="font-ui inline-flex h-8 items-center rounded-full border border-line-strong px-3 text-sm font-medium text-fg-muted">
        Sample data
      </span>
    </Tooltip>
  )
}
