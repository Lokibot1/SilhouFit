import { BotIcon } from '../../form/icons'

const SIZES = { sm: 'size-8', md: 'size-10' } as const

/** The SilhouFit Bot's avatar: a bot icon in a round chip, where a person's chat would show their initials. */
export function BotAvatar({ size }: { size: keyof typeof SIZES }) {
  return (
    <span aria-hidden="true" className={`${SIZES[size]} flex shrink-0 items-center justify-center rounded-full bg-fg/10 text-fg`}>
      <BotIcon size={20} />
    </span>
  )
}
