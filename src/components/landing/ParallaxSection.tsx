import type { ReactNode } from 'react'
import { TexturedBackdrop } from '../TexturedBackdrop'

interface ParallaxSectionProps {
  id?: string
  image: string
  speed?: number
  scrimClassName?: string
  children: ReactNode
  className?: string
}

export function ParallaxSection({
  id,
  image,
  speed = 0.15,
  scrimClassName,
  children,
  className = '',
}: ParallaxSectionProps) {
  return (
    <section
      id={id}
      className={`scroll-mt-28 relative overflow-hidden bg-canvas-sub ${className}`}
    >
      <TexturedBackdrop image={image} speed={speed} scrimClassName={scrimClassName} />
      <div className="relative">{children}</div>
    </section>
  )
}
