// Mirrors the page wrapper and single-column card (logo, heading, name pairs, email, password, checklist, consent, submit, divider, Google, footer) so the swap does not shift layout.
export function SignUpSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading sign up form"
      className="relative flex min-h-svh flex-col items-center justify-center px-4 py-14 max-[359px]:px-3 sm:px-6"
    >
      <div className="glass-card glass-elevated w-full max-w-md animate-pulse rounded-2xl px-4 py-4 max-[359px]:px-3 sm:px-6 sm:py-6 short:py-4">
        <div className="[&>*+*]:mt-4 short:[&>*+*]:mt-3">
          <div className="flex flex-col gap-5 pb-2 short:gap-3">
            <div className="flex flex-col items-center gap-2 shortest:hidden">
              <div className="size-16 rounded-2xl bg-line short:size-12" />
              <div className="h-5 w-24 rounded bg-line" />
            </div>
            <div>
              <div className="h-[calc(1.875rem*0.95)] w-40 rounded bg-line sm:h-[calc(2.25rem*0.95)]" />
              {/* Transparent copy of the real text, so the bars wrap at the same widths as the form. */}
              <p className="mt-2 text-sm leading-snug">
                <span className="box-decoration-clone rounded bg-line text-transparent">
                  Save your fit profile and try clothes with AR.
                </span>
              </p>
            </div>
          </div>
          <div className="grid gap-4 short:gap-3 min-[360px]:grid-cols-2">
            <div className="h-11 rounded-xl bg-line" />
            <div className="h-11 rounded-xl bg-line" />
            <div className="h-11 rounded-xl bg-line" />
            <div className="h-11 rounded-xl bg-line" />
          </div>
          <div className="h-11 rounded-xl bg-line" />
          <div className="h-11 rounded-xl bg-line" />
          {/* Password checklist: strength row + five one-per-row requirements, two columns from sm. */}
          <div className="h-[194px] rounded-xl bg-line sm:h-[146px]" />
          <div className="flex min-h-11 items-start gap-2.5 py-2 text-sm leading-snug">
            <div className="mt-px size-5 shrink-0 rounded-md bg-line" />
            <span>
              <span className="box-decoration-clone rounded bg-line text-transparent">
                I agree to the <span className="inline-block">Terms of Service</span> and{' '}
                <span className="inline-block">Privacy Policy</span>.
              </span>
            </span>
          </div>
          <div className="h-11 rounded-xl bg-line-strong" />
          <div className="h-4 rounded bg-line" />
          <div className="h-11 rounded-xl bg-line" />
          <div className="flex h-11 items-center justify-center">
            <div className="h-5 w-48 rounded bg-line" />
          </div>
        </div>
      </div>
    </div>
  )
}
