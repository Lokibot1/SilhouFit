import { useParallax } from '../hooks/useParallax'

// Fixed px, not a percentage of the section's own height: the parallax
// translate is bounded to viewportHeight * speed (see useParallax), so a
// buffer sized as a percentage of a short section could be outrun by a tall
// viewport. A flat buffer always covers the bounded travel + zoom, so the
// image never runs out of coverage and reveals the flat fallback behind it.
const BUFFER_PX = 320

export function TexturedBackdrop({
  image,
  speed = 0.15,
  scrimClassName = 'bg-bone/40 dark:bg-ink/50',
}: {
  image: string
  speed?: number
  scrimClassName?: string
}) {
  const parallaxRef = useParallax<HTMLDivElement>(speed)

  return (
    <div
      ref={parallaxRef}
      aria-hidden="true"
      style={{ top: -BUFFER_PX, bottom: -BUFFER_PX }}
      className="absolute inset-x-0 will-change-transform"
    >
      <img
        src={image}
        alt=""
        className="h-full w-full object-cover"
        loading="lazy"
      />
      <div className={`absolute inset-0 ${scrimClassName}`} />
    </div>
  )
}
