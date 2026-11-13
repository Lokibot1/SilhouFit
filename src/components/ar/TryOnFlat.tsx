import { KRAL_BODY } from '../profile/profileKral'
import { KRAL_SECONDARY } from '../shop/shopControls'

interface TryOnFlatProps {
  image: string
  alt: string
  /** True when WebGL is missing: there is nothing to retry. */
  unavailable: boolean
  /** True when the browser took the graphics context away (a busy GPU, another tab): the scene can be rebuilt, so it can be retried. */
  lost?: boolean
  /** The camera controls sit over the bottom of the stage: keep the content clear of them. */
  live?: boolean
  onRetry: () => void
}

/** The product photo in place of the 3D garment, for when it cannot be shown. The fit panel beside it keeps working. */
export function TryOnFlat({ image, alt, unavailable, lost = false, live = false, onRetry }: TryOnFlatProps) {
  return (
    <div className={`absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center ${live ? 'pb-20' : ''}`}>
      <img src={image} alt={alt} className="min-h-0 w-auto max-w-full flex-1 object-contain" />
      <p role="status" className={`${KRAL_BODY} max-w-xs`}>
        {lost
          ? 'The 3D preview stopped because the browser took back the graphics memory, usually when the device is busy. Try again to restart it. The fit details still work.'
          : unavailable
            ? 'The 3D preview is not available on this device. The fit details still work.'
            : "3D preview didn't load. Check your connection, then try again. The fit details still work."}
      </p>
      {(!unavailable || lost) && (
        <button type="button" aria-label="Try the 3D preview again" onClick={onRetry} className={KRAL_SECONDARY}>
          Try again
        </button>
      )}
    </div>
  )
}
