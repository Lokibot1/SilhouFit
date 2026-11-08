import type { ReactNode } from 'react'
// Only the tokens and compact sizes. The page itself (and its shader) loads in a lazy chunk, so the skeleton stays light.
import '../auth/AuthSplit.css'
import '../auth/KralType.css'

/** Mirrors AuthSplit: the photo panel as a block, the form side flat in the theme canvas, the logo as a bar top right. */
export function AuthSkeletonShell({
  label,
  children,
  photo = true,
}: {
  label: string
  children: ReactNode
  /** false: no photo block (forgot password). */
  photo?: boolean
}) {
  return (
    <div
      role="status"
      aria-label={label}
      className={`kral-login kral-type relative grid min-h-svh bg-canvas ${photo ? 'lg:grid-cols-2' : 'kral-login--bare'}`}
    >
      {photo && <div aria-hidden="true" className="hidden animate-pulse bg-line lg:block" />}
      <div className="relative flex items-center justify-center overflow-hidden px-4 py-14 max-[359px]:px-3 sm:px-6 lg:py-16">
        <div
          aria-hidden="true"
          className="absolute top-5 right-4 h-5 w-44 animate-pulse rounded bg-line sm:right-6 sm:h-6 sm:w-53"
        />
        <div className="relative z-10 w-full max-w-md animate-pulse">{children}</div>
      </div>
    </div>
  )
}

/** The border-bottom heading block of AuthHeading. `wraps`: the title runs to two lines below 480px (reset your password). The subtitle is a transparent copy so the bar wraps like the real text. */
export function AuthHeadingSkeleton({ subtitle, wraps = false }: { subtitle: string; wraps?: boolean }) {
  return (
    <div className="border-b border-line-strong pb-4">
      <div className={`h-(--auth-h1) w-40 rounded bg-line ${wraps ? 'max-[479px]:h-[calc(var(--auth-h1)*2)]' : ''}`} />
      <p className="mt-2 text-sm leading-snug">
        <span className="box-decoration-clone rounded bg-line text-transparent">{subtitle}</span>
      </p>
    </div>
  )
}
