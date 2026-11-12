import { XIcon } from '../form/icons'

interface ReviewMediaTileProps {
  kind: 'photo' | 'video'
  name: string
  /** Missing for media saved in an earlier visit: the bytes are not kept in this demo. */
  url?: string
  /** "Photo 2: name" */
  label: string
  /** Shows a Remove button. */
  onRemove?: () => void
  disabled?: boolean
}

/** One photo or video of a review, as a square tile. */
export function ReviewMediaTile({ kind, name, url, label, onRemove, disabled }: ReviewMediaTileProps) {
  return (
    <li className={`relative min-w-0 overflow-hidden border border-kral-rule bg-kral-porcelain dark:bg-kral-graphite ${url ? 'aspect-square' : 'min-h-32'}`}>
      {!url ? (
        <p className={`font-kral-mono flex size-full flex-col justify-center gap-1 p-2 ${onRemove ? 'pt-12' : ''} text-base text-kral-muted md:text-xs`}>
          <span className="font-medium [overflow-wrap:anywhere] text-kral-fg">{name}</span>
          <span>Preview not kept in this demo</span>
        </p>
      ) : kind === 'photo' ? (
        <img src={url} alt={label} loading="lazy" className="size-full object-cover" />
      ) : (
        <video src={url} aria-label={label} controls muted preload="metadata" className="size-full object-cover" />
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
