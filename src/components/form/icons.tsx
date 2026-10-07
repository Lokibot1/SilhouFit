import type { ReactNode } from 'react'

// Outline icons on a 24px grid. Two rendered sizes only: 20 (field icons) and 16 (inline).
function Icon({ size, className = '', children }: { size: 16 | 20; className?: string; children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      {children}
    </svg>
  )
}

interface IconProps {
  size?: 16 | 20
  className?: string
}

export const MailIcon = ({ size = 20, className }: IconProps) => (
  <Icon size={size} className={className}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m4 7 8 6 8-6" />
  </Icon>
)

export const LockIcon = ({ size = 20, className }: IconProps) => (
  <Icon size={size} className={className}>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </Icon>
)

export const EyeIcon = ({ size = 20, className }: IconProps) => (
  <Icon size={size} className={className}>
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
)

export const EyeOffIcon = ({ size = 20, className }: IconProps) => (
  <Icon size={size} className={className}>
    <path d="M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.7 8.4 2 12 2 12s3.6 7 10 7a9.7 9.7 0 0 0 4.1-.9" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M3 3l18 18" />
  </Icon>
)

export const XIcon = ({ size = 16, className }: IconProps) => (
  <Icon size={size} className={className}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icon>
)

export const CheckIcon = ({ size = 16, className }: IconProps) => (
  <Icon size={size} className={className}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Icon>
)

export const AlertIcon = ({ size = 16, className }: IconProps) => (
  <Icon size={size} className={className}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5v5M12 16.2v.1" />
  </Icon>
)

export const ChevronDownIcon = ({ size = 16, className }: IconProps) => (
  <Icon size={size} className={className}>
    <path d="m6 9 6 6 6-6" />
  </Icon>
)

export const SpinnerIcon = ({ size = 16, className = '' }: IconProps) => (
  <Icon size={size} className={`animate-spin ${className}`}>
    <path d="M12 3a9 9 0 1 0 9 9" />
  </Icon>
)
