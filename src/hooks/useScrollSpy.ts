import { useEffect, useRef, useState } from 'react'

/**
 * Tracks which of `count` registered items sits closest to the viewport
 * center, so a list can auto-expand the item currently in focus as the
 * page scrolls.
 */
export function useScrollSpy(count: number) {
  const itemRefs = useRef<(HTMLElement | null)[]>([])
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    let frame = 0

    function measure() {
      const viewportCenter = window.innerHeight / 2
      let closest = 0
      let closestDistance = Infinity

      itemRefs.current.forEach((el, index) => {
        if (!el) return
        const rect = el.getBoundingClientRect()
        const center = rect.top + rect.height / 2
        const distance = Math.abs(center - viewportCenter)
        if (distance < closestDistance) {
          closestDistance = distance
          closest = index
        }
      })

      setActiveIndex(closest)
    }

    function onScroll() {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    }

    measure()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      cancelAnimationFrame(frame)
    }
  }, [count])

  function setItemRef(index: number) {
    return (el: HTMLElement | null) => {
      itemRefs.current[index] = el
    }
  }

  return { activeIndex, setItemRef }
}
