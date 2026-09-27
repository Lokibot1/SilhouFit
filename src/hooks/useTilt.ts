import { useRef, type MouseEvent } from 'react'

export function useTilt<T extends HTMLElement>(maxDegrees = 6) {
  const ref = useRef<T>(null)
  const reduced = () =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  function handleMouseMove(event: MouseEvent<T>) {
    const el = ref.current
    if (!el || reduced()) return
    const rect = el.getBoundingClientRect()
    const x = (event.clientX - rect.left) / rect.width - 0.5
    const y = (event.clientY - rect.top) / rect.height - 0.5
    el.style.transform = `rotateX(${(-y * maxDegrees).toFixed(2)}deg) rotateY(${(x * maxDegrees).toFixed(2)}deg)`
  }

  function handleMouseLeave() {
    const el = ref.current
    if (!el) return
    el.style.transform = 'rotateX(0deg) rotateY(0deg)'
  }

  return { ref, handleMouseMove, handleMouseLeave }
}
