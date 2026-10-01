import { useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * Mounts its children only while the box is within about a screen of the
 * viewport. WebGL scenes inside it are created on approach and torn down once
 * far away, so a long page never holds more than a couple of GPU contexts --
 * and the ones below the fold cost nothing until they are needed.
 */
export function NearViewport({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [near, setNear] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(([entry]) => setNear(entry.isIntersecting), {
      rootMargin: '100% 0px',
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={ref} className={className}>
      {near && children}
    </div>
  )
}
