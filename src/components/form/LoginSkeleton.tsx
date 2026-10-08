// Mirrors the page wrapper, h1 and single-column card so the swap does not shift layout.
// `short` is the /forgot-password card: paragraph, one field, two buttons.
export function LoginSkeleton({ short = false }: { short?: boolean }) {
  return (
    <div
      role="status"
      aria-label={short ? 'Loading password reset form' : 'Loading sign in form'}
      className="relative flex min-h-svh flex-col items-center justify-center px-4 py-14 sm:px-6"
    >
      {short && (
        <div className="mb-3 h-[calc(clamp(1.75rem,4vw,2.5rem)*0.95)] w-3/4 max-w-xs animate-pulse rounded-lg bg-line-strong" />
      )}
      <div className="glass-card glass-elevated w-full max-w-md animate-pulse rounded-2xl px-4 py-4 sm:px-5">
        {short ? (
          <div className="space-y-2.5">
            <div className="h-[3.6rem] rounded bg-line min-[360px]:h-[2.4rem]" />
            <div className="h-11 rounded-xl bg-line" />
            <div className="h-11 rounded-xl bg-line-strong" />
            <div className="h-11 rounded-xl bg-line" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-col gap-5 pb-2">
              <div className="flex flex-col items-center gap-2">
                <div className="size-16 rounded-2xl bg-line" />
                <div className="h-5 w-24 rounded bg-line" />
              </div>
              <div className="h-[calc(1.875rem*0.95)] w-40 rounded bg-line" />
            </div>
            <div className="h-11 rounded-xl bg-line" />
            <div className="h-11 rounded-xl bg-line" />
            <div className="flex h-11 items-center justify-between">
              <div className="h-5 w-32 rounded bg-line" />
              <div className="h-5 w-28 rounded bg-line" />
            </div>
            <div className="h-11 rounded-xl bg-line-strong" />
            <div className="h-4 rounded bg-line" />
            <div className="h-11 rounded-xl bg-line" />
            <div className="mx-auto h-11 w-56 max-w-full rounded-xl bg-line" />
          </div>
        )}
      </div>
    </div>
  )
}
