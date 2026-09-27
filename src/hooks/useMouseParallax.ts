import { useRef, type MouseEvent } from 'react'

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function useMouseParallax<T extends HTMLElement>(strength = 16) {
  const ref = useRef<T>(null)

  function handleMouseMove(event: MouseEvent<HTMLElement>) {
    const el = ref.current
    if (!el || reduced()) return
    const rect = event.currentTarget.getBoundingClientRect()
    const x = (event.clientX - rect.left) / rect.width - 0.5
    const y = (event.clientY - rect.top) / rect.height - 0.5
    el.style.setProperty('--parallax-x', `${(-x * strength).toFixed(1)}px`)
    el.style.setProperty('--parallax-y', `${(-y * strength).toFixed(1)}px`)
  }

  function handleMouseLeave() {
    const el = ref.current
    if (!el) return
    el.style.setProperty('--parallax-x', '0px')
    el.style.setProperty('--parallax-y', '0px')
  }

  return { ref, handleMouseMove, handleMouseLeave }
}
