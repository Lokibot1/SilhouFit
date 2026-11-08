import { useState } from 'react'
import { UserIcon } from '../form/icons'

const SIZES = { sm: 'size-8 text-xs', md: 'size-10 text-sm', lg: 'size-14 text-base' } as const

function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return ''
  return (words[0][0] + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase()
}

// Same name, same colour. Fixed saturation and lightness keep white initials above 4.5:1.
function hueFor(name: string) {
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) % 360
  return hash
}

interface AvatarProps {
  name: string
  src?: string
  /** Shown instead of the letters taken from `name`, for names that carry a suffix. */
  initials?: string
  size?: keyof typeof SIZES
  /** 'kral' squares the avatar for the KRAL pages. */
  tone?: 'kral'
}

export function Avatar({ name, src, initials: given, size = 'md', tone }: AvatarProps) {
  const [failedSrc, setFailedSrc] = useState<string>()
  const letters = given || initials(name)
  const shape = tone === 'kral' ? 'rounded-none' : 'rounded-full'

  if (src && failedSrc !== src) {
    return (
      <img
        src={src}
        alt={name}
        onError={() => setFailedSrc(src)}
        className={`${SIZES[size]} shrink-0 ${shape} object-cover`}
      />
    )
  }

  return (
    <span
      role="img"
      aria-label={name || 'Account'}
      className={`${SIZES[size]} font-ui flex shrink-0 items-center justify-center ${shape} font-semibold text-white`}
      style={{ backgroundColor: `hsl(${hueFor(name)} 45% 32%)` }}
    >
      {letters || <UserIcon />}
    </span>
  )
}
