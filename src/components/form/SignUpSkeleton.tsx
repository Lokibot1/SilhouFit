// Mirrors the single-column card (heading, Google, divider, name pairs, email, phone, consent, buttons) so the swap does not shift layout.
export function SignUpSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading sign up form"
      className="relative flex min-h-svh items-center justify-center px-4 pt-14 pb-3 sm:px-6"
    >
      <div className="glass-card glass-elevated w-full max-w-md animate-pulse rounded-2xl px-4 py-4 sm:px-5">
        <div className="h-8 w-3/4 rounded-lg bg-line-strong sm:w-1/2" />
        <div className="mt-2 space-y-2.5">
          <div className="h-11 rounded-xl bg-line" />
          <div className="h-4 rounded bg-line" />
          <div className="grid gap-2.5 sm:grid-cols-2">
            <div className="h-11 rounded-xl bg-line" />
            <div className="h-11 rounded-xl bg-line" />
            <div className="h-11 rounded-xl bg-line" />
            <div className="h-11 rounded-xl bg-line" />
          </div>
          <div className="h-11 rounded-xl bg-line" />
          <div className="h-11 rounded-xl bg-line" />
          <div className="h-11 rounded-xl bg-line" />
          <div className="h-11 rounded-xl bg-line-strong" />
          <div className="h-11 rounded-xl bg-line" />
        </div>
      </div>
    </div>
  )
}
