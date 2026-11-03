import { AuthHeadingSkeleton, AuthSkeletonShell } from './AuthSkeletonShell'

// Sign in mirrors AuthSplit and the login form so the swap does not shift layout.
// `short` is the /forgot-password card: paragraph, one field, two buttons.
export function LoginSkeleton({ short = false }: { short?: boolean }) {
  if (!short) {
    return (
      <AuthSkeletonShell label="Loading sign in form">
        <div className="[&>*+*]:mt-4 short:[&>*+*]:mt-3 lg:[&>*+*]:mt-3">
          <AuthHeadingSkeleton subtitle="Sign in your account." />
          <div className="h-11 rounded-xl bg-line lg:h-10" />
          <div className="h-11 rounded-xl bg-line lg:h-10" />
          <div className="flex h-11 items-center justify-between max-[318px]:h-22 lg:h-9">
            <div className="h-5 w-32 rounded bg-line" />
            <div className="h-5 w-28 rounded bg-line" />
          </div>
          <div className="h-11 rounded-xl bg-line-strong lg:h-10" />
          <div className="h-4 rounded bg-line" />
          <div className="h-11 rounded-xl bg-line lg:h-10" />
          <div className="mx-auto h-11 w-56 max-w-full rounded-xl bg-line max-[281px]:h-16 lg:h-9" />
        </div>
      </AuthSkeletonShell>
    )
  }

  return (
    <div
      role="status"
      aria-label="Loading password reset form"
      className="relative flex min-h-svh flex-col items-center justify-center px-4 py-14 max-[359px]:px-3 sm:px-6"
    >
      <div className="mb-3 h-[calc(clamp(1.75rem,4vw,2.5rem)*0.95)] w-3/4 max-w-xs animate-pulse rounded-md bg-line-strong" />
      <div className="glass-card glass-elevated w-full max-w-md animate-pulse rounded-xl px-4 py-4 max-[359px]:px-3 sm:px-6 sm:py-6 short:py-4">
        <div className="space-y-2.5">
          <div className="h-[3.6rem] rounded bg-line min-[372px]:h-[2.4rem]" />
          <div className="h-11 rounded-xl bg-line" />
          <div className="h-11 rounded-xl bg-line-strong" />
          <div className="h-11 rounded-xl bg-line" />
        </div>
      </div>
    </div>
  )
}
