// Mirrors the page wrapper and single-column card (logo, heading, name pairs, email, consent, submit, divider, Google, footer) so the swap does not shift layout.
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
              <div className="mt-2 h-[1.2031rem] w-3/4 rounded bg-line" />
            </div>
          </div>
          <div className="grid gap-4 short:gap-3 min-[360px]:grid-cols-2">
            <div className="h-11 rounded-xl bg-line" />
            <div className="h-11 rounded-xl bg-line" />
            <div className="h-11 rounded-xl bg-line" />
            <div className="h-11 rounded-xl bg-line" />
          </div>
          <div className="h-11 rounded-xl bg-line" />
          <div className="flex h-11 items-center gap-2.5">
            <div className="size-5 shrink-0 rounded-md bg-line" />
            <div className="h-4 w-3/4 rounded bg-line" />
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
