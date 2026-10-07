import { useRef, type PointerEvent } from 'react'

const EASE_BACK = 'transform 450ms cubic-bezier(0.16, 1, 0.3, 1)'

/** Leans a primary action toward the cursor. Pointer-fine and motion-allowed only. */
export function useMagnetic<T extends HTMLElement>(strength = 0.28) {
  const ref = useRef<T>(null)

  function handlePointerMove(event: PointerEvent<T>) {
    const el = ref.current
    if (
      !el ||
      !window.matchMedia('(pointer: fine) and (prefers-reduced-motion: no-preference)').matches
    )
      return
    const box = el.getBoundingClientRect()
    const x = (event.clientX - (box.left + box.width / 2)) * strength
    const y = (event.clientY - (box.top + box.height / 2)) * strength
    el.style.transition = 'none'
    el.style.transform = `translate3d(${x}px, ${y}px, 0)`
  }

  function handlePointerLeave() {
    const el = ref.current
    if (!el) return
    el.style.transition = EASE_BACK
    el.style.transform = ''
  }

  return { ref, handlePointerMove, handlePointerLeave }
}
