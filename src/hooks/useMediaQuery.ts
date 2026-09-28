import { useEffect, useState } from 'react'

/**
 * Lets motion ranges differ by device class instead of shrinking a desktop
 * effect down. A phone gets shorter travel and fewer simultaneous layers, not
 * the same choreography at 40% scale.
 */
export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)

  useEffect(() => {
    const list = window.matchMedia(query)
    function update() {
      setMatches(list.matches)
    }

    update()
    list.addEventListener('change', update)
    return () => list.removeEventListener('change', update)
  }, [query])

  return matches
}
