import { useLayoutEffect } from 'react'

let users = 0

/** Marks <html> as the staff area while mounted, so the staff dark palette (index.css) also reaches portals such as modals and menus. Counted because the layout and its loading skeleton are mounted together. */
export function useStaffArea() {
  useLayoutEffect(() => {
    users += 1
    document.documentElement.dataset.area = 'staff'
    return () => {
      users -= 1
      if (users === 0) delete document.documentElement.dataset.area
    }
  }, [])
}
