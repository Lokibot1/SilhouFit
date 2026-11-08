import type { ReactNode } from 'react'
import { SilhouetteMark } from '../landing/SilhouetteMark'
import { KRAL_SECONDARY } from '../shop/shopControls'
import type { Field } from './measurements'

// Where the fallback band sits on the flat silhouette, as a share of its height from the top.
const FALLBACK_BAND: Partial<Record<Field, number>> = {
  shoulders: 0.27, sleeve: 0.4, bust: 0.33, chest: 0.36, torso: 0.45, waist: 0.5, hips: 0.57, thigh: 0.68, inseam: 0.78, outseam: 0.68,
}

/** The studio's box. It lives apart from the studio so the page can draw it when the studio's own code fails to load. */
export function StudioFrame({ className = '', children }: { className?: string; children: ReactNode }) {
  return (
    <div
      role="group"
      aria-label="3D body preview"
      className={`relative overflow-hidden border border-kral-rule bg-kral-fg/5 ${className}`}
    >
      {children}
    </div>
  )
}

interface StudioFlatProps {
  focus: Field | null
  /** True when WebGL is missing or was lost: there is nothing to retry. */
  unavailable: boolean
  onRetry: () => void
}

/** The flat silhouette with a band on the measured part, for when the 3D body cannot be shown. */
export function StudioFlat({ focus, unavailable, onRetry }: StudioFlatProps) {
  const band = focus ? FALLBACK_BAND[focus] : undefined
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center">
      <div className="relative h-3/4 max-h-80">
        <SilhouetteMark className="h-full w-auto text-kral-muted" />
        {band !== undefined && (
          <span
            aria-hidden="true"
            className="absolute inset-x-0 h-[8%] -translate-y-1/2 border-y-2 border-kral-red-ink bg-kral-red/15"
            style={{ top: `${band * 100}%` }}
          />
        )}
      </div>
      <p role="status" className="font-kral-mono max-w-xs text-base text-kral-muted">
        {unavailable
          ? 'The 3D preview is not available on this device. You can still enter every measurement.'
          : 'The 3D body could not load. Check your connection, then try again. You can still enter every measurement.'}
      </p>
      {!unavailable && (
        <button type="button" onClick={onRetry} className={KRAL_SECONDARY}>
          Try again
        </button>
      )}
    </div>
  )
}
