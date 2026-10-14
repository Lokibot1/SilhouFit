// Same wrapper and card as the Google callback result (icon, heading, two lines, one button) so the swap does not shift.
// Result copy wraps to different heights, so the card holds the tallest one (372px at 320px, 309px from 640px) and
// the button row sits at the bottom, which keeps the skeleton and every result the same height.
export const CALLBACK_SHELL = 'relative flex min-h-svh flex-col items-center justify-center px-4 py-14 max-[359px]:px-3 sm:px-6'
export const CALLBACK_CARD =
  'glass-card glass-elevated flex min-h-94 w-full max-w-md flex-col rounded-2xl px-4 py-4 wrap-break-word max-[359px]:px-3 sm:min-h-78 sm:px-6 sm:py-6'

export function CallbackSkeleton() {
  return (
    <div role="status" aria-label="Signing you in with Google" className={CALLBACK_SHELL}>
      <div className={`${CALLBACK_CARD} animate-pulse`}>
        <div className="size-10 rounded-full bg-line-strong" />
        <div className="mt-4 h-8 w-3/4 rounded-lg bg-line" />
        <div className="mt-2 space-y-2">
          <div className="h-5 rounded bg-line" />
          <div className="h-5 w-2/3 rounded bg-line" />
        </div>
        <div className="mt-auto pt-6">
          <div className="h-11 rounded-xl bg-line-strong" />
        </div>
      </div>
    </div>
  )
}
