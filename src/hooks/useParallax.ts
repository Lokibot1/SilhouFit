import { useEffect, useRef } from 'react'

/**
 * Drives a background layer's position and scale from its own distance to the
 * viewport center, so the "cinematic" settle/zoom works anywhere on a long
 * page, not just in the first viewport.
 */
export function useParallax<T extends HTMLElement>(speed: number, zoom = 0.06) {
  const ref = useRef<T>(null)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const el = ref.current
    if (!el) return

    let frame = 0

    function apply() {
      if (!el) return
      const rect = el.getBoundingClientRect()
      const viewportH = window.innerHeight
      const offset = rect.top + rect.height / 2 - viewportH / 2
      const progress = Math.max(-1, Math.min(1, offset / viewportH))
      // Built from the clamped progress, not the raw offset: offset keeps
      // growing the further a section sits from the viewport, which used to
      // push the translate past the backdrop's buffer and reveal the flat
      // fallback color behind it. Bounding to viewportH * speed keeps the
      // travel (and the buffer needed to cover it) constant everywhere.
      const translate = progress * viewportH * speed
      const scale = 1 + (1 - Math.abs(progress)) * zoom
      el.style.transform = `translate3d(0, ${translate}px, 0) scale(${scale})`
    }

    function onTick() {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(apply)
    }

    apply()
    window.addEventListener('scroll', onTick, { passive: true })
    window.addEventListener('resize', onTick)
    return () => {
      window.removeEventListener('scroll', onTick)
      window.removeEventListener('resize', onTick)
      cancelAnimationFrame(frame)
    }
  }, [speed, zoom])

  return ref
}
