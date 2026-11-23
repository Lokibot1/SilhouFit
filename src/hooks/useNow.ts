import { useEffect, useState } from 'react'

/** The current time, refreshed every `ms` (a minute by default), so a "2m ago" label stays right. */
export function useNow(ms = 60_000) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), ms)
    return () => window.clearInterval(id)
  }, [ms])
  return now
}
