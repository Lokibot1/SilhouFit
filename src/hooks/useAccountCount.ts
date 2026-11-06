import { useCallback, useEffect, useState } from 'react'
import { countAccounts, subscribeAccountChanges, type ManagedRole } from '../service/staffApi'
import { useSection } from './useSection'

/** How many accounts of a role are active and inactive, as one section: it loads on its own and again after an invite, deactivate or activate. `previous` is the last answer, to keep on screen meanwhile. */
export function useAccountCount(role: ManagedRole) {
  const [version, setVersion] = useState(0)

  useEffect(() => subscribeAccountChanges(() => setVersion((n) => n + 1)), [])

  const load = useCallback(
    async () => {
      const [active, inactive] = await Promise.all([countAccounts(role, true), countAccounts(role, false)])
      return { active, inactive }
    },
    // A new version is a new request, though it is not read inside.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [role, version],
  )
  return useSection(load)
}
