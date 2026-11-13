import { useState } from 'react'
import { XIcon } from '../form/icons'

interface ReviewMediaTileProps {
  name: string
  url: string
  /** The photo's alt text: "Photo 2: name" */
  label: string
  /** Shows a Remove button. */
  onRemove?: () => void
  disabled?: boolean
}

/** One photo of a review, as a square tile. A photo that fails to load shows its name instead of a broken image. */
export function ReviewMediaTile({ name, url, label, onRemove, disabled }: ReviewMediaTileProps) {
  const [failedUrl, setFailedUrl] = useState<string>()
  return (
    <li className="relative aspect-square min-w-0 overflow-hidden border border-kral-rule bg-kral-porcelain dark:bg-kral-graphite">
      {failedUrl === url ? (
        <p role="img" aria-label={label} className={`font-kral-mono flex size-full flex-col justify-center gap-1 p-2 ${onRemove ? 'pt-12' : ''} text-base text-kral-muted md:text-xs`}>
          <span className="font-medium [overflow-wrap:anywhere] text-kral-fg">{name}</span>
          <span>Photo could not load</span>
        </p>
      ) : (
        <img src={url} alt={label} loading="lazy" onError={() => setFailedUrl(url)} className="size-full object-cover" />
      )}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          aria-label={`Remove ${name}`}
          className="kral-focus absolute top-0 right-0 flex size-11 cursor-pointer items-center justify-center bg-kral-bg/80 text-kral-fg hover:bg-kral-bg disabled:cursor-not-allowed disabled:opacity-50"
        >
          <XIcon />
        </button>
      )}
    </li>
  )
}
