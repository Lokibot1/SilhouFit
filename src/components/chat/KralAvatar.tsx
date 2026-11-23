const SIZES = { xs: 'size-5', sm: 'size-8', md: 'size-10' } as const

/** KRAL's avatar: the favicon logo, where a person's chat would show their initials. */
export function KralAvatar({ size }: { size: keyof typeof SIZES }) {
  return <img src="/favicon.svg" alt="KRAL" className={`${SIZES[size]} shrink-0 rounded-full object-cover`} />
}
