import { AuthHeadingSkeleton, AuthSkeletonShell } from './AuthSkeletonShell'

// Mirrors AuthSplit and the sign up form (heading, name pairs, email, password, confirm, consent, submit, divider, Google, footer) so the swap does not shift layout.
export function SignUpSkeleton() {
  return (
    <AuthSkeletonShell label="Loading sign up form">
      <div className="[&>*+*]:mt-4 short:[&>*+*]:mt-3 lg:[&>*+*]:mt-3">
        <AuthHeadingSkeleton subtitle="Save your fit profile and try clothes with AR." />
        <div className="grid gap-4 short:gap-3 min-[360px]:grid-cols-2 lg:gap-3">
          <div className="h-11 rounded-xl bg-line lg:pointer-fine:h-10" />
          <div className="h-11 rounded-xl bg-line lg:pointer-fine:h-10" />
          <div className="h-11 rounded-xl bg-line lg:pointer-fine:h-10" />
          <div className="h-11 rounded-xl bg-line lg:pointer-fine:h-10" />
        </div>
        <div className="h-11 rounded-xl bg-line lg:pointer-fine:h-10" />
        <div className="h-11 rounded-xl bg-line lg:pointer-fine:h-10" />
        <div className="h-11 rounded-xl bg-line lg:pointer-fine:h-10" />
        <div className="flex min-h-11 items-start gap-2.5 py-2 text-sm leading-snug sm:text-xs lg:min-h-0 lg:py-1">
          <div className="mt-px size-5 shrink-0 rounded-md bg-line" />
          <span>
            <span className="box-decoration-clone rounded bg-line text-transparent">
              I agree to the <span className="inline-block">Terms of Service</span> and{' '}
              <span className="inline-block">Privacy Policy</span>.
            </span>
          </span>
        </div>
        <div className="h-11 rounded-xl bg-line-strong lg:pointer-fine:h-10" />
        <div className="h-4 rounded bg-line" />
        <div className="h-11 rounded-xl bg-line lg:pointer-fine:h-10" />
        <div className="flex h-11 items-center justify-center lg:h-9">
          <div className="h-5 w-48 rounded bg-line" />
        </div>
      </div>
    </AuthSkeletonShell>
  )
}
