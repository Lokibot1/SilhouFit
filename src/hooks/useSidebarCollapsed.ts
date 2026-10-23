import { useCallback, useState } from 'react'

const KEY = 'silhoufit.sidebar.collapsed'

function read() {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

/** The sidebar's collapsed state, remembered per browser. Storage may be blocked, so it falls back to expanded. */
export function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(read)
  const toggle = useCallback(() => {
    setCollapsed((current) => {
      try {
        localStorage.setItem(KEY, current ? '0' : '1')
      } catch {
        // Not remembered, still works for this visit.
      }
      return !current
    })
  }, [])
  return [collapsed, toggle] as const
}
