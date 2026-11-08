import { useState } from 'react'
import { SilhouetteMark } from '../landing/SilhouetteMark'

/**
 * A product photo that falls back to a tile of the same size (the brand mark, named "photo unavailable") when there is no URL or it
 * fails to load, so a missing file never shows a broken-image icon or shifts the layout. `className` sizes both.
 */
export function PhotoImg({ src, alt, className, loading, tone }: { src: string | null | undefined; alt: string; className: string; loading?: 'lazy' | 'eager'; tone?: 'kral' }) {
  const kral = tone === 'kral'
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  if (!src || failedSrc === src) {
    return (
      <div role="img" aria-label={`${alt} (photo unavailable)`} className={`${className} flex items-center justify-center overflow-hidden ${kral ? 'bg-kral-porcelain dark:bg-kral-graphite' : 'bg-line'}`}>
        {/* The mark is drawn in a 200-unit box, so its own hairlines vanish at tile size: outline only, at a fixed 2px. */}
        <SilhouetteMark className={`w-1/2 max-w-10 ${kral ? 'text-kral-muted' : 'text-fg-muted'} [&>path]:[stroke-width:2px] [&>path]:[vector-effect:non-scaling-stroke] [&>path:last-of-type]:hidden`} />
      </div>
    )
  }
  return <img src={src} alt={alt} loading={loading} onError={() => setFailedSrc(src)} className={className} />
}
