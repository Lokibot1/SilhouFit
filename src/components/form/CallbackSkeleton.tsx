import { AuthSkeletonShell } from './AuthSkeletonShell'

// Same block as the Google callback result (icon, heading, two lines, buttons) so the swap does not shift.
// Result copy wraps to different heights, so the block holds a fixed minimum and the button row sits at the bottom,
// which keeps the skeleton and every result the same height.
export const CALLBACK_BLOCK = 'flex min-h-100 flex-col sm:min-h-76'

export function CallbackSkeleton() {
  return (
    <AuthSkeletonShell label="Signing you in with Google" photo={false}>
      <div className={CALLBACK_BLOCK}>
        <div className="size-10 rounded-full bg-line-strong" />
        <div className="mt-4 w-3/4 rounded-md bg-line" style={{ height: 'calc(var(--auth-h1) * 2)' }} />
        <div className="mt-2 space-y-2">
          <div className="h-5 rounded bg-line" />
          <div className="h-5 w-2/3 rounded bg-line" />
        </div>
        <div className="mt-auto pt-6">
          <div className="h-11 rounded-xl bg-line-strong lg:pointer-fine:h-10" />
        </div>
      </div>
    </AuthSkeletonShell>
  )
}
