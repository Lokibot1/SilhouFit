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

export const KebabIcon = ({ size = 20, className }: IconProps) => (
  <Icon size={size} className={className}>
    <path d="M12 5h.01M12 12h.01M12 19h.01" strokeWidth={3} />
  </Icon>
)

export const PencilIcon = ({ size = 16, className }: IconProps) => (
  <Icon size={size} className={className}>
    <path d="M4 20h4L19 9a2.83 2.83 0 0 0-4-4L4 16v4ZM13.5 6.5l4 4" />
  </Icon>
)

export const TrashIcon = ({ size = 16, className }: IconProps) => (
  <Icon size={size} className={className}>
    <path d="M4 7h16M10 7V4.5h4V7M6 7l1 13h10l1-13M10 11v6M14 11v6" />
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

export const ChevronLeftIcon = ({ size = 16, className }: IconProps) => (
  <Icon size={size} className={className}>
    <path d="m15 6-6 6 6 6" />
  </Icon>
)

export const ChevronRightIcon = ({ size = 16, className }: IconProps) => (
  <Icon size={size} className={className}>
    <path d="m9 6 6 6-6 6" />
  </Icon>
)

export const MenuIcon = ({ size = 20, className }: IconProps) => (
  <Icon size={size} className={className}>
    <path d="M4 6h16M4 12h16M4 18h16" />
  </Icon>
)

export const MoonIcon = ({ size = 20, className }: IconProps) => (
  <Icon size={size} className={className}>
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
  </Icon>
)

export const BellIcon = ({ size = 20, className }: IconProps) => (
  <Icon size={size} className={className}>
    <path d="M6 9a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8" />
    <path d="M10.3 21a2 2 0 0 0 3.4 0" />
  </Icon>
)

export const SpinnerIcon = ({ size = 16, className = '' }: IconProps) => (
  <Icon size={size} className={`animate-spin ${className}`}>
    <path d="M12 3a9 9 0 1 0 9 9" />
  </Icon>
)

export const HeartIcon = ({ size = 20, className, filled = false }: IconProps & { filled?: boolean }) => (
  <Icon size={size} className={className}>
    <path
      d="M12 20s-7.5-4.6-9-9.2C2 7.6 4 5 6.8 5c2 0 3.6 1.1 5.2 3 1.6-1.9 3.2-3 5.2-3C20 5 22 7.6 21 10.8 19.5 15.4 12 20 12 20Z"
      fill={filled ? 'currentColor' : 'none'}
    />
  </Icon>
)

export const StarIcon = ({ size = 16, className }: IconProps) => (
  <Icon size={size} className={className}>
    <path d="m12 3 2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.8 6.6 19.7l1.1-6.1L3.2 9.4l6.1-.8L12 3Z" fill="currentColor" />
  </Icon>
)

export const GridIcon = ({ size = 20, className }: IconProps) => (
  <Icon size={size} className={className}>
    <rect x="4" y="4" width="7" height="7" rx="1" />
    <rect x="13" y="4" width="7" height="7" rx="1" />
    <rect x="4" y="13" width="7" height="7" rx="1" />
    <rect x="13" y="13" width="7" height="7" rx="1" />
  </Icon>
)

export const ListIcon = ({ size = 20, className }: IconProps) => (
  <Icon size={size} className={className}>
    <path d="M4 6h16M4 12h16M4 18h16" />
  </Icon>
)

export const FilterIcon = ({ size = 20, className }: IconProps) => (
  <Icon size={size} className={className}>
    <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="8" cy="17" r="2" />
  </Icon>
)

export const SearchIcon = ({ size = 20, className }: IconProps) => (
  <Icon size={size} className={className}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4.5 4.5" />
  </Icon>
)

export const CartIcon = ({ size = 20, className }: IconProps) => (
  <Icon size={size} className={className}>
    <path d="M3 4h2.5l2 11h10.5l2-8H7" />
    <circle cx="9.5" cy="19.5" r="1.25" />
    <circle cx="16.5" cy="19.5" r="1.25" />
  </Icon>
)

export const UserIcon = ({ size = 20, className }: IconProps) => (
  <Icon size={size} className={className}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
  </Icon>
)

export const SettingsIcon = ({ size = 20, className }: IconProps) => (
  <Icon size={size} className={className}>
    <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
    <circle cx="15" cy="7" r="2" />
    <circle cx="9" cy="17" r="2" />
  </Icon>
)

export const LogOutIcon = ({ size = 20, className }: IconProps) => (
  <Icon size={size} className={className}>
    <path d="M9 4H5v16h4" />
    <path d="M16 8l4 4-4 4M20 12H9" />
  </Icon>
)

export const BagIcon =({ size = 20, className }: IconProps) => (
  <Icon size={size} className={className}>
    <path d="M5 8h14l-1 12H6L5 8Z" />
    <path d="M9 8V7a3 3 0 0 1 6 0v1" />
  </Icon>
)

export const StoreIcon = ({ size = 20, className }: IconProps) => (
  <Icon size={size} className={className}>
    <path d="M3.5 9.5 5 4h14l1.5 5.5" />
    <path d="M3.5 9.5a2.75 2.75 0 0 0 5.5 0 3 3 0 0 0 6 0 2.75 2.75 0 0 0 5.5 0" />
    <path d="M5 12.5V20h14v-7.5M10 20v-4h4v4" />
  </Icon>
)

export const PaletteIcon = ({ size = 20, className }: IconProps) => (
  <Icon size={size} className={className}>
    <path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.8-.9 1.5-1.9-.3-1 .4-2.1 1.5-2.1H17a4 4 0 0 0 4-4c0-5-4-10-9-10Z" />
    <circle cx="7.5" cy="11" r="1" />
    <circle cx="10.5" cy="7" r="1" />
    <circle cx="15.5" cy="7.5" r="1" />
  </Icon>
)

export const RulerIcon = ({ size = 20, className }: IconProps) => (
  <Icon size={size} className={className}>
    <rect x="2.5" y="8" width="19" height="8" rx="1.5" />
    <path d="M7 8v3M11 8v4M15 8v3M19 8v4" />
  </Icon>
)

export const HashIcon = ({ size = 20, className }: IconProps) => (
  <Icon size={size} className={className}>
    <path d="M9 4 7 20M17 4l-2 16M4 9h16M3.5 15h16" />
  </Icon>
)

export const PlusIcon = ({ size = 16, className }: IconProps) => (
  <Icon size={size} className={className}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
)

export const MinusIcon = ({ size = 16, className }: IconProps) => (
  <Icon size={size} className={className}>
    <path d="M5 12h14" />
  </Icon>
)

export const SparkleIcon = ({ size = 20, className }: IconProps) => (
  <Icon size={size} className={className}>
    <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" />
    <path d="M19 16v4M17 18h4" />
  </Icon>
)

export const CameraIcon = ({ size = 20, className }: IconProps) => (
  <Icon size={size} className={className}>
    <path d="M4 8h3l1.5-2.5h7L17 8h3v11H4V8Z" />
    <circle cx="12" cy="13" r="3.5" />
  </Icon>
)

// A cube inside scan corners: the AR Fitting mark.
export const ArIcon = ({ size = 20, className }: IconProps) => (
  <Icon size={size} className={className}>
    <path d="M4 9V6a2 2 0 0 1 2-2h3M15 4h3a2 2 0 0 1 2 2v3M20 15v3a2 2 0 0 1-2 2h-3M9 20H6a2 2 0 0 1-2-2v-3" />
    <path d="M12 7.5l4 2.25v4.5L12 16.5l-4-2.25v-4.5L12 7.5Z" />
    <path d="M8.2 9.8L12 12l3.8-2.2M12 12v4.3" />
  </Icon>
)

export const BanknoteIcon = ({ size = 20, className }: IconProps) => (
  <Icon size={size} className={className}>
    <rect x="2.5" y="6" width="19" height="12" rx="2" />
    <circle cx="12" cy="12" r="2.5" />
    <path d="M6 12h.01M18 12h.01" />
  </Icon>
)

// A cart with an arrow in its basket: items going out.
export const CartArrowIcon = ({ size = 20, className }: IconProps) => (
  <Icon size={size} className={className}>
    <path d="M3 4h2.2L7 13.5h9.6L18.5 7H6.2" />
    <circle cx="9.5" cy="18.5" r="1.3" />
    <circle cx="16" cy="18.5" r="1.3" />
    <path d="M10.5 10.2h4.2M13.2 8.5l1.7 1.7-1.7 1.7" />
  </Icon>
)

// A parcel with a ribbon tab: one order.
export const BoxIcon = ({ size = 20, className }: IconProps) => (
  <Icon size={size} className={className}>
    <rect x="3" y="4" width="18" height="5" rx="1.5" />
    <path d="M4.5 9v9a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V9" />
    <path d="M10 4v5.5l2-1.3 2 1.3V4" />
  </Icon>
)

export const TrendUpIcon = ({ size = 16, className }: IconProps) => (
  <Icon size={size} className={className}>
    <path d="M3 17l6-6 4 4 8-8M15 7h6v6" />
  </Icon>
)

export const TrendDownIcon = ({ size = 16, className }: IconProps) => (
  <Icon size={size} className={className}>
    <path d="M3 7l6 6 4-4 8 8M15 17h6v-6" />
  </Icon>
)
