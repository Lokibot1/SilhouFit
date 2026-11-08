import { useCurrentUser } from '../../hooks/useCurrentUser'
import { isStaffRole } from '../../utils/staffRole'
import { ShopHeader } from '../shop/ShopHeader'
import { KRAL_BLOCK, KRAL_PANEL, KRAL_WRAP } from './profileKral'

// Mirrors the loaded profile card (avatar, name, email, edit pencil, member since, Replay the tour, Sign out) so the swap does not shift it.
// Under 360px the name and email wrap to two lines, so their placeholders are two lines tall; under 340px the name takes three.
export const PROFILE_SHELL = 'mx-auto max-w-6xl px-6 pt-20 pb-24'
export const PROFILE_CARD = 'glass-card rounded-xl p-6 sm:p-8'

// A one-line bar sized by the text classes it is given (the non-breaking space gives it the line height).
const Bar = ({ className }: { className: string }) => (
  <div className={`rounded-xl bg-line ${className}`}>&nbsp;</div>
)

const KralBar = ({ className }: { className: string }) => <div className={`${KRAL_BLOCK} ${className}`}>&nbsp;</div>

/** The customer profile in the KRAL design: header, account panel, then the addresses and measurements panels. */
function KralProfileSkeleton() {
  return (
    <>
      <ShopHeader tone="kral" title="Your profile" crumb="Profile" />
      <div className={KRAL_WRAP}>
        <div role="status" aria-label="Loading your profile" className="animate-pulse">
          <div className={KRAL_PANEL}>
            <div className="flex items-center gap-4">
              <div className={`size-14 shrink-0 ${KRAL_BLOCK}`} />
              <div className="min-w-0 flex-1">
                <KralBar className="font-kral-mono w-1/2 text-base max-[359px]:h-[2lh]" />
              </div>
              <div className={`-mt-2 -mr-2 size-11 shrink-0 self-start ${KRAL_BLOCK}`} />
            </div>
            <div className="mt-6">
              <KralBar className="font-kral-mono w-24 text-base md:text-xs" />
              <KralBar className="font-kral-mono mt-1 w-40 text-base" />
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <div className={`h-11 w-40 ${KRAL_BLOCK}`} />
              <div className={`h-11 w-44 ${KRAL_BLOCK}`} />
              <div className={`h-11 w-32 ${KRAL_BLOCK}`} />
            </div>
          </div>
          <div className="mt-6 grid gap-6 lg:grid-cols-[24rem_minmax(0,1fr)]">
            <div className={`${KRAL_PANEL} lg:min-h-112`}>
              <KralBar className="font-kral-display w-2/3 text-xl leading-[1.05]" />
              <div className={`mt-4 h-44 ${KRAL_BLOCK}`} />
            </div>
            <div className={KRAL_PANEL}>
              <KralBar className="font-kral-display w-1/2 text-xl leading-[1.05]" />
              <div className={`mt-4 h-72 ${KRAL_BLOCK}`} />
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

export function ProfileSkeleton({ tone }: { tone?: 'kral' }) {
  // Staff see neither the edit pencil nor Replay the tour; a missing role counts as a customer.
  const customer = !isStaffRole(useCurrentUser()?.role)
  if (tone === 'kral') return <KralProfileSkeleton />
  return (
    <div className={PROFILE_SHELL}>
      <div role="status" aria-label="Loading your profile" className={`${PROFILE_CARD} animate-pulse`}>
        <div className="flex items-center gap-4">
          <div className="size-14 shrink-0 rounded-full bg-line-strong" />
          <div className="min-w-0 flex-1">
            <Bar className="display w-2/3 text-3xl min-[340px]:max-[359px]:h-[2lh] max-[339px]:h-[3lh] sm:text-4xl" />
            <Bar className="w-1/2 text-base max-[359px]:h-[2lh]" />
          </div>
          {customer && <div className="-mt-2 -mr-2 size-11 shrink-0 self-start rounded-xl bg-line-strong" />}
        </div>
        <div className="mt-6">
          <Bar className="w-24 text-sm" />
          <Bar className="w-40 text-base" />
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          {customer && <div className="h-11 w-40 rounded-xl bg-line-strong" />}
          <div className="h-11 w-28 rounded-xl bg-line-strong" />
        </div>
      </div>
    </div>
  )
}
