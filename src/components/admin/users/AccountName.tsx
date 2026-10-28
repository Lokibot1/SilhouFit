import { fullName } from '../../../utils/accountQuery'
import { Avatar } from '../../ui/Avatar'

interface AccountNameProps {
  account: { firstName: string; lastName: string }
  /** The line under the name: an email or a username. */
  sub: string
  /** The cell is the row's open button (a customer row opens its drawer). */
  asButton?: boolean
}

/** The first column of every tab: avatar, name and a second line. */
export function AccountName({ account, sub, asButton }: AccountNameProps) {
  const name = fullName(account)
  const content = (
    <>
      <Avatar name={name} size="sm" />
      <span className="min-w-0">
        <span className="block truncate text-base font-semibold text-fg">{name}</span>
        <span className="block truncate text-base font-normal text-fg-muted @4xl:text-sm">{sub}</span>
      </span>
    </>
  )
  return asButton ? (
    <button type="button" aria-haspopup="dialog" className="flex min-h-11 w-full min-w-0 cursor-pointer items-center gap-3 rounded-xl text-left hover:text-chrome-strong">
      {content}
    </button>
  ) : (
    <div className="flex min-h-11 min-w-0 items-center gap-3">{content}</div>
  )
}
