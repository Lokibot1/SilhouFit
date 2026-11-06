import { fullName } from '../../../utils/accountQuery'
import { Avatar } from '../../ui/Avatar'

interface AccountNameProps {
  account: { firstName: string; middleName?: string; lastName: string; suffix?: string }
}

/** The first column of every tab: avatar and name. */
export function AccountName({ account }: AccountNameProps) {
  const name = fullName(account)
  const content = (
    <>
      <Avatar name={name} size="sm" />
      <span className="min-w-0">
        <span className="block truncate text-base font-semibold text-fg">{name}</span>
      </span>
    </>
  )
  return <div className="flex min-h-11 min-w-0 items-center gap-3">{content}</div>
}
