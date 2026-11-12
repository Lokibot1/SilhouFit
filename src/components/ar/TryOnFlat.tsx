import { KRAL_BODY } from '../profile/profileKral'
import { KRAL_SECONDARY } from '../shop/shopControls'

interface TryOnFlatProps {
  image: string
  alt: string
  /** True when WebGL is missing or was lost: there is nothing to retry. */
  unavailable: boolean
  onRetry: () => void
}

/** The product photo in place of the 3D garment, for when it cannot be shown. The fit panel beside it keeps working. */
export function TryOnFlat({ image, alt, unavailable, onRetry }: TryOnFlatProps) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center">
      <img src={image} alt={alt} className="min-h-0 w-auto max-w-full flex-1 object-contain" />
      <p role="status" className={`${KRAL_BODY} max-w-xs`}>
        {unavailable
          ? 'The 3D preview is not available on this device. The fit details still work.'
          : "3D preview didn't load. Check your connection, then try again. The fit details still work."}
      </p>
      {!unavailable && (
        <button type="button" onClick={onRetry} className={KRAL_SECONDARY}>
          Try again
        </button>
      )}
    </div>
  )
}
