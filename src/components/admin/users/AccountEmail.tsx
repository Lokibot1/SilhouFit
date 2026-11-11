import { useLayoutEffect, useRef, useState } from 'react'
import { Tooltip } from '../../ui/Tooltip'

/** The email column: one line that cuts with an ellipsis, and shows the full address in a tooltip only when it was cut. */
export function AccountEmail({ email }: { email: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [cut, setCut] = useState(false)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setCut(el.scrollWidth > el.clientWidth)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [email])

  // One fixed structure: the tip is switched on or off, so the measured element is never replaced.
  return (
    <Tooltip label={email} disabled={!cut} className="w-full min-w-0">
      <span ref={ref} className="block min-w-0 truncate">
        {email}
      </span>
    </Tooltip>
  )
}
