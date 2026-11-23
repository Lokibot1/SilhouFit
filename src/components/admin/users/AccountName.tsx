import { useLayoutEffect, useRef, useState } from 'react'
import { fullName, titleCase } from '../../../utils/accountQuery'
import { Avatar } from '../../ui/Avatar'
import { Tooltip } from '../../ui/Tooltip'

/** One avatar colour per role, so a list reads as one group instead of a patchwork. */
export const ROLE_HUES = { customer: 210, staff: 150, admin: 30, superadmin: 280 } as const

interface AccountNameProps {
  role: keyof typeof ROLE_HUES
  account: { firstName: string; middleName?: string; lastName: string; suffix?: string }
}

/** The first column of every tab: avatar and name. A long name cuts with an ellipsis (never runs into the next column) and shows in full in a tooltip only when it was cut. */
export function AccountName({ account, role }: AccountNameProps) {
  const name = fullName({ ...account, firstName: titleCase(account.firstName), middleName: account.middleName && titleCase(account.middleName), lastName: titleCase(account.lastName) })
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
  }, [name])

  return (
    <div className="flex min-h-11 min-w-0 items-center gap-3">
      <Avatar name={name} size="sm" hue={ROLE_HUES[role]} />
      <Tooltip label={name} disabled={!cut} className="min-w-0 flex-1">
        <span ref={ref} className="block truncate text-base font-semibold text-fg">
          {name}
        </span>
      </Tooltip>
    </div>
  )
}
