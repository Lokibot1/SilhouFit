import { fullName, titleCase } from '../../../utils/accountQuery'
import { Avatar } from '../../ui/Avatar'

interface AccountNameProps {
  account: { firstName: string; middleName?: string; lastName: string; suffix?: string }
}

/** The first column of every tab: avatar and name. */
export function AccountName({ account }: AccountNameProps) {
  const name = fullName({ ...account, firstName: titleCase(account.firstName), middleName: account.middleName && titleCase(account.middleName), lastName: titleCase(account.lastName) })
  const content = (
    <>
      <Avatar name={name} size="sm" />
      <span className="min-w-0">
        <span className="block text-base font-semibold whitespace-nowrap text-fg">{name}</span>
      </span>
    </>
  )
  return <div className="flex min-h-11 min-w-0 items-center gap-3">{content}</div>
}
