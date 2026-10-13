// Mirrors the loaded profile card (avatar, name, email, member since, Sign out) so the swap does not shift it.
// Under 360px the name and email wrap to two lines, so their placeholders are two lines tall.
export const PROFILE_SHELL = 'mx-auto max-w-6xl px-6 pt-20 pb-24'
export const PROFILE_CARD = 'glass-card rounded-2xl p-6 sm:p-8'

// A one-line bar sized by the text classes it is given (the non-breaking space gives it the line height).
const Bar = ({ className }: { className: string }) => (
  <div className={`rounded-xl bg-line ${className}`}>&nbsp;</div>
)

export function ProfileSkeleton() {
  return (
    <div className={PROFILE_SHELL}>
      <div role="status" aria-label="Loading your profile" className={`${PROFILE_CARD} animate-pulse`}>
        <div className="flex items-center gap-4">
          <div className="size-14 shrink-0 rounded-full bg-line-strong" />
          <div className="min-w-0 flex-1">
            <Bar className="display w-2/3 text-3xl max-[359px]:h-[2lh] sm:text-4xl" />
            <Bar className="w-1/2 text-base max-[359px]:h-[2lh]" />
          </div>
        </div>
        <div className="mt-6">
          <Bar className="w-24 text-sm" />
          <Bar className="w-40 text-base" />
        </div>
        <div className="mt-6 h-11 w-28 rounded-xl bg-line-strong" />
      </div>
    </div>
  )
}
